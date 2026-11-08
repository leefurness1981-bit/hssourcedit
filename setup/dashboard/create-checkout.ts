// @ts-nocheck
// create-checkout — single-file version for the Supabase dashboard editor (generated from supabase/functions/create-checkout).
import Stripe from "npm:stripe@16";
import { createClient } from "npm:@supabase/supabase-js@2";

// ---------- function ----------
// Creates a Stripe Checkout Session from the shopper's bag.
// Prices and stock are always re-checked on the server — never trusted from the browser.

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SHIPPING = Number(Deno.env.get("SHIPPING_COST") ?? "4.95");
const FREE_MIN_ITEMS = Number(Deno.env.get("FREE_SHIPPING_MIN_ITEMS") ?? "2"); // free delivery with this many items or more
const CURRENCY = (Deno.env.get("CURRENCY") ?? "gbp").toLowerCase();
const ALLOWED_ORIGIN = Deno.env.get("SITE_ORIGIN") ?? "*"; // e.g. https://yourname.github.io
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/?$/, "/");
// Product photos for Stripe's page must be full web addresses
const imageUrl = (img: string) => img?.startsWith("http") ? img : img && !img.startsWith("data:") && SITE_URL !== "/" ? SITE_URL + img.replace(/^\/+/, "") : "";

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { items, email, success_url, cancel_url, offer: offerToken } = await req.json();
    if (!Array.isArray(items) || !items.length || items.length > 30) return json({ error: "Your bag is empty" }, 400);

    // ---- Friends & family offer: one product, set price, one order ----
    let offer: any = null;
    if (offerToken) {
      const { data: o, error: oErr } = await db.from("offers").select("*").eq("token", String(offerToken)).maybeSingle();
      if (oErr) throw oErr;
      if (!o || o.status === "cancelled") return json({ error: "This offer is no longer available." }, 400);
      if (o.status === "used") return json({ error: "This offer has already been used." }, 409);
      if (o.expires_at && new Date(o.expires_at) < new Date()) return json({ error: "This offer has expired." }, 409);
      if (items.length !== 1 || items[0].id !== o.product_id) return json({ error: "This offer is for one specific item only." }, 400);
      if ((parseInt(items[0].qty, 10) || 1) > o.max_qty) return json({ error: `This offer is for up to ${o.max_qty} item${o.max_qty > 1 ? "s" : ""}.` }, 400);
      // If a previous checkout for this offer is still open, close it so the link can only be paid once
      if (o.status === "reserved" && o.stripe_session_id) {
        try { await stripe.checkout.sessions.expire(o.stripe_session_id); }
        catch (_e) {
          const old = await stripe.checkout.sessions.retrieve(o.stripe_session_id).catch(() => null);
          if (old?.payment_status === "paid") return json({ error: "This offer has already been used." }, 409);
        }
      }
      offer = o;
    }

    const ids = [...new Set(items.map((i: any) => String(i.id)))];
    let pq = db.from("products").select("*").in("id", ids);
    if (!offer) pq = pq.eq("active", true); // an offer can be for a product that's hidden from the shop
    const { data: products, error } = await pq;
    if (error) throw error;

    let subtotal = 0, itemCount = 0, deliveryCost = 0;
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    // b = 1 marks a line that is (partly) a pre-order
    const meta: { id: string; size: string; qty: number; b?: number }[] = [];

    for (const raw of items) {
      const qty = Math.max(1, Math.min(offer ? offer.max_qty : 10, parseInt(raw.qty, 10) || 1));
      const p = products!.find((x) => x.id === raw.id);
      if (!p) return json({ error: "A product in your bag is no longer available" }, 400);
      if (!p.sizes || !(raw.size in p.sizes)) return json({ error: `Sorry — ${p.name} doesn't come in ${raw.size}` }, 400);
      const inStock = Math.max(0, Number(p.sizes[raw.size] ?? 0));
      const preorder = qty > inStock;
      if (preorder && p.allow_backorder === false) return json({ error: `Sorry — ${p.name} (${raw.size}) only has ${inStock} left` }, 409);
      const lead = (p.lead_time || "").trim() || "5–8 business days";
      const unit = offer ? Number(offer.price) : Number(p.price);
      subtotal += unit * qty;
      itemCount += qty;
      // one delivery charge per order: the highest delivery cost of the items in it
      deliveryCost = Math.max(deliveryCost, p.shipping_cost != null ? Number(p.shipping_cost) : SHIPPING);
      meta.push({ id: p.id, size: raw.size, qty, ...(preorder ? { b: 1 } : {}) });
      line_items.push({
        quantity: qty,
        price_data: {
          currency: CURRENCY,
          unit_amount: Math.round(unit * 100),
          product_data: {
            name: `${p.name} — ${raw.size}${offer ? " (friends & family price)" : ""}`,
            images: imageUrl(p.image) ? [imageUrl(p.image)] : [],
            ...(preorder ? { description: inStock > 0 ? `${inStock} in stock, ${qty - inStock} ships in ${lead}` : `Ships in ${lead}` } : {}),
          },
        },
      });
    }

    const shippingFree = itemCount >= FREE_MIN_ITEMS || deliveryCost <= 0;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      customer_email: (offer ? offer.email : email) || undefined,
      success_url, cancel_url,
      shipping_address_collection: { allowed_countries: ["GB"] },
      phone_number_collection: { enabled: true },
      allow_promotion_codes: !offer, // offers can't be combined with discount codes
      ...(offer ? { expires_at: Math.floor(Date.now() / 1000) + 30 * 60 } : {}), // unpaid offer checkouts close after 30 min
      shipping_options: [{
        shipping_rate_data: {
          display_name: shippingFree ? "Free UK delivery" : "UK standard delivery",
          type: "fixed_amount",
          fixed_amount: { amount: shippingFree ? 0 : Math.round(deliveryCost * 100), currency: CURRENCY },
          delivery_estimate: { minimum: { unit: "business_day", value: 2 }, maximum: { unit: "business_day", value: 4 } },
        },
      }],
      metadata: { items: JSON.stringify(meta).slice(0, 500), ...(offer ? { offer: offer.token } : {}) }, // Stripe metadata values max 500 chars
    });

    if (offer) {
      await db.from("offers").update({
        status: "reserved", stripe_session_id: session.id, reserved_until: new Date(Date.now() + 31 * 60000).toISOString(),
      }).eq("token", offer.token).neq("status", "used");
    }

    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: "Checkout is unavailable right now. Please try again." }, 500);
  }
});
