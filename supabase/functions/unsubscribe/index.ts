// One-click unsubscribe link used in marketing emails (GET from the link, POST from mail apps).
import { db, unsubscribeUrl, syncBrevoContact } from "../_shared/email.ts";

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
