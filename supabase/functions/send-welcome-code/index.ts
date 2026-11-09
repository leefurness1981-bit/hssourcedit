// Admin-only: create a personal one-use welcome code for one subscriber and email it to them.
// Used by the "Send welcome code" button on a customer whose code didn't generate at sign-up.
import { db, json, cors, requireAdmin, sendMarketing, SITE_URL, LOGO_URL } from "../_shared/email.ts";
import { welcomeEmail } from "../_shared/templates.js";
import { createWelcomeCode, WELCOME_PERCENT } from "../_shared/welcome-code.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await requireAdmin(req))) return json({ error: "Not an admin" }, 403);
  try {
    const { email: raw = "" } = await req.json();
    const email = String(raw).trim().toLowerCase();
    const { data: c } = await db.from("customers").select("email,name,marketing_opt_in").eq("email", email).maybeSingle();
    if (!c) return json({ error: "Customer not found" }, 404);
    if (!c.marketing_opt_in) return json({ error: "They're not subscribed to marketing, so a welcome code can't be emailed" }, 400);

    const { code, expiresAt } = await createWelcomeCode(email);
    await db.from("customers").update({
      welcome_code: code, welcome_code_expires_at: expiresAt.toISOString(), welcome_code_failed_at: null,
      welcome_sent_at: new Date().toISOString(),
    }).eq("email", email);
    const { subject, html } = welcomeEmail({ name: c.name, code, percent: WELCOME_PERCENT, expiresAt, existing: true, shopUrl: SITE_URL, logoUrl: LOGO_URL });
    await sendMarketing(email, c.name, subject, html, ["welcome-code"]);
    return json({ ok: true, code, expiresAt: expiresAt.toISOString() });
  } catch (e) {
    console.error(e);
    return json({ error: "Couldn't send the code: " + (e as Error).message }, 500);
  }
});
