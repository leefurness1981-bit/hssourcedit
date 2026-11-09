// Admin-only: personal welcome codes for people who joined the list before codes were personal.
// GET-style {action:"count"} → how many subscribers don't have one yet.
// {action:"send"} → creates a one-use code for each and emails it (up to 100 per run; run again for the rest).
// Skips anyone who has already ordered (the code is for a first order).
import { db, json, cors, requireAdmin, sendMarketing, SendLimitError, SITE_URL, LOGO_URL } from "../_shared/email.ts";
import { welcomeEmail } from "../_shared/templates.js";
import { createWelcomeCode, WELCOME_PERCENT } from "../_shared/welcome-code.ts";

const BATCH = 100;

async function pending() {
  const { data, error } = await db.from("customers").select("email,name,order_count")
    .eq("marketing_opt_in", true).is("welcome_code", null);
  if (error) throw error;
  return (data ?? []).filter((c) => !(c.order_count > 0));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await requireAdmin(req))) return json({ error: "Not an admin" }, 403);
  try {
    const { action = "count" } = await req.json().catch(() => ({}));
    const list = await pending();
    if (action !== "send") return json({ pending: list.length });

    let sent = 0, failed = 0, limitHit = false;
    for (const c of list.slice(0, BATCH)) {
      try {
        const { code, expiresAt } = await createWelcomeCode(c.email);
        await db.from("customers").update({ welcome_code: code, welcome_code_expires_at: expiresAt.toISOString() }).eq("email", c.email);
        const { subject, html } = welcomeEmail({ name: c.name, code, percent: WELCOME_PERCENT, expiresAt, existing: true, shopUrl: SITE_URL, logoUrl: LOGO_URL });
        await sendMarketing(c.email, c.name, subject, html, ["welcome-code"]);
        sent++;
      } catch (e) {
        if (e instanceof SendLimitError) { limitHit = true; break; }
        failed++; console.error(c.email, e);
      }
    }
    return json({ sent, failed, limitHit, remaining: Math.max(0, list.length - sent - failed) });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
