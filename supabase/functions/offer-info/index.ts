// Public: look up a friends & family offer from its link, for the shop to display.
// Never returns the recipient's email.
import { db, json, cors } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { token } = await req.json().catch(() => ({}));
  if (!token || typeof token !== "string" || token.length > 64) return json({ valid: false, reason: "This offer link isn't valid." });

  const { data: o, error } = await db.from("offers").select("*").eq("token", token).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!o) return json({ valid: false, reason: "This offer link isn't valid." });
  if (o.status === "used") return json({ valid: false, reason: "This offer has already been used." });
  if (o.status === "cancelled") return json({ valid: false, reason: "This offer is no longer available." });
  if (o.expires_at && new Date(o.expires_at) < new Date()) return json({ valid: false, reason: "This offer has expired." });

  const { data: p } = await db.from("products")
    .select("id,name,category,price,image,description,sizes,allow_backorder,lead_time").eq("id", o.product_id).maybeSingle();
  if (!p) return json({ valid: false, reason: "This product is no longer available." });

  return json({
    valid: true, token: o.token, name: (o.name || "").split(" ")[0], price: Number(o.price),
    max_qty: o.max_qty, expires_at: o.expires_at, product: p,
  });
});
