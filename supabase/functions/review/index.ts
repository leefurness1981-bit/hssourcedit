// Public: the review page (review.html?t=…) uses this to
//   - look up an order from its private review link: { token }
//   - save the customer's reviews: { token, name, reviews: [{ product_id, rating, body }] }
// The link is only emailed once an order is marked delivered, so only real buyers can review,
// and only the products in their own order. Sending it again updates their earlier review.
import { db, json, cors, logEvent } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({}));
  const token = body.token;
  if (!token || typeof token !== "string" || token.length > 64) return json({ valid: false, reason: "This review link isn't valid." });

  const { data: order, error } = await db.from("orders").select("id,customer_name,items,status").eq("review_token", token).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!order) return json({ valid: false, reason: "This review link isn't valid." });
  if (order.status === "refunded") return json({ valid: false, reason: "This order was refunded, so it can't be reviewed." });

  // One entry per product (an order can have the same item in two sizes)
  const byId = new Map<string, { product_id: string; name: string; size: string }>();
  for (const i of order.items || []) if (!byId.has(i.id)) byId.set(i.id, { product_id: i.id, name: i.name, size: i.size });
  const ids = [...byId.keys()];

  if (!Array.isArray(body.reviews)) {
    const [{ data: prods }, { data: done }] = await Promise.all([
      db.from("products").select("id,image").in("id", ids),
      db.from("reviews").select("product_id,rating,body,name").eq("order_id", order.id),
    ]);
    const img = new Map((prods || []).map((p) => [p.id, p.image]));
    const prev = new Map((done || []).map((r) => [r.product_id, r]));
    return json({
      valid: true, name: (order.customer_name || "").trim().split(/\s+/)[0] || "",
      items: ids.map((id) => ({ ...byId.get(id), image: img.get(id) || "", review: prev.get(id) || null })),
    });
  }

  const name = String(body.name ?? "").trim().slice(0, 60);
  const rows = body.reviews
    .filter((r: any) => r && ids.includes(r.product_id) && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5)
    .map((r: any) => ({ order_id: order.id, product_id: r.product_id, rating: r.rating, body: String(r.body ?? "").trim().slice(0, 1500), name }));
  if (!rows.length) return json({ error: "Pick a star rating first." }, 400);

  const { error: e2 } = await db.from("reviews").upsert(rows, { onConflict: "order_id,product_id" });
  if (e2) return json({ error: e2.message }, 500);
  await logEvent("orders", order.id, order.id, `Customer left ${rows.length === 1 ? "a review" : rows.length + " reviews"} (${rows.map((r: any) => r.rating + "★").join(", ")})`, {});
  return json({ ok: true, saved: rows.length });
});
