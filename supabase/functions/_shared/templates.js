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
      <td style="padding:10px 0;border-bottom:1px solid ${C.line};font-family:${C.font};font-size:14px;color:${C.text}">${esc(i.qty)}× ${esc(i.name)}<br><span style="color:${C.muted};font-size:12px">Size ${esc(i.size)}</span>${i.backorder ? `<br><span style="color:${C.text};font-size:12px;font-weight:bold">Pre-order — ships in ${esc(i.lead_time || "5–8 business days")}</span>` : ""}</td>
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
    <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:6px;padding:32px 28px">${body}</td></tr>
    <tr><td align="center" style="padding:20px 10px;font-family:${C.font};font-size:12px;line-height:1.6;color:#777">
      HS Sourced It · <a href="${esc(shopUrl)}" style="color:#999">Visit the shop</a>${footer ? "<br>" + footer : ""}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

/** Welcome email sent when someone joins the list. */
export function welcomeEmail({ name, code, percent = 10, shopUrl, logoUrl }) {
  const hi = first(name) ? `Welcome, ${esc(first(name))}.` : "Welcome in.";
  const body = `
    ${heading("You're on the list.")}
    ${p(`${hi} You'll be first to hear about new drops, restocks and members-only deals — before anyone else.`)}
    ${p(`As promised, here's <strong style="color:#fff">${esc(percent)}% off your first order</strong>:`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr>
      <td align="center" style="border:2px dashed #ffffff;border-radius:4px;padding:18px;font-family:${C.font};font-size:28px;font-weight:900;letter-spacing:4px;color:#ffffff">${esc(code)}</td></tr></table>
    ${p("Enter it at checkout. One use per customer.", `font-size:13px;color:${C.muted};text-align:center`)}
    ${button(shopUrl, "Shop now")}
    ${p("Got a question or looking for something specific? Just reply to this email — it comes straight to us.")}`;
  return {
    subject: `Welcome to HS Sourced It — here's ${percent}% off`,
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
    ${(items || []).some((i) => i.backorder) ? p("Items marked <strong style=\"color:#fff\">pre-order</strong> are being sourced for you and will ship within the time shown. If your order has in-stock items too, we'll send everything together.") : ""}
    ${p("We'll email you again with tracking as soon as it's on its way.")}
    ${p("Any problems? Just reply to this email.", `color:${C.muted};font-size:13px`)}`;
  return { subject: `Order ${orderId} confirmed 🔥`, html: layout({ body, shopUrl, logoUrl, preheader: "We've got your order." }) };
}

const CARRIERS = {
  "Royal Mail": (n) => `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(n)}`,
  "Evri": (n) => `https://www.evri.com/track/parcel/${encodeURIComponent(n)}`,
  "DPD": (n) => `https://track.dpd.co.uk/parcels/${encodeURIComponent(n)}`,
  "DHL": (n) => `https://www.dhl.com/gb-en/home/tracking.html?tracking-id=${encodeURIComponent(n)}`,
  "UPS": (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  "Parcelforce": (n) => `https://www.parcelforce.com/track-trace?trackNumber=${encodeURIComponent(n)}`,
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
  const body = String(inner)
    .replaceAll("SHOP_URL", shopUrl)
    .replace(/<h1>/g, `<h1 style="margin:0 0 14px;font-family:${C.font};font-size:30px;line-height:1.1;font-weight:900;text-transform:uppercase;color:${C.text}">`)
    .replace(/<p>/g, `<p style="margin:0 0 14px;font-family:${C.font};font-size:15px;line-height:1.6;color:#d6d6d6">`)
    .replace(/<a ([^>]*)class="btn"([^>]*)>/g, `<a $1$2 style="display:inline-block;margin:10px 0;padding:14px 26px;border:2px solid #ffffff;color:#ffffff;font-family:${C.font};font-size:14px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;border-radius:3px">`);
  return layout({ body, shopUrl, logoUrl, preheader,
    footer: `You're receiving this because you signed up at HS Sourced It. {{unsubscribe}}` });
}
