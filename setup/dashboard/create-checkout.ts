// @ts-nocheck
// create-checkout — single-file version for the Supabase dashboard editor (generated from supabase/functions/create-checkout).
import { createClient } from "npm:@supabase/supabase-js@2";

// ---------- shared: email helpers ----------
// Email sending + shared helpers for all functions.
// Marketing (welcome, campaigns) always goes through Brevo.
// Order emails go through Brevo too — unless RESEND_API_KEY is set,
// in which case they use Resend so a big campaign can never use up the
// Brevo daily allowance and block a customer's receipt.

const env = (k: string, d = "") => Deno.env.get(k) ?? d;

const SITE_URL = env("SITE_URL", "https://example.com/").replace(/\/?$/, "/");
const LOGO_URL = SITE_URL + "images/logo.png";
const FROM_NAME = env("EMAIL_FROM_NAME", "HS Sourced It");
const FROM_ORDERS = env("EMAIL_FROM_ORDERS", "orders@example.com");
const FROM_MARKETING = env("EMAIL_FROM_MARKETING", FROM_ORDERS);
const REPLY_TO = env("REPLY_TO", FROM_ORDERS);
/** Where "new order" alerts go (defaults to the shop inbox). Comma-separate for several addresses. */
/** The shop's main inbox (hello@) — personal messages to customers are sent from here. */
const SHOP_INBOX = REPLY_TO;
const ORDER_NOTIFY_TO = env("ORDER_NOTIFY_TO", REPLY_TO).split(",").map((s) => s.trim()).filter(Boolean);
const BREVO_KEY = env("BREVO_API_KEY");
const RESEND_KEY = env("RESEND_API_KEY");

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

const cors = {
  "Access-Control-Allow-Origin": env("SITE_ORIGIN", "*"),
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** Plain-text version of an HTML email (sent alongside the HTML — helps spam filters trust it). */
function htmlToText(html: string): string {
  const decode = (t: string) => t
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&pound;/g, "£");
  let t = html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<div style="display:none[\s\S]*?<\/div>/i, "")
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, "$1\n")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
      const label = decode(inner.replace(/<[^>]+>/g, "").trim());
      return !label || label === href ? href : `${label}: ${href}`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|h3|div|tr|table)>/gi, "\n\n")
    .replace(/<\/td>/gi, "  ")
    .replace(/<[^>]+>/g, "");
  t = decode(t).split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

type Mail = {
  to: string; name?: string; subject: string; html: string; replyTo?: string; from?: string;
  kind: "marketing" | "transactional"; headers?: Record<string, string>; tags?: string[];
};

class SendLimitError extends Error {}

/** Send one email. Throws SendLimitError when the provider's daily/monthly limit is hit. */
async function sendEmail(m: Mail): Promise<void> {
  const useResend = m.kind === "transactional" && RESEND_KEY;
  const from = m.from || (m.kind === "marketing" ? FROM_MARKETING : FROM_ORDERS);

  if (useResend) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${FROM_NAME} <${from}>`, to: m.to, reply_to: m.replyTo || REPLY_TO, subject: m.subject, html: m.html, text: htmlToText(m.html), headers: m.headers }),
    });
    if (res.status === 429) throw new SendLimitError("Resend sending limit reached");
    if (!res.ok) throw new Error(`Resend: ${await res.text()}`);
    return;
  }

  if (!BREVO_KEY) throw new Error("BREVO_API_KEY is not set");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_KEY, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: from },
      to: [{ email: m.to, ...(m.name ? { name: m.name } : {}) }],
      replyTo: m.replyTo ? { email: m.replyTo } : { email: REPLY_TO, name: FROM_NAME },
      subject: m.subject, htmlContent: m.html, textContent: htmlToText(m.html), headers: m.headers, tags: m.tags,
    }),
  });
  if (res.ok) return;
  const text = await res.text();
  if (res.status === 429 || /limit|quota|credits/i.test(text)) throw new SendLimitError("Brevo daily sending limit reached");
  throw new Error(`Brevo: ${text}`);
}

/** Add / update a contact in Brevo (optional — only if BREVO_LIST_ID is set). */
async function syncBrevoContact(email: string, name = "", subscribed = true) {
  const listId = Number(env("BREVO_LIST_ID", "0"));
  if (!BREVO_KEY || !listId) return;
  await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: { "api-key": BREVO_KEY, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      email, updateEnabled: true, emailBlacklisted: !subscribed,
      attributes: name ? { FIRSTNAME: name.split(" ")[0] } : {},
      ...(subscribed ? { listIds: [listId] } : { unlinkListIds: [listId] }),
    }),
  }).catch(console.error);
}

/** Signed unsubscribe link for marketing emails. */
async function unsubscribeUrl(email: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("UNSUBSCRIBE_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email.toLowerCase()));
  const t = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  return `${env("SUPABASE_URL")}/functions/v1/unsubscribe?e=${encodeURIComponent(email.toLowerCase())}&t=${t}`;
}

/** Marketing email with unsubscribe link + one-click unsubscribe headers (needed by Gmail/Yahoo). */
async function sendMarketing(to: string, name: string, subject: string, html: string, tags: string[] = []) {
  const link = await unsubscribeUrl(to);
  await sendEmail({
    to, name, subject, kind: "marketing", tags,
    html: html.replace("{{unsubscribe}}", `<a href="${link}" style="color:#999">Unsubscribe</a>`),
    headers: { "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
}

/** Returns the admin's email, or null if the caller isn't a signed-in admin. */
async function requireAdmin(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: { user } } = await db.auth.getUser(jwt);
  if (!user?.email) return null;
  const { data } = await db.from("admins").select("email").ilike("email", user.email).maybeSingle();
  return data ? user.email : null;
}

// ---------- Activity log helpers (audit_log table, see migration 0009) ----------
/** Record something that isn't a table change, e.g. an email being sent. Never throws. */
async function logEvent(table: string, recordId: string, label: string, summary: string, details: Record<string, unknown> = {}, actor = "system") {
  try { await db.from("audit_log").insert({ actor, table_name: table, record_id: recordId, label, action: "event", summary, changes: details }); }
  catch (e) { console.error("logEvent failed", e); }
}
/** Changes made by these server functions are logged as 'system'; when an admin asked for them, put their email on the rows just written. */
async function claimAudit(table: string, recordId: string, actor: string | null) {
  if (!actor) return;
  try {
    await db.from("audit_log").update({ actor }).eq("table_name", table).eq("record_id", recordId).eq("actor", "system")
      .gte("at", new Date(Date.now() - 60000).toISOString());
  } catch (e) { console.error("claimAudit failed", e); }
}

// ---------- function ----------
// Creates a Stripe Checkout Session from the shopper's bag.
// Prices and stock are always re-checked on the server — never trusted from the browser.
import Stripe from "npm:stripe@16";
import { createClient } from "npm:@supabase/supabase-js@2";

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
