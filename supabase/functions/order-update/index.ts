// Admin-only: change an order's status / tracking, and email the customer when it ships.
// Marking an order delivered emails the customer a private link to review what they bought
// (once per order). { id, review_only: true } sends (or re-sends) just that review email.
import { db, json, cors, requireAdmin, sendEmail, SITE_URL, LOGO_URL, logEvent, claimAudit } from "../_shared/email.ts";
import { orderShippedEmail, reviewRequestEmail } from "../_shared/templates.js";

async function sendReviewRequest(order: any, admin: string | null) {
  const token = order.review_token || crypto.randomUUID().replace(/-/g, "");
  const url = `${SITE_URL}review.html?t=${token}`;
  const { subject, html } = reviewRequestEmail({ orderId: order.id, name: order.customer_name, items: order.items, url, shopUrl: SITE_URL, logoUrl: LOGO_URL });
  await sendEmail({ to: order.customer_email, name: order.customer_name, subject, html, kind: "transactional", tags: ["review-request"] });
  const { data } = await db.from("orders").update({ review_token: token, review_requested_at: new Date().toISOString() }).eq("id", order.id).select().single();
  await claimAudit("orders", order.id, admin);
  await logEvent("orders", order.id, order.id, `Review request emailed to ${order.customer_email}`, {}, admin);
  return data || order;
}

const STATUSES = ["paid", "packed", "shipped", "delivered", "refunded"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = await requireAdmin(req);
  if (!admin) return json({ error: "Not an admin" }, 403);

  const { id, status, carrier = "", tracking_number = "", notify = false, ask_review = true, review_only = false } = await req.json();

  if (review_only && id) {
    const { data: o } = await db.from("orders").select("*").eq("id", id).maybeSingle();
    if (!o) return json({ error: "Order not found" }, 404);
    if (!o.customer_email) return json({ error: "This order has no email address" }, 400);
    try { return json({ ok: true, reviewRequested: true, order: await sendReviewRequest(o, admin) }); }
    catch (e) { return json({ error: "The review email failed: " + (e as Error).message }, 502); }
  }
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
  // Delivered: ask for a review (only the first time, so changing status back and forth doesn't spam them)
  let reviewRequested = false, reviewError = "";
  if (status === "delivered" && ask_review && order.customer_email && !order.review_requested_at) {
    try { Object.assign(order, await sendReviewRequest(order, admin)); reviewRequested = true; }
    catch (e) { reviewError = "Order updated, but the review email failed: " + (e as Error).message; }
  }
  return json({ ok: true, emailed, reviewRequested, reviewError, order });
});
