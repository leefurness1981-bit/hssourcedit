// @ts-nocheck
// review — single-file version for the Supabase dashboard editor (generated from supabase/functions/review).
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
// Public: the review page (review.html?t=…) uses this to
//   - look up an order from its private review link: { token }
//   - save the customer's reviews: { token, name, reviews: [{ product_id, rating, body }] }
// The link is only emailed once an order is marked delivered, so only real buyers can review,
// and only the products in their own order. Sending it again updates their earlier review.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({}));
  const token = body.token;
  if (!token || typeof token !== "string" || token.length > 64) return json({ valid: false, reason: "This review link isn't valid." });

  const { data: order, error } = await db.from("orders").select("id,customer_name,items,status").eq("review_token", token).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!order) return json({ valid: false, reason: "This review link isn't valid." });
  if (order.status === "refunded") return json({ valid: false, reason: "This order was refunded, so it can't be reviewed." });

  // One entry per product (an order can have the same item in two sizes)
  const byId = new Map<string, { product_id: string; name: string; size: string }>();
  for (const i of order.items || []) if (!byId.has(i.id)) byId.set(i.id, { product_id: i.id, name: i.name, size: i.size });
  const ids = [...byId.keys()];

  if (!Array.isArray(body.reviews)) {
    const [{ data: prods }, { data: done }] = await Promise.all([
      db.from("products").select("id,image").in("id", ids),
      db.from("reviews").select("product_id,rating,body,name").eq("order_id", order.id),
    ]);
    const img = new Map((prods || []).map((p) => [p.id, p.image]));
    const prev = new Map((done || []).map((r) => [r.product_id, r]));
    return json({
      valid: true, name: (order.customer_name || "").trim().split(/\s+/)[0] || "",
      items: ids.map((id) => ({ ...byId.get(id), image: img.get(id) || "", review: prev.get(id) || null })),
    });
  }

  const name = String(body.name ?? "").trim().slice(0, 60);
  const rows = body.reviews
    .filter((r: any) => r && ids.includes(r.product_id) && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5)
    .map((r: any) => ({ order_id: order.id, product_id: r.product_id, rating: r.rating, body: String(r.body ?? "").trim().slice(0, 1500), name }));
  if (!rows.length) return json({ error: "Pick a star rating first." }, 400);

  const { error: e2 } = await db.from("reviews").upsert(rows, { onConflict: "order_id,product_id" });
  if (e2) return json({ error: e2.message }, 500);
  await logEvent("orders", order.id, order.id, `Customer left ${rows.length === 1 ? "a review" : rows.length + " reviews"} (${rows.map((r: any) => r.rating + "★").join(", ")})`, {});
  return json({ ok: true, saved: rows.length });
});
