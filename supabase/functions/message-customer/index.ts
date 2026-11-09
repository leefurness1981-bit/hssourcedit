// Admin-only: send a personal message to a customer (from the shop inbox, replies come back there)
// and keep a copy so it shows on the order.
import { db, json, cors, requireAdmin, sendEmail, SHOP_INBOX, SITE_URL, LOGO_URL } from "../_shared/email.ts";
import { customerMessageEmail } from "../_shared/templates.js";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = await requireAdmin(req);
  if (!admin) return json({ error: "Not an admin" }, 403);

  const { orderId = "", to = "", subject = "", message = "" } = await req.json();
  if (!subject.trim() || !message.trim()) return json({ error: "Subject and message are required" }, 400);

  let order: Record<string, any> | null = null;
  if (orderId) {
    const { data } = await db.from("orders").select("id,customer_email,customer_name,items").eq("id", orderId).maybeSingle();
    order = data;
    if (!order) return json({ error: "Order not found" }, 404);
  }
  const email = String(order?.customer_email || to).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "No valid customer email" }, 400);
  const name = order?.customer_name || "";

  const html = customerMessageEmail({ name, message, orderId: order?.id, items: order?.items, shopUrl: SITE_URL, logoUrl: LOGO_URL });
  try {
    await sendEmail({ to: email, name, subject: subject.trim(), html, kind: "transactional", from: SHOP_INBOX, replyTo: SHOP_INBOX, tags: ["customer-message"] });
  } catch (e) { return json({ error: "Email failed: " + (e as Error).message }, 502); }

  const { data: saved, error } = await db.from("customer_messages").insert({
    order_id: order?.id ?? null, customer_email: email, direction: "out", subject: subject.trim(), body: message.trim(), sent_by: admin,
  }).select().single();
  return json({ ok: true, message: saved, logError: error?.message });
});
