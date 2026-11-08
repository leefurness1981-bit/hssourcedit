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
const FREE_OVER = Number(Deno.env.get("FREE_SHIPPING_OVER") ?? "75");
const CURRENCY = (Deno.env.get("CURRENCY") ?? "gbp").toLowerCase();
const ALLOWED_ORIGIN = Deno.env.get("SITE_ORIGIN") ?? "*"; // e.g. https://yourname.github.io

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
    const { items, email, success_url, cancel_url } = await req.json();
    if (!Array.isArray(items) || !items.length || items.length > 30) return json({ error: "Your bag is empty" }, 400);

    const ids = [...new Set(items.map((i: any) => String(i.id)))];
    const { data: products, error } = await db.from("products").select("*").in("id", ids).eq("active", true);
    if (error) throw error;

    let subtotal = 0;
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    // b = 1 marks a line that is (partly) a pre-order
    const meta: { id: string; size: string; qty: number; b?: number }[] = [];

    for (const raw of items) {
      const qty = Math.max(1, Math.min(10, parseInt(raw.qty, 10) || 1));
      const p = products!.find((x) => x.id === raw.id);
      if (!p) return json({ error: "A product in your bag is no longer available" }, 400);
      if (!p.sizes || !(raw.size in p.sizes)) return json({ error: `Sorry — ${p.name} doesn't come in ${raw.size}` }, 400);
      const inStock = Math.max(0, Number(p.sizes[raw.size] ?? 0));
      const preorder = qty > inStock;
      if (preorder && p.allow_backorder === false) return json({ error: `Sorry — ${p.name} (${raw.size}) only has ${inStock} left` }, 409);
      const lead = (p.lead_time || "").trim() || "5–8 business days";
      subtotal += Number(p.price) * qty;
      meta.push({ id: p.id, size: raw.size, qty, ...(preorder ? { b: 1 } : {}) });
      line_items.push({
        quantity: qty,
        price_data: {
          currency: CURRENCY,
          unit_amount: Math.round(Number(p.price) * 100),
          product_data: {
            name: `${p.name} — ${raw.size}`,
            images: p.image?.startsWith("http") ? [p.image] : [],
            ...(preorder ? { description: inStock > 0 ? `${inStock} in stock, ${qty - inStock} on pre-order: ships in ${lead}` : `Pre-order: ships in ${lead}` } : {}),
          },
        },
      });
    }

    const shippingFree = subtotal >= FREE_OVER;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      customer_email: email || undefined,
      success_url, cancel_url,
      shipping_address_collection: { allowed_countries: ["GB"] },
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      shipping_options: [{
        shipping_rate_data: {
          display_name: shippingFree ? "Free UK delivery" : "UK standard delivery",
          type: "fixed_amount",
          fixed_amount: { amount: shippingFree ? 0 : Math.round(SHIPPING * 100), currency: CURRENCY },
          delivery_estimate: { minimum: { unit: "business_day", value: 2 }, maximum: { unit: "business_day", value: 4 } },
        },
      }],
      metadata: { items: JSON.stringify(meta).slice(0, 500) }, // Stripe metadata values max 500 chars
    });

    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: "Checkout is unavailable right now. Please try again." }, 500);
  }
});
