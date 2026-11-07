// Admin-only: send a marketing campaign to opted-in customers through Brevo.
// Each email is sent individually so it gets its own unsubscribe link and
// one-click unsubscribe header (required by Gmail and Yahoo for bulk senders).
import { db, json, cors, requireAdmin, sendMarketing, SendLimitError, SITE_URL, LOGO_URL } from "../_shared/email.ts";
import { campaignEmail } from "../_shared/templates.js";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await requireAdmin(req))) return json({ error: "Not an admin" }, 403);

  const { subject, inner, preheader = "", segment = "all" } = await req.json();
  if (!subject || !inner) return json({ error: "Subject and message are required" }, 400);

  let query = db.from("customers").select("email,name").eq("marketing_opt_in", true);
  if (segment !== "all") query = query.contains("tags", [segment]);
  const { data: recipients, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const html = campaignEmail({ inner, shopUrl: SITE_URL, logoUrl: LOGO_URL, preheader });
  let sent = 0, failed = 0, limitHit = false;
  const queue = [...recipients!];

  async function worker() {
    while (queue.length && !limitHit) {
      const r = queue.shift()!;
      try { await sendMarketing(r.email, r.name, subject, html, ["campaign"]); sent++; }
      catch (e) { if (e instanceof SendLimitError) { limitHit = true; queue.unshift(r); } else { failed++; console.error(r.email, e); } }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));

  const notSent = queue.length;
  const status = limitHit ? `partial — daily limit hit, ${notSent} not sent` : failed ? `sent with ${failed} failures` : "sent";
  await db.from("campaigns").insert({ subject, html, segment, recipients: sent, status });
  return json({ sent, failed, notSent, limitHit, total: recipients!.length });
});
