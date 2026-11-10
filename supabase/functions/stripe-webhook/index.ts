// Stripe → Supabase: when a payment completes, record the order,
// reduce stock, update the customer's CRM record and email a receipt.
import Stripe from "npm:stripe@16";
import { db, sendEmail, SITE_URL, LOGO_URL, ORDER_NOTIFY_TO, logEvent } from "../_shared/email.ts";
import { orderConfirmedEmail, newOrderAlertEmail } from "../_shared/templates.js";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, WEBHOOK_SECRET, undefined, Stripe.createSubtleCryptoProvider());
  } catch (e) {
    return new Response(`Bad signature: ${(e as Error).message}`, { status: 400 });
  }

  console.log(`Stripe event ${event.type} (${event.id})`);

  if (event.type === "checkout.session.completed") {
   try {
    const s = event.data.object as Stripe.Checkout.Session;
    console.log(`Session ${s.id}: payment_status=${s.payment_status}, email=${s.customer_details?.email}, metadata=${s.metadata?.items}`);

    // Idempotency: Stripe can retry webhooks
    const { data: existing, error: exErr } = await db.from("orders").select("id").eq("stripe_session_id", s.id).maybeSingle();
    if (exErr) throw new Error("Reading orders failed: " + exErr.message);
    if (existing) { console.log("Already processed", existing.id); return new Response("already processed"); }

    const meta: { id: string; size: string; qty: number; b?: number }[] = JSON.parse(s.metadata?.items ?? "[]");
    const offerToken = s.metadata?.offer || null;
    let offerPrice: number | null = null;
    if (offerToken) {
      const { data: o } = await db.from("offers").select("price").eq("token", offerToken).maybeSingle();
      if (o) offerPrice = Number(o.price);
    }
    const { data: products, error: prErr } = await db.from("products").select("id,name,price,lead_time").in("id", meta.map((m) => m.id));
    if (prErr) throw new Error("Reading products failed: " + prErr.message);
    const items = meta.map((m) => {
      const p = products?.find((x) => x.id === m.id);
      return {
        id: m.id, name: p?.name ?? m.id, size: m.size, qty: m.qty, price: offerPrice ?? Number(p?.price ?? 0),
        ...(m.b ? { backorder: true, lead_time: (p?.lead_time || "").trim() || "5–8 business days" } : {}),
      };
    });

    for (const m of meta) {
      const { error } = await db.rpc("decrement_stock", { p_id: m.id, p_size: m.size, p_qty: m.qty });
      if (error) console.error("Stock update failed", m, error.message);
    }

    const email = (s.customer_details?.email ?? "").toLowerCase();
    // Newer Stripe API versions keep the delivery details under collected_information
    const ship = (s as any).collected_information?.shipping_details ?? (s as any).shipping_details;
    const name = ship?.name || s.customer_details?.name || "";
    const addr = ship?.address ?? s.customer_details?.address;
    const address = addr ? [addr.line1, addr.line2, addr.city, addr.postal_code].filter(Boolean).join(", ") : "";
    const total = (s.amount_total ?? 0) / 100;
    const orderId = "ORD-" + s.id.slice(-8).toUpperCase();

    const { error: orderErr } = await db.from("orders").insert({
      id: orderId, stripe_session_id: s.id, customer_email: email, customer_name: name,
      shipping_address: address, items, total, status: "paid", offer_token: offerToken,
    });
    if (orderErr) throw new Error("Saving order failed: " + orderErr.message);
    console.log("Order saved", orderId, email, total);
    if (offerToken) {
      const { error: ofErr } = await db.from("offers").update({ status: "used", used_at: new Date().toISOString(), order_id: orderId })
        .eq("token", offerToken);
      if (ofErr) console.error("Marking offer used failed", ofErr.message); else console.log("Offer used", offerToken);
    }

    // CRM upsert
    const { data: c } = await db.from("customers").select("*").eq("email", email).maybeSingle();
    if (c) {
      const { error: cuErr } = await db.from("customers").update({
        name: c.name || name, phone: c.phone || s.customer_details?.phone || "",
        total_spent: Number(c.total_spent) + total, order_count: c.order_count + 1,
        tags: (c.tags || []).includes("customer") ? c.tags : [...(c.tags || []), "customer"],
      }).eq("email", email);
      if (cuErr) console.error("Customer update failed", cuErr.message);
    } else {
      const { error: ciErr } = await db.from("customers").insert({ email, name, phone: s.customer_details?.phone ?? "", total_spent: total, order_count: 1, tags: ["customer"] });
      if (ciErr) console.error("Customer insert failed", ciErr.message);
    }

    // Receipt email (Resend if RESEND_API_KEY is set, otherwise Brevo)
    if (email) {
      const { subject, html } = orderConfirmedEmail({ orderId, name, items, total, address, shopUrl: SITE_URL, logoUrl: LOGO_URL });
      await sendEmail({ to: email, name, subject, html, kind: "transactional", tags: ["order"] })
        .then(async () => { console.log("Order email sent to", email); await logEvent("orders", orderId, orderId, `Order confirmation emailed to ${email}`); })
        .catch((e) => console.error("Order email failed", e));
    }

    // "New order" alert to the shop
    const alert = newOrderAlertEmail({
      orderId, name, email, phone: s.customer_details?.phone ?? "", address, items, total,
      friendsFamily: !!offerToken, adminUrl: SITE_URL + "admin.html", shopUrl: SITE_URL, logoUrl: LOGO_URL,
    });
    for (const to of ORDER_NOTIFY_TO) {
      await sendEmail({ to, subject: alert.subject, html: alert.html, kind: "transactional", tags: ["order-alert"], replyTo: email || undefined })
        .then(async () => { console.log("Order alert sent to", to); await logEvent("orders", orderId, orderId, `New-order alert sent to ${to}`); })
        .catch((e) => console.error("Order alert failed", to, e));
    }
   } catch (e) {
    console.error("Webhook processing failed:", e);
    return new Response("error: " + (e as Error).message, { status: 500 }); // Stripe will retry
   }
  }

  // Refund made in the Stripe dashboard → mark the order (full refund = status "refunded")
  if (event.type === "charge.refunded") {
    try {
      const ch = event.data.object as Stripe.Charge;
      const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
      if (!pi) return new Response("no payment intent");
      const sessions = await stripe.checkout.sessions.list({ payment_intent: pi, limit: 1 });
      const sid = sessions.data[0]?.id;
      const { data: order } = sid ? await db.from("orders").select("id,total,status").eq("stripe_session_id", sid).maybeSingle() : { data: null };
      if (!order) { console.log("Refund for a payment with no shop order", pi); return new Response("no matching order"); }
      const refunded = (ch.amount_refunded ?? 0) / 100;
      const full = ch.refunded || refunded >= Number(order.total);
      await db.from("orders").update({ refunded_amount: refunded, ...(full ? { status: "refunded" } : {}) }).eq("id", order.id);
      await logEvent("orders", order.id, order.id, full ? `Refunded in full in Stripe (£${refunded.toFixed(2)})` : `Part refund in Stripe: £${refunded.toFixed(2)} of £${Number(order.total).toFixed(2)}`);
      console.log("Refund recorded", order.id, refunded, full ? "full" : "partial");
    } catch (e) {
      console.error("Refund processing failed:", e);
      return new Response("error: " + (e as Error).message, { status: 500 });
    }
  }

  return new Response("ok");
});
