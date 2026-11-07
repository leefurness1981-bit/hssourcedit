// @ts-nocheck
// unsubscribe — single-file version for the Supabase dashboard editor (generated from supabase/functions/unsubscribe).
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

type Mail = {
  to: string; name?: string; subject: string; html: string;
  kind: "marketing" | "transactional"; headers?: Record<string, string>; tags?: string[];
};

class SendLimitError extends Error {}

/** Send one email. Throws SendLimitError when the provider's daily/monthly limit is hit. */
async function sendEmail(m: Mail): Promise<void> {
  const useResend = m.kind === "transactional" && RESEND_KEY;
  const from = m.kind === "marketing" ? FROM_MARKETING : FROM_ORDERS;

  if (useResend) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${FROM_NAME} <${from}>`, to: m.to, reply_to: REPLY_TO, subject: m.subject, html: m.html, headers: m.headers }),
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
      replyTo: { email: REPLY_TO, name: FROM_NAME },
      subject: m.subject, htmlContent: m.html, headers: m.headers, tags: m.tags,
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

// ---------- function ----------
// One-click unsubscribe link used in marketing emails (GET from the link, POST from mail apps).

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const email = (url.searchParams.get("e") ?? "").toLowerCase();
  const t = url.searchParams.get("t") ?? "";
  const page = (msg: string) => new Response(
    `<!doctype html><meta name=viewport content="width=device-width"><title>HS Sourced It</title><body style="font-family:Arial;background:#000;color:#f5f5f5;display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:20px"><div><h2>${msg}</h2><p style="color:#999">HS Sourced It</p></div></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } });

  const expected = email ? new URL(await unsubscribeUrl(email)).searchParams.get("t") : null;
  if (!email || t !== expected) return page("That unsubscribe link isn't valid.");

  await db.from("customers").update({ marketing_opt_in: false }).eq("email", email);
  await syncBrevoContact(email, "", false);
  return page("You've been unsubscribed. Sorry to see you go.");
});
