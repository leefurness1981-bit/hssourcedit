// One-click unsubscribe link used in marketing emails (GET from the link, POST from mail apps).
// Supabase shows HTML from functions as plain text, so a clicked link is sent on to a page on the shop instead.
import { db, unsubscribeUrl, syncBrevoContact, SITE_URL } from "../_shared/email.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const email = (url.searchParams.get("e") ?? "").toLowerCase();
  const t = url.searchParams.get("t") ?? "";
  const done = (ok: boolean) => req.method === "POST"
    ? new Response(ok ? "Unsubscribed" : "Invalid link", { status: ok ? 200 : 400, headers: { "Content-Type": "text/plain" } })
    : new Response(null, { status: 303, headers: { Location: `${SITE_URL}unsubscribed.html?s=${ok ? "ok" : "bad"}` } });

  const expected = email ? new URL(await unsubscribeUrl(email)).searchParams.get("t") : null;
  if (!email || t !== expected) return done(false);

  await db.from("customers").update({ marketing_opt_in: false }).eq("email", email);
  await syncBrevoContact(email, "", false);
  return done(true);
});
