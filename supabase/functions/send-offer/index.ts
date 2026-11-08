// Admin-only: create a one-time friends & family offer for one product and email the link.
import { db, json, cors, requireAdmin, sendEmail, SITE_URL, LOGO_URL } from "../_shared/email.ts";
import { offerEmail } from "../_shared/templates.js";

function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await requireAdmin(req))) return json({ error: "Not an admin" }, 403);

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim().slice(0, 80);
  const price = Math.round(Number(body.price) * 100) / 100;
  const maxQty = Math.max(1, Math.min(10, parseInt(body.max_qty, 10) || 1));
  const days = parseInt(body.expires_days, 10) || 0; // 0 = never

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Please enter a valid email address" }, 400);
  if (!Number.isFinite(price) || price < 0) return json({ error: "Please enter a valid price" }, 400);

  const { data: product, error: pErr } = await db.from("products").select("id,name,price,image").eq("id", body.product_id).maybeSingle();
  if (pErr) return json({ error: pErr.message }, 500);
  if (!product) return json({ error: "Product not found — save the product first" }, 404);

  const token = makeToken();
  const expires_at = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
  const { error: oErr } = await db.from("offers").insert({ token, product_id: product.id, email, name, price, max_qty: maxQty, expires_at });
  if (oErr) return json({ error: oErr.message }, 500);

  const url = `${SITE_URL}?offer=${encodeURIComponent(token)}`;
  const img = String(product.image || "");
  const imageUrl = img.startsWith("http") ? img : img && !img.startsWith("data:") ? SITE_URL + img.replace(/^\/+/, "") : "";
  const { subject, html } = offerEmail({
    name, productName: product.name, imageUrl, price, normalPrice: product.price, url, expiresAt: expires_at, maxQty,
    shopUrl: SITE_URL, logoUrl: LOGO_URL,
  });
  try {
    await sendEmail({ to: email, name, subject, html, kind: "transactional", tags: ["offer"] });
  } catch (e) {
    console.error("Offer email failed", e);
    return json({ ok: true, token, url, emailed: false, error: "Offer created, but the email failed: " + (e as Error).message });
  }
  console.log("Offer sent", token, product.id, email, price);
  return json({ ok: true, token, url, emailed: true });
});
