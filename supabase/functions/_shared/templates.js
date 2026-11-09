// =========================================================
// HS Sourced It — email designs
// One file used by BOTH the server (to send) and the admin page (to preview).
// Edit wording here. Keep styles inline — email apps ignore <style> tags.
// =========================================================

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const money = (n) => "£" + Number(n || 0).toFixed(2);
const first = (name) => (name || "").trim().split(/\s+/)[0] || "";

const C = {
  bg: "#000000", card: "#111111", line: "#2a2a2a", text: "#f5f5f5", muted: "#9a9a9a",
  font: "Arial, Helvetica, sans-serif", serif: "Georgia, 'Times New Roman', serif",
};

function button(href, label) {
  // Outlined button: a white border + white text survives email apps (e.g. Gmail dark mode)
  // that recolour or strip solid button backgrounds.
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="border:2px solid #ffffff;border-radius:3px">
    <a href="${esc(href)}" style="display:inline-block;padding:14px 26px;font-family:${C.font};font-size:14px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#ffffff;text-decoration:none;border-radius:3px">${esc(label)}</a>
  </td></tr></table>`;
}

function heading(text) {
  return `<h1 style="margin:0 0 14px;font-family:${C.font};font-size:30px;line-height:1.1;font-weight:900;letter-spacing:.5px;text-transform:uppercase;color:${C.text}">${text}</h1>`;
}

function p(text, extra = "") {
  return `<p style="margin:0 0 14px;font-family:${C.font};font-size:15px;line-height:1.6;color:#d6d6d6;${extra}">${text}</p>`;
}

function itemsTable(items, total) {
  const rows = (items || []).map((i) => `<tr>
      <td style="padding:10px 0;border-bottom:1px solid ${C.line};font-family:${C.font};font-size:14px;color:${C.text}">${esc(i.qty)}× ${esc(i.name)}<br><span style="color:${C.muted};font-size:12px">Size ${esc(i.size)}</span>${i.backorder ? `<br><span style="color:${C.text};font-size:12px;font-weight:bold">Ships in ${esc(i.lead_time || "5–8 business days")}</span>` : ""}</td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid ${C.line};font-family:${C.font};font-size:14px;color:${C.text};white-space:nowrap">${money(i.price * i.qty)}</td></tr>`).join("");
  const tot = total != null ? `<tr><td style="padding:12px 0 0;font-family:${C.font};font-size:15px;font-weight:bold;color:${C.text}">Total paid</td>
      <td align="right" style="padding:12px 0 0;font-family:${C.font};font-size:15px;font-weight:bold;color:${C.text}">${money(total)}</td></tr>` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 18px">${rows}${tot}</table>`;
}

/** Outer frame: logo header + card + footer. `footer` may contain {{unsubscribe}}. */
export function layout({ body, shopUrl, logoUrl, preheader = "", footer = "" }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>HS Sourced It</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td align="center" style="padding:0 0 18px"><a href="${esc(shopUrl)}"><img src="${esc(logoUrl)}" width="300" alt="HS SOURCED IT" style="display:block;width:300px;max-width:80%;height:auto;border:0;color:#fff;font-family:${C.serif};font-size:26px;font-weight:bold"></a></td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:6px;padding:32px 28px;font-family:${C.font};font-size:15px;line-height:1.6;color:#d6d6d6">${body}</td></tr>
    <tr><td align="center" style="padding:20px 10px;font-family:${C.font};font-size:12px;line-height:1.6;color:#777">
      HS Sourced It · <a href="${esc(shopUrl)}" style="color:#999">Visit the shop</a>${footer ? "<br>" + footer : ""}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

/** Welcome email sent when someone joins the list. */
/** @param {{ name?: string, code?: string, percent?: number, expiresAt?: Date | string | null, existing?: boolean, shopUrl: string, logoUrl: string }} o */
export function welcomeEmail({ name, code, percent = 5, expiresAt = null, existing = false, shopUrl, logoUrl }) {
  const hi = first(name) ? `Welcome, ${esc(first(name))}.` : "Welcome in.";
  const by = expiresAt ? new Date(expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
  const intro = existing
    ? `${first(name) ? `Hi ${esc(first(name))} — t` : "T"}hanks for being on the list. Here's your own code for <strong style="color:#fff">${esc(percent)}% off your first order</strong>:`
    : `As promised, here's <strong style="color:#fff">${esc(percent)}% off your first order</strong>:`;
  const body = `
    ${heading(existing ? "Your personal code." : "You're on the list.")}
    ${existing ? "" : p(`${hi} You'll be first to hear about new drops, restocks and members-only deals — before anyone else.`)}
    ${code ? `${p(intro)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr>
      <td align="center" style="border:2px dashed #ffffff;border-radius:4px;padding:18px;font-family:${C.font};font-size:26px;font-weight:900;letter-spacing:3px;color:#ffffff">${esc(code)}</td></tr></table>
    ${p(`Enter it at checkout. It's just for you and works once${by ? ` — use it by ${esc(by)}` : ""}.`, `font-size:13px;color:${C.muted};text-align:center`)}`
    : p(`Your code for <strong style="color:#fff">${esc(percent)}% off your first order</strong> didn't come through this time. Just reply to this email and we'll send it straight over.`)}
    ${button(shopUrl, "Shop now")}
    ${p("Got a question or looking for something specific? Just reply to this email — it comes straight to us.")}`;
  return {
    subject: existing ? `Your ${percent}% off code for HS Sourced It` : `Welcome to HS Sourced It — here's ${percent}% off`,
    html: layout({ body, shopUrl, logoUrl, preheader: `Your ${percent}% off code is inside.`,
      footer: `You're receiving this because you signed up at HS Sourced It. {{unsubscribe}}` }),
  };
}

/** Sent automatically when Stripe confirms payment. */
export function orderConfirmedEmail({ orderId, name, items, total, address, shopUrl, logoUrl }) {
  const body = `
    ${heading("Order locked in.")}
    ${p(`Cheers${first(name) ? " " + esc(first(name)) : ""} — we've got your order and we're getting it ready.`)}
    ${p(`Order <strong style="color:#fff">${esc(orderId)}</strong>`, `margin-bottom:4px`)}
    ${itemsTable(items, total)}
    ${address ? p(`<strong style="color:#fff">Delivering to</strong><br>${esc(address)}`) : ""}
    ${(items || []).some((i) => i.backorder) ? p("Some items in your order are being sourced for you and will ship within the time shown. If your order has in-stock items too, we'll send everything together.") : ""}
    ${p("We'll email you again with tracking as soon as it's on its way.")}
    ${p("Any problems? Just reply to this email.", `color:${C.muted};font-size:13px`)}`;
  return { subject: `Order ${orderId} confirmed 🔥`, html: layout({ body, shopUrl, logoUrl, preheader: "We've got your order." }) };
}

const CARRIERS = {
  // Royal Mail's own recommended link format (royalmail.com › linking our website): opens with the number filled in
  "Royal Mail": (n) => `https://www.royalmail.com/portal/rm/track?trackNumber=${encodeURIComponent(n)}`,
  "Evri": (n) => `https://www.evri.com/track/parcel/${encodeURIComponent(n)}`,
  "DPD": (n) => `https://track.dpd.co.uk/parcels/${encodeURIComponent(n)}`,
  "DHL": (n) => `https://www.dhl.com/gb-en/home/tracking.html?tracking-id=${encodeURIComponent(n)}`,
  "UPS": (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  "Parcelforce": (n) => `https://www.parcelforce.com/portal/pw/track?trackNumber=${encodeURIComponent(n)}`,
  "Yodel": (n) => `https://www.yodel.co.uk/tracking/${encodeURIComponent(n)}`,
};
export const CARRIER_NAMES = [...Object.keys(CARRIERS), "Other"];
export function trackingUrl(carrier, number) {
  return number && CARRIERS[carrier] ? CARRIERS[carrier](number.trim()) : "";
}

/** Sent when you mark an order as Shipped in admin. */
export function orderShippedEmail({ orderId, name, items, carrier, trackingNumber, shopUrl, logoUrl }) {
  const url = trackingUrl(carrier, trackingNumber);
  const body = `
    ${heading("It's on its way.")}
    ${p(`Good news${first(name) ? " " + esc(first(name)) : ""} — order <strong style="color:#fff">${esc(orderId)}</strong> has left us${carrier && carrier !== "Other" ? ` with <strong style="color:#fff">${esc(carrier)}</strong>` : ""}.`)}
    ${trackingNumber ? p(`Tracking number: <strong style="color:#fff">${esc(trackingNumber)}</strong>`) : ""}
    ${url ? button(url, "Track your parcel") : ""}
    ${itemsTable(items)}
    ${p("Questions about delivery? Just reply to this email.", `color:${C.muted};font-size:13px`)}`;
  return { subject: `Your order ${orderId} is on its way 📦`, html: layout({ body, shopUrl, logoUrl, preheader: "Tracking details inside." }) };
}

/** Wraps a campaign written in admin. `inner` is HTML; SHOP_URL inside it is replaced. */
export function campaignEmail({ inner, shopUrl, logoUrl, preheader = "" }) {
  let src = String(inner).replace(/\r/g, "").trim();
  // Plain text typed without HTML: blank line = new paragraph, single line break kept
  if (!/<(p|h[1-6]|ul|ol|div|table|br)\b/i.test(src)) {
    src = src.split(/\n{2,}/).map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`).join("\n");
  }
  const body = src
    .replaceAll("SHOP_URL", shopUrl)
    .replace(/<h2>/g, `<h2 style="margin:0 0 12px;font-family:${C.font};font-size:22px;line-height:1.2;font-weight:900;color:${C.text}">`)
    .replace(/<li>/g, `<li style="margin:0 0 6px;font-family:${C.font};font-size:15px;line-height:1.6;color:#d6d6d6">`)
    .replace(/<strong>/g, `<strong style="color:#ffffff">`)
    .replace(/<a (?![^>]*class="btn")([^>]*)>/g, `<a $1 style="color:#ffffff;text-decoration:underline">`)
    .replace(/<h1>/g, `<h1 style="margin:0 0 14px;font-family:${C.font};font-size:30px;line-height:1.1;font-weight:900;text-transform:uppercase;color:${C.text}">`)
    .replace(/<p>/g, `<p style="margin:0 0 14px;font-family:${C.font};font-size:15px;line-height:1.6;color:#d6d6d6">`)
    .replace(/<a ([^>]*)class="btn"([^>]*)>/g, `<a $1$2 style="display:inline-block;margin:10px 0;padding:14px 26px;border:2px solid #ffffff;color:#ffffff;font-family:${C.font};font-size:14px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;border-radius:3px">`);
  return layout({ body, shopUrl, logoUrl, preheader,
    footer: `You're receiving this because you signed up at HS Sourced It. {{unsubscribe}}` });
}

/** Personal friends & family offer: one product at a set price, one-time link. */
export function offerEmail({ name, productName, imageUrl, price, normalPrice, url, expiresAt, maxQty = 1, shopUrl, logoUrl }) {
  const hi = first(name) ? `Hi ${esc(first(name))},` : "Hi,";
  const exp = expiresAt ? new Date(expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
  const img = imageUrl
    ? `<img src="${esc(imageUrl)}" width="504" alt="${esc(productName)}" style="display:block;width:100%;max-width:504px;height:auto;border:0;border-radius:4px;margin:6px 0 18px">`
    : "";
  const was = normalPrice && Number(normalPrice) > Number(price)
    ? ` <span style="color:${C.muted};text-decoration:line-through;font-size:16px;font-weight:normal">${money(normalPrice)}</span>` : "";
  const body = `
    ${heading("Friends & family.")}
    ${p(`${hi} here's a private price, just for you.`)}
    ${img}
    <p style="margin:0 0 4px;font-family:${C.font};font-size:17px;font-weight:bold;color:${C.text}">${esc(productName)}</p>
    <p style="margin:0 0 14px;font-family:${C.font};font-size:26px;font-weight:900;color:${C.text}">${money(price)}${was}</p>
    ${button(url, "Get it at this price")}
    ${p(`This link is personal to you and works for <strong style="color:#fff">one order</strong>${maxQty > 1 ? ` (up to ${esc(maxQty)} items)` : " of one item"}.${exp ? ` It expires on <strong style="color:#fff">${esc(exp)}</strong>.` : ""} Please don't share it.`, `font-size:13px;color:${C.muted}`)}
    ${p("Any questions? Just reply to this email.", `font-size:13px;color:${C.muted}`)}`;
  return {
    subject: `Your friends & family price: ${productName}`,
    html: layout({ body, shopUrl, logoUrl, preheader: `${productName} for ${money(price)}, just for you.` }),
  };
}


/** Internal alert to the shop when an order is paid. */
export function newOrderAlertEmail({ orderId, name, email, phone, address, items, total, friendsFamily, adminUrl, shopUrl, logoUrl }) {
  const toSource = (items || []).filter((i) => i.backorder);
  const body = `
    ${heading("New order 🔥")}
    ${p(`<strong style="color:#fff">${esc(orderId)}</strong> · ${money(total)}${friendsFamily ? ` · <strong style="color:#fff">Friends & family</strong>` : ""}`)}
    ${itemsTable(items, total)}
    ${toSource.length ? p(`<strong style="color:#fff">⚠ To source:</strong> ${toSource.map((i) => `${esc(i.qty)}× ${esc(i.name)} (${esc(i.size)})`).join(", ")}`) : ""}
    ${p(`<strong style="color:#fff">Customer</strong><br>${esc(name || "—")}<br>${esc(email || "")}${phone ? "<br>" + esc(phone) : ""}`)}
    ${address ? p(`<strong style="color:#fff">Deliver to</strong><br>${esc(address)}`) : ""}
    ${button(adminUrl, "Open orders in admin")}
    ${p("Replying to this email goes straight to the customer.", `font-size:12px;color:${C.muted}`)}`;
  return {
    subject: `🛒 New order ${orderId} — ${money(total)}${toSource.length ? " (items to source)" : ""}`,
    html: layout({ body, shopUrl, logoUrl, preheader: `${(items || []).length} item(s) · ${money(total)}` }),
  };
}

/** A personal message to a customer, written in admin. Plain text in, line breaks kept. */
export function customerMessageEmail({ name, message, orderId, items, shopUrl, logoUrl }) {
  const paras = String(message || "").trim().split(/\n{2,}/).map((para) => p(esc(para).replace(/\n/g, "<br>"))).join("");
  const body = `
    ${paras}
    ${orderId ? `<p style="margin:22px 0 6px;font-family:${C.font};font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${C.muted}">Order ${esc(orderId)}</p>${itemsTable(items)}` : ""}
    ${p("Just reply to this email if you have any questions.", `color:${C.muted};font-size:13px`)}`;
  return layout({ body, shopUrl, logoUrl, preheader: String(message || "").slice(0, 90) });
}
