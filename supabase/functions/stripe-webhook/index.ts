// Stripe → Supabase: when a payment completes, record the order,
// reduce stock, update the customer's CRM record and email a receipt.
import Stripe from "npm:stripe@16";
import { db, sendEmail, SITE_URL, LOGO_URL } from "../_shared/email.ts";
import { orderConfirmedEmail } from "../_shared/templates.js";

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

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;

    // Idempotency: Stripe can retry webhooks
    const { data: existing } = await db.from("orders").select("id").eq("stripe_session_id", s.id).maybeSingle();
    if (existing) return new Response("already processed");

    const meta: { id: string; size: string; qty: number }[] = JSON.parse(s.metadata?.items ?? "[]");
    const { data: products } = await db.from("products").select("id,name,price").in("id", meta.map((m) => m.id));
    const items = meta.map((m) => {
      const p = products?.find((x) => x.id === m.id);
      return { id: m.id, name: p?.name ?? m.id, size: m.size, qty: m.qty, price: Number(p?.price ?? 0) };
    });

    for (const m of meta) {
      await db.rpc("decrement_stock", { p_id: m.id, p_size: m.size, p_qty: m.qty });
    }

    const email = (s.customer_details?.email ?? "").toLowerCase();
    const name = s.customer_details?.name ?? "";
    const addr = s.shipping_details?.address ?? s.customer_details?.address;
    const address = addr ? [addr.line1, addr.line2, addr.city, addr.postal_code].filter(Boolean).join(", ") : "";
    const total = (s.amount_total ?? 0) / 100;
    const orderId = "ORD-" + s.id.slice(-8).toUpperCase();

    await db.from("orders").insert({
      id: orderId, stripe_session_id: s.id, customer_email: email, customer_name: name,
      shipping_address: address, items, total, status: "paid",
    });

    // CRM upsert
    const { data: c } = await db.from("customers").select("*").eq("email", email).maybeSingle();
    if (c) {
      await db.from("customers").update({
        name: c.name || name, phone: c.phone || s.customer_details?.phone || "",
        total_spent: Number(c.total_spent) + total, order_count: c.order_count + 1,
      }).eq("email", email);
    } else {
      await db.from("customers").insert({ email, name, phone: s.customer_details?.phone ?? "", total_spent: total, order_count: 1, tags: ["customer"] });
    }

    // Receipt email (Resend if RESEND_API_KEY is set, otherwise Brevo)
    if (email) {
      const { subject, html } = orderConfirmedEmail({ orderId, name, items, total, address, shopUrl: SITE_URL, logoUrl: LOGO_URL });
      await sendEmail({ to: email, name, subject, html, kind: "transactional", tags: ["order"] }).catch(console.error);
    }
  }

  return new Response("ok");
});
