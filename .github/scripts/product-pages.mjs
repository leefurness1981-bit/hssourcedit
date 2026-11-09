// Builds a small page for every live product at p/<id>/index.html.
// Each page carries the product's photo, name and price for link previews
// (Snapchat, WhatsApp, iMessage, TikTok…) and forwards visitors to /?p=<id>,
// which opens the product on the shop. Run by .github/workflows/product-pages.yml.
import fs from "node:fs";
import path from "node:path";

const cfg = fs.readFileSync("js/config.js", "utf8");
const pick = (k) => (cfg.match(new RegExp(`${k}:\\s*"([^"]*)"`)) || [])[1] || "";
const SUPA = pick("supabaseUrl"), KEY = pick("supabaseAnonKey");
const domain = fs.existsSync("CNAME") ? fs.readFileSync("CNAME", "utf8").trim() : "";
const SITE = domain ? `https://${domain}/` : "https://example.com/";
if (!SUPA || !KEY) { console.log("Supabase not configured in js/config.js — nothing to do."); process.exit(0); }

const res = await fetch(`${SUPA}/rest/v1/products?select=id,name,price,image,description,category&active=eq.true&order=created_at`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
if (!res.ok) { console.error("Couldn't load products:", res.status, await res.text()); process.exit(1); }
const products = await res.json();

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const abs = (u) => !u ? SITE + "images/logo.png" : /^https?:\/\//.test(u) ? u : SITE + u.replace(/^\.?\//, "");
const safe = (id) => /^[a-z0-9][a-z0-9_-]*$/i.test(id);

const outDir = "p";
fs.mkdirSync(outDir, { recursive: true });
const keep = new Set();
for (const p of products) {
  if (!safe(p.id)) { console.log("skipping odd id:", p.id); continue; }
  keep.add(p.id);
  const title = `${p.name} — £${Number(p.price).toFixed(2)}`;
  const desc = (p.description || `${p.category} at HS Sourced It`).slice(0, 200);
  const target = `${SITE}?p=${encodeURIComponent(p.id)}`;
  const url = `${SITE}p/${p.id}/`;
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | HS Sourced It</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="HS Sourced It">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(abs(p.image))}">
<meta property="og:url" content="${esc(url)}">
<meta property="product:price:amount" content="${Number(p.price).toFixed(2)}">
<meta property="product:price:currency" content="GBP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(abs(p.image))}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<link rel="icon" href="${SITE}images/favicon.png">
<style>body{margin:0;background:#000;color:#f5f5f5;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center}a{color:#fff}</style>
</head><body>
<p>Opening <a href="${esc(target)}">${esc(p.name)}</a>…</p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>
`;
  const file = path.join(outDir, p.id, "index.html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== html) { fs.writeFileSync(file, html); console.log("wrote", file); }
}
// Remove pages for products that were deleted or hidden
for (const d of fs.readdirSync(outDir)) {
  if (!keep.has(d) && fs.statSync(path.join(outDir, d)).isDirectory()) { fs.rmSync(path.join(outDir, d), { recursive: true }); console.log("removed", d); }
}
console.log(`${keep.size} product pages up to date.`);
