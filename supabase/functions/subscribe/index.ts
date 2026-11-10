// Newsletter signup from the shop: saves the customer, syncs to Brevo,
// and sends the welcome email with the discount code (first signup only).
import { db, json, cors, sendMarketing, syncBrevoContact, SITE_URL, LOGO_URL } from "../_shared/email.ts";
import { welcomeEmail } from "../_shared/templates.js";
import { createWelcomeCode, WELCOME_PERCENT as PERCENT } from "../_shared/welcome-code.ts";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { email: raw, name = "", website = "" } = await req.json();
    if (website) return json({ ok: true }); // honeypot field — bots fill it, humans can't see it
    const email = String(raw ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return json({ error: "Please enter a valid email" }, 400);
    const cleanName = String(name).slice(0, 80);

    const { data: existing } = await db.from("customers").select("marketing_opt_in, welcome_sent_at").eq("email", email).maybeSingle();
    const { error } = await db.rpc("subscribe", { p_email: email, p_name: cleanName });
    if (error) throw error;
    await syncBrevoContact(email, cleanName, true);

    // Only send the welcome email once per address. Claim it atomically first, so a double-tap
    // (two sign-ups arriving at the same moment) can't create two codes or send two emails.
    const { data: claimed } = existing?.welcome_sent_at ? { data: [] } : await db.from("customers")
      .update({ welcome_sent_at: new Date().toISOString() }).eq("email", email).is("welcome_sent_at", null).select("email");
    if (claimed && claimed.length) {
      // Their own one-use code. There's no shared fallback code: if Stripe can't make one right now,
      // the welcome email goes without it and asks them to reply for their code.
      let code = "", expiresAt: Date | null = null;
      try {
        ({ code, expiresAt } = await createWelcomeCode(email));
        await db.from("customers").update({ welcome_code: code, welcome_code_expires_at: expiresAt.toISOString(), welcome_code_failed_at: null }).eq("email", email);
      } catch (e) {
        console.error("welcome code failed — customer asked to reply for their code", e);
        await db.from("customers").update({ welcome_code_failed_at: new Date().toISOString() }).eq("email", email);
      }
      const { subject, html } = welcomeEmail({ name: cleanName, code, percent: PERCENT, expiresAt, shopUrl: SITE_URL, logoUrl: LOGO_URL });
      try {
        await sendMarketing(email, cleanName, subject, html, ["welcome"]);
      } catch (e) {
        console.error("welcome email failed", e);
        await db.from("customers").update({ welcome_sent_at: null }).eq("email", email); // allow a retry
      }
    }
    return json({ ok: true, already: !!existing?.marketing_opt_in });
  } catch (e) {
    console.error(e);
    return json({ error: "Couldn't sign you up right now — please try again." }, 500);
  }
});
