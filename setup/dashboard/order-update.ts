// @ts-nocheck
// order-update — single-file version for the Supabase dashboard editor (generated from supabase/functions/order-update).
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

// ---------- shared: email designs ----------
// =========================================================
// HS Sourced It — email designs
// One file used by BOTH the server (to send) and the admin page (to preview).
// Edit wording here. Keep styles inline — email apps ignore <style> tags.
// =========================================================

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const money = (n) => "£" + Number(n || 0).toFixed(2);
const first = (name) => (name || "").trim().split(/\s+/)[0] || "";

const C = {
  bg: "#000000", card: "#111111", line: "#2a2a2a", text: "#f5f5f5", muted: "#9a9a9a",
  font: "Arial, Helvetica, sans-serif", serif: "Georgia, 'Times New Roman', serif",
};

function button(href, label) {
  // Outlined button: a white border + white text survives email apps (e.g. Gmail dark mode)
  // that recolour or strip solid button backgrounds.
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="border:2px solid #ffffff;border-radius:3px">
    <a href="${esc(href)}" style="display:inline-block;padding:14px 26px;font-family:${C.font};font-size:14px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#ffffff;text-decoration:none;border-radius:3px">${esc(label)}</a>
  </td></tr></table>`;
}

function heading(text) {
  return `<h1 style="margin:0 0 14px;font-family:${C.font};font-size:30px;line-height:1.1;font-weight:900;letter-spacing:.5px;text-transform:uppercase;color:${C.text}">${text}</h1>`;
}

function p(text, extra = "") {
  return `<p style="margin:0 0 14px;font-family:${C.font};font-size:15px;line-height:1.6;color:#d6d6d6;${extra}">${text}</p>`;
}

function itemsTable(items, total) {
  const rows = (items || []).map((i) => `<tr>
      <td style="padding:10px 0;border-bottom:1px solid ${C.line};font-family:${C.font};font-size:14px;color:${C.text}">${esc(i.qty)}× ${esc(i.name)}<br><span style="color:${C.muted};font-size:12px">Size ${esc(i.size)}</span>${i.backorder ? `<br><span style="color:${C.text};font-size:12px;font-weight:bold">Ships in ${esc(i.lead_time || "5–8 business days")}</span>` : ""}</td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid ${C.line};font-family:${C.font};font-size:14px;color:${C.text};white-space:nowrap">${money(i.price * i.qty)}</td></tr>`).join("");
  const tot = total != null ? `<tr><td style="padding:12px 0 0;font-family:${C.font};font-size:15px;font-weight:bold;color:${C.text}">Total paid</td>
      <td align="right" style="padding:12px 0 0;font-family:${C.font};font-size:15px;font-weight:bold;color:${C.text}">${money(total)}</td></tr>` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 18px">${rows}${tot}</table>`;
}

/** Outer frame: logo header + card + footer. `footer` may contain {{unsubscribe}}. */
function layout({ body, shopUrl, logoUrl, preheader = "", footer = "" }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>HS Sourced It</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td align="center" style="padding:0 0 18px"><a href="${esc(shopUrl)}"><img src="${esc(logoUrl)}" width="300" alt="HS SOURCED IT" style="display:block;width:300px;max-width:80%;height:auto;border:0;color:#fff;font-family:${C.serif};font-size:26px;font-weight:bold"></a></td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:6px;padding:32px 28px;font-family:${C.font};font-size:15px;line-height:1.6;color:#d6d6d6">${body}</td></tr>
    <tr><td align="center" style="padding:20px 10px;font-family:${C.font};font-size:12px;line-height:1.6;color:#777">
      HS Sourced It · <a href="${esc(shopUrl)}" style="color:#999">Visit the shop</a>${footer ? "<br>" + footer : ""}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

/** Welcome email sent when someone joins the list. */
/** @param {{ name?: string, code?: string, percent?: number, expiresAt?: Date | string | null, existing?: boolean, shopUrl: string, logoUrl: string }} o */
function welcomeEmail({ name, code, percent = 5, expiresAt = null, existing = false, shopUrl, logoUrl }) {
  const hi = first(name) ? `Welcome, ${esc(first(name))}.` : "Welcome in.";
  const by = expiresAt ? new Date(expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
  const intro = existing
    ? `${first(name) ? `Hi ${esc(first(name))} — t` : "T"}hanks for being on the list. Here's your own code for <strong style="color:#fff">${esc(percent)}% off your first order</strong>:`
    : `As promised, here's <strong style="color:#fff">${esc(percent)}% off your first order</strong>:`;
  const body = `
    ${heading(existing ? "Your personal code." : "You're on the list.")}
    ${existing ? "" : p(`${hi} You'll be first to hear about new drops, restocks and members-only deals — before anyone else.`)}
    ${code ? `${p(intro)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr>
      <td align="center" style="border:2px dashed #ffffff;border-radius:4px;padding:18px;font-family:${C.font};font-size:26px;font-weight:900;letter-spacing:3px;color:#ffffff">${esc(code)}</td></tr></table>
    ${p(`Enter it at checkout. It's just for you and works once${by ? ` — use it by ${esc(by)}` : ""}.`, `font-size:13px;color:${C.muted};text-align:center`)}`
    : p(`Your code for <strong style="color:#fff">${esc(percent)}% off your first order</strong> didn't come through this time. Just reply to this email and we'll send it straight over.`)}
    ${button(shopUrl, "Shop now")}
    ${p("Got a question or looking for something specific? Just reply to this email — it comes straight to us.")}`;
  return {
    subject: existing ? `Your ${percent}% off code for HS Sourced It` : `Welcome to HS Sourced It — here's ${percent}% off`,
    html: layout({ body, shopUrl, logoUrl, preheader: `Your ${percent}% off code is inside.`,
      footer: `You're receiving this because you signed up at HS Sourced It. {{unsubscribe}}` }),
  };
}

/** Sent automatically when Stripe confirms payment. */
function orderConfirmedEmail({ orderId, name, items, total, address, shopUrl, logoUrl }) {
  const body = `
    ${heading("Order locked in.")}
    ${p(`Cheers${first(name) ? " " + esc(first(name)) : ""} — we've got your order and we're getting it ready.`)}
    ${p(`Order <strong style="color:#fff">${esc(orderId)}</strong>`, `margin-bottom:4px`)}
    ${itemsTable(items, total)}
    ${address ? p(`<strong style="color:#fff">Delivering to</strong><br>${esc(address)}`) : ""}
    ${(items || []).some((i) => i.backorder) ? p("Some items in your order are being sourced for you and will ship within the time shown. If your order has in-stock items too, we'll send everything together.") : ""}
    ${p("We'll email you again with tracking as soon as it's on its way.")}
    ${p("Any problems? Just reply to this email.", `color:${C.muted};font-size:13px`)}`;
  return { subject: `Order ${orderId} confirmed 🔥`, html: layout({ body, shopUrl, logoUrl, preheader: "We've got your order." }) };
}

const CARRIERS = {
  // Royal Mail's own recommended link format (royalmail.com › linking our website): opens with the number filled in
  "Royal Mail": (n) => `https://www.royalmail.com/portal/rm/track?trackNumber=${encodeURIComponent(n)}`,
  "Evri": (n) => `https://www.evri.com/track/parcel/${encodeURIComponent(n)}`,
  "DPD": (n) => `https://track.dpd.co.uk/parcels/${encodeURIComponent(n)}`,
  "DHL": (n) => `https://www.dhl.com/gb-en/home/tracking.html?tracking-id=${encodeURIComponent(n)}`,
  "UPS": (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  "Parcelforce": (n) => `https://www.parcelforce.com/portal/pw/track?trackNumber=${encodeURIComponent(n)}`,
  "Yodel": (n) => `https://www.yodel.co.uk/tracking/${encodeURIComponent(n)}`,
};
const CARRIER_NAMES = [...Object.keys(CARRIERS), "Other"];
function trackingUrl(carrier, number) {
  return number && CARRIERS[carrier] ? CARRIERS[carrier](number.trim()) : "";
}

/** Sent when you mark an order as Shipped in admin. */
function orderShippedEmail({ orderId, name, items, carrier, trackingNumber, shopUrl, logoUrl }) {
  const url = trackingUrl(carrier, trackingNumber);
  const body = `
    ${heading("It's on its way.")}
    ${p(`Good news${first(name) ? " " + esc(first(name)) : ""} — order <strong style="color:#fff">${esc(orderId)}</strong> has left us${carrier && carrier !== "Other" ? ` with <strong style="color:#fff">${esc(carrier)}</strong>` : ""}.`)}
    ${trackingNumber ? p(`Tracking number: <strong style="color:#fff">${esc(trackingNumber)}</strong>`) : ""}
    ${url ? button(url, "Track your parcel") : ""}
    ${itemsTable(items)}
    ${p("Questions about delivery? Just reply to this email.", `color:${C.muted};font-size:13px`)}`;
  return { subject: `Your order ${orderId} is on its way 📦`, html: layout({ body, shopUrl, logoUrl, preheader: "Tracking details inside." }) };
}

/** Wraps a campaign written in admin. `inner` is HTML; SHOP_URL inside it is replaced. */
function campaignEmail({ inner, shopUrl, logoUrl, preheader = "" }) {
  let src = String(inner).replace(/\r/g, "").trim();
  // Plain text typed without HTML: blank line = new paragraph, single line break kept
  if (!/<(p|h[1-6]|ul|ol|div|table|br)\b/i.test(src)) {
    src = src.split(/\n{2,}/).map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`).join("\n");
  }
  const body = src
    .replaceAll("SHOP_URL", shopUrl)
    .replace(/<h2>/g, `<h2 style="margin:0 0 12px;font-family:${C.font};font-size:22px;line-height:1.2;font-weight:900;color:${C.text}">`)
    .replace(/<li>/g, `<li style="margin:0 0 6px;font-family:${C.font};font-size:15px;line-height:1.6;color:#d6d6d6">`)
    .replace(/<strong>/g, `<strong style="color:#ffffff">`)
    .replace(/<img (?![^>]*style=)([^>]*?)\/?>/g, `<img $1 width="504" style="display:block;width:100%;max-width:504px;height:auto;border:0;border-radius:4px;margin:6px 0 16px">`)
    .replace(/<a (?![^>]*class="btn")([^>]*)>/g, `<a $1 style="color:#ffffff;text-decoration:underline">`)
    .replace(/<h1>/g, `<h1 style="margin:0 0 14px;font-family:${C.font};font-size:30px;line-height:1.1;font-weight:900;text-transform:uppercase;color:${C.text}">`)
    .replace(/<p>/g, `<p style="margin:0 0 14px;font-family:${C.font};font-size:15px;line-height:1.6;color:#d6d6d6">`)
    .replace(/<a ([^>]*)class="btn"([^>]*)>/g, `<a $1$2 style="display:inline-block;margin:10px 0;padding:14px 26px;border:2px solid #ffffff;color:#ffffff;font-family:${C.font};font-size:14px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;border-radius:3px">`);
  return layout({ body, shopUrl, logoUrl, preheader,
    footer: `You're receiving this because you signed up at HS Sourced It. {{unsubscribe}}` });
}

/** Personal friends & family offer: one product at a set price, one-time link. */
function offerEmail({ name, productName, imageUrl, price, normalPrice, url, expiresAt, maxQty = 1, shopUrl, logoUrl }) {
  const hi = first(name) ? `Hi ${esc(first(name))},` : "Hi,";
  const exp = expiresAt ? new Date(expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
  const img = imageUrl
    ? `<img src="${esc(imageUrl)}" width="504" alt="${esc(productName)}" style="display:block;width:100%;max-width:504px;height:auto;border:0;border-radius:4px;margin:6px 0 18px">`
    : "";
  const was = normalPrice && Number(normalPrice) > Number(price)
    ? ` <span style="color:${C.muted};text-decoration:line-through;font-size:16px;font-weight:normal">${money(normalPrice)}</span>` : "";
  const body = `
    ${heading("Friends & family.")}
    ${p(`${hi} here's a private price, just for you.`)}
    ${img}
    <p style="margin:0 0 4px;font-family:${C.font};font-size:17px;font-weight:bold;color:${C.text}">${esc(productName)}</p>
    <p style="margin:0 0 14px;font-family:${C.font};font-size:26px;font-weight:900;color:${C.text}">${money(price)}${was}</p>
    ${button(url, "Get it at this price")}
    ${p(`This link is personal to you and works for <strong style="color:#fff">one order</strong>${maxQty > 1 ? ` (up to ${esc(maxQty)} items)` : " of one item"}.${exp ? ` It expires on <strong style="color:#fff">${esc(exp)}</strong>.` : ""} Please don't share it.`, `font-size:13px;color:${C.muted}`)}
    ${p("Any questions? Just reply to this email.", `font-size:13px;color:${C.muted}`)}`;
  return {
    subject: `Your friends & family price: ${productName}`,
    html: layout({ body, shopUrl, logoUrl, preheader: `${productName} for ${money(price)}, just for you.` }),
  };
}


/** Internal alert to the shop when an order is paid. */
function newOrderAlertEmail({ orderId, name, email, phone, address, items, total, friendsFamily, adminUrl, shopUrl, logoUrl }) {
  const toSource = (items || []).filter((i) => i.backorder);
  const body = `
    ${heading("New order 🔥")}
    ${p(`<strong style="color:#fff">${esc(orderId)}</strong> · ${money(total)}${friendsFamily ? ` · <strong style="color:#fff">Friends & family</strong>` : ""}`)}
    ${itemsTable(items, total)}
    ${toSource.length ? p(`<strong style="color:#fff">⚠ To source:</strong> ${toSource.map((i) => `${esc(i.qty)}× ${esc(i.name)} (${esc(i.size)})`).join(", ")}`) : ""}
    ${p(`<strong style="color:#fff">Customer</strong><br>${esc(name || "—")}<br>${esc(email || "")}${phone ? "<br>" + esc(phone) : ""}`)}
    ${address ? p(`<strong style="color:#fff">Deliver to</strong><br>${esc(address)}`) : ""}
    ${button(adminUrl, "Open orders in admin")}
    ${p("Replying to this email goes straight to the customer.", `font-size:12px;color:${C.muted}`)}`;
  return {
    subject: `🛒 New order ${orderId} — ${money(total)}${toSource.length ? " (items to source)" : ""}`,
    html: layout({ body, shopUrl, logoUrl, preheader: `${(items || []).length} item(s) · ${money(total)}` }),
  };
}

/** A personal message to a customer, written in admin. Plain text in, line breaks kept. */
function customerMessageEmail({ name, message, orderId, items, shopUrl, logoUrl }) {
  const paras = String(message || "").trim().split(/\n{2,}/).map((para) => p(esc(para).replace(/\n/g, "<br>"))).join("");
  const body = `
    ${paras}
    ${orderId ? `<p style="margin:22px 0 6px;font-family:${C.font};font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${C.muted}">Order ${esc(orderId)}</p>${itemsTable(items)}` : ""}
    ${p("Just reply to this email if you have any questions.", `color:${C.muted};font-size:13px`)}`;
  return layout({ body, shopUrl, logoUrl, preheader: String(message || "").slice(0, 90) });
}

// ---------- function ----------
// Admin-only: change an order's status / tracking, and email the customer when it ships.

const STATUSES = ["paid", "packed", "shipped", "delivered", "refunded"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = await requireAdmin(req);
  if (!admin) return json({ error: "Not an admin" }, 403);

  const { id, status, carrier = "", tracking_number = "", notify = false } = await req.json();
  if (!id || !STATUSES.includes(status)) return json({ error: "Bad request" }, 400);

  const patch: Record<string, unknown> = { status, carrier, tracking_number };
  if (status === "shipped") patch.shipped_at = new Date().toISOString();
  const { data: order, error } = await db.from("orders").update(patch).eq("id", id).select().single();
  if (error) return json({ error: error.message }, 500);
  await claimAudit("orders", order.id, admin);

  let emailed = false;
  if (status === "shipped" && notify && order.customer_email) {
    const { subject, html } = orderShippedEmail({
      orderId: order.id, name: order.customer_name, items: order.items,
      carrier, trackingNumber: tracking_number, shopUrl: SITE_URL, logoUrl: LOGO_URL,
    });
    try {
      await sendEmail({ to: order.customer_email, name: order.customer_name, subject, html, kind: "transactional", tags: ["shipped"] }); emailed = true;
      await logEvent("orders", order.id, order.id, `Shipped email sent to ${order.customer_email}`, { carrier, tracking_number }, admin);
    }
    catch (e) { return json({ error: "Order updated, but the email failed: " + (e as Error).message, order }, 502); }
  }
  return json({ ok: true, emailed, order });
});
