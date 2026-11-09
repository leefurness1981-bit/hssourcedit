// Admin-only: change an order's status / tracking, and email the customer when it ships.
import { db, json, cors, requireAdmin, sendEmail, SITE_URL, LOGO_URL, logEvent, claimAudit } from "../_shared/email.ts";
import { orderShippedEmail } from "../_shared/templates.js";

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
