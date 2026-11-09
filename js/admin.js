(function () {
  const C = window.SHOP_CONFIG;
  const { sizeEntries, money, esc, imgTag, totalStock } = window.KERB;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  let products = [], orders = [], customers = [], campaigns = [], offers = [], messages = [];
  const msgsForOrder = id => messages.filter(m => m.order_id === id);

  let tt;
  function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2800); }
  const fmtDate = d => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const open = s => ($(s).hidden = false);
  const close = s => ($(s).hidden = true);
  $$(".overlay").forEach(o => o.addEventListener("click", e => { if (e.target === o || e.target.closest("[data-close]")) close("#" + o.id); }));

  function csv(rows, filename) {
    const keys = Object.keys(rows[0] || {});
    const body = [keys.join(","), ...rows.map(r => keys.map(k => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" })); a.download = filename; a.click();
  }

  // ---------- auth ----------
  async function boot() {
    const session = await Store.session();
    if (!session) { $("#login").hidden = false; $("#app").hidden = true; return; }
    $("#login").hidden = true; $("#app").hidden = false;
    $("#demoBanner").hidden = Store.live;
    $("#demoTools").hidden = Store.live;
    $("#modeInfo").innerHTML = Store.live
      ? `<span class="pill paid">Live</span> Connected to Supabase as <strong>${esc(session.user.email)}</strong>. Payments via Stripe Checkout; emails via Brevo.`
      : `<span class="pill">Demo</span> Running on browser storage. Checkout is simulated and emails are not sent. See README.md to go live.`;
    await loadAll();
  }
  $("#loginForm").onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    try { await Store.signIn(f.get("email"), f.get("password")); boot(); }
    catch (err) { $("#loginMsg").textContent = err.message; }
  };
  $("#signOut").onclick = async () => { await Store.signOut(); location.reload(); };

  async function loadAll() {
    try {
      [products, orders, customers, campaigns] = await Promise.all([
        Store.getProducts({ includeInactive: true }), Store.getOrders(), Store.getCustomers(), Store.getCampaigns()
      ]);
    } catch (err) { toast("Load failed: " + err.message); return; }
    try { messages = await Store.getAllMessages(); } catch (err) { messages = []; console.warn("Messages unavailable:", err.message); }
    renderDashboard(); renderStock(); renderOrders(); renderCustomers(); renderEmail();
    loadOffers();
  }
  async function loadOffers() {
    try { offers = await Store.getOffers(); } catch (err) { offers = []; console.warn("Offers unavailable:", err.message); }
    renderOffers();
  }

  // ---------- tabs ----------
  // Tabs work with the phone's back gesture: any tab → back → Dashboard (never straight out to the shop)
  const TABS = ["dashboard", "stock", "orders", "customers", "offers", "email", "settings"];
  let curTab = "dashboard";
  function showTab(tab) {
    curTab = tab;
    $$("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    $$("[data-panel]").forEach(p => (p.hidden = p.dataset.panel !== tab));
    window.scrollTo(0, 0);
    if (tab === "email") refreshWelcomeCodes();
  }
  function goTab(tab) {
    if (tab === curTab) return;
    if (tab === "dashboard") { if (history.state && history.state.tab && history.state.tab !== "dashboard") history.back(); else showTab(tab); return; }
    const url = location.pathname + location.search + "#" + tab;
    if (curTab === "dashboard") history.pushState({ tab }, "", url); else history.replaceState({ tab }, "", url);
    showTab(tab);
  }
  window.addEventListener("popstate", e => {
    const tab = (e.state && e.state.tab) || location.hash.slice(1) || "dashboard";
    $$(".overlay").forEach(o => (o.hidden = true));
    showTab(TABS.includes(tab) ? tab : "dashboard");
  });
  {
    const start = location.hash.slice(1);
    history.replaceState({ tab: "dashboard" }, "", location.pathname + location.search);
    if (TABS.includes(start) && start !== "dashboard") { history.pushState({ tab: start }, "", location.pathname + location.search + "#" + start); showTab(start); }
  }
  $("#tabs").addEventListener("click", e => { const tab = e.target.dataset.tab; if (tab) goTab(tab); });

  // ---------- dashboard ----------
  function renderDashboard() {
    const paid = orders.filter(o => o.status !== "refunded");
    const revenue = paid.reduce((a, o) => a + Number(o.total), 0);
    const month = new Date().toISOString().slice(0, 7);
    const monthRev = paid.filter(o => o.created_at.startsWith(month)).reduce((a, o) => a + Number(o.total), 0);
    const units = products.reduce((a, p) => a + totalStock(p), 0);
    const subs = customers.filter(c => c.marketing_opt_in).length;
    const toShip = orders.filter(o => o.status === "paid" || o.status === "packed").length;
    $("#kpis").innerHTML = [
      ["Revenue (all time)", money(revenue)], ["This month", money(monthRev)], ["Orders to ship", toShip],
      ["Units in stock", units], ["Customers", customers.length], ["Subscribers", subs]
    ].map(([l, v], i) => `<button type="button" class="kpi kpi-link" data-kpi="${i}"><div class="label">${l}</div><div class="val">${v}</div></button>`).join("");

    // What he actually has on the shelf (sizes with 1+ in stock), grouped by product
    const have = [];
    products.forEach(p => sizeEntries(p).forEach(([s, n]) => { if (n > 0) have.push({ p, s, n }); }));
    $("#lowStock").innerHTML = have.length ? have.map(({ p, s, n }) =>
      `<button type="button" class="mini mini-link" data-goprod="${esc(p.id)}"><span>${esc(p.name)} — ${esc(s)}${p.active ? "" : ' <span class="small">(hidden)</span>'}</span><span><span class="pill ${n <= C.lowStockThreshold ? "packed" : "on"}">${n} in stock</span> ›</span></button>`).join("")
      : `<p class="small">Nothing in stock right now — everything is ordered in.</p>`;
    $("#recentOrders").innerHTML = orders.length ? orders.slice(0, 6).map(o =>
      `<button type="button" class="mini mini-link" data-goto="${esc(o.id)}"><span>${esc(o.id)} · ${esc(o.customer_email)}</span><span>${money(o.total)} <span class="pill ${o.status}">${o.status}</span> ›</span></button>`).join("")
      : `<p class="small">No orders yet.</p>`;
  }

  // ---------- stock ----------
  function renderStock() {
    const term = $("#stockSearch").value.toLowerCase();
    const list = products.filter(p => (p.name + p.category).toLowerCase().includes(term));
    $("#stockTable").innerHTML = `<thead><tr><th></th><th>Product</th><th>Price</th><th>Stock by size (edit inline)</th><th>Total</th><th>Status / when out of stock</th></tr></thead><tbody>` +
      list.map(p => `<tr class="pc">
        <td class="pc-img">${imgTag(p.image, p.name, "thumb")}</td>
        <td class="pc-name"><a href="#" data-edit="${esc(p.id)}"><strong>${esc(p.name)}</strong></a><div class="small">${esc(p.category)}</div>${p.active ? `<button type="button" class="link small copy-link" data-link="${esc(p.id)}">🔗 Copy link</button>` : ""}</td>
        <td class="pc-price">${money(p.price)}</td>
        <td class="pc-sizes"><div class="stock-cells">${sizeEntries(p).map(([s, n]) =>
          `<label class="sc ${n == 0 ? "zero" : n <= C.lowStockThreshold ? "low" : ""}"><small>${esc(s)}</small><input type="number" min="0" value="${n}" data-pid="${esc(p.id)}" data-size="${esc(s)}"></label>`).join("")}</div></td>
        <td class="pc-total"><strong>${totalStock(p)}</strong><span class="pc-label"> in stock</span></td>
        <td class="pc-status">${p.active ? '<span class="pill on">Live</span>' : '<span class="pill">Hidden</span>'}
          <div class="small" style="margin-top:.3rem">${p.allow_backorder !== false ? "Wait time: " + esc(p.lead_time || "5–8 business days") : "No orders when out of stock"}</div>
          <div class="small">Delivery: ${money(p.shipping_cost ?? C.shippingCost)}</div></td></tr>`).join("") + "</tbody>";
  }
  $("#stockSearch").oninput = renderStock;
  $("#stockTable").addEventListener("change", async e => {
    const i = e.target; if (!i.dataset.pid) return;
    const p = products.find(x => x.id === i.dataset.pid);
    p.sizes = { ...p.sizes, [i.dataset.size]: Math.max(0, parseInt(i.value || 0, 10)) };
    try { await Store.saveProduct(p); toast(`Stock updated: ${p.name} ${i.dataset.size} → ${p.sizes[i.dataset.size]}`); renderStock(); renderDashboard(); }
    catch (err) { toast(err.message); }
  });
  $("#stockTable").addEventListener("click", e => { const a = e.target.closest("[data-edit]"); if (a) { e.preventDefault(); editProduct(a.dataset.edit); } });
  // Shareable product link (for TikTok bio, Snapchat, WhatsApp…)
  $("#stockTable").addEventListener("click", async e => {
    const b = e.target.closest("[data-link]"); if (!b) return;
    const url = location.origin + location.pathname.replace(/[^/]*$/, "") + "p/" + encodeURIComponent(b.dataset.link) + "/";
    try { await navigator.clipboard.writeText(url); toast("Link copied: " + url); } catch { prompt("Copy this link:", url); }
  });
  $("#addProduct").onclick = () => editProduct(null);

  const PRESETS = {
    shoe: ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"],
    clothing: ["XS", "S", "M", "L", "XL", "XXL"],
    one: ["One size"]
  };
  function sizeRow(s = "", n = 0) {
    return `<div class="size-row"><input placeholder="Size" value="${esc(s)}"><input type="number" min="0" value="${n}"><button type="button" data-rmsize>×</button></div>`;
  }
  function editProduct(id) {
    const p = products.find(x => x.id === id) || { name: "", category: "trainers", price: "", badge: "", image: "", description: "", active: true, sizes: Object.fromEntries(PRESETS.shoe.map(s => [s, 0])) };
    const f = $("#productForm");
    f.dataset.id = p.id || "";
    $("#peTitle").textContent = p.id ? "Edit product" : "New product";
    ["name", "category", "price", "badge", "image", "description"].forEach(k => (f.elements[k].value = p[k] ?? ""));
    f.elements.active.checked = !!p.active;
    f.elements.allow_backorder.checked = p.allow_backorder !== false;
    f.elements.lead_time.value = p.lead_time || "5–8 business days";
    $("#sizeRows").innerHTML = sizeEntries(p).map(([s, n]) => sizeRow(s, n)).join("");
    $("#deleteProduct").hidden = !p.id;
    f.elements.family_price.value = p.family_price ?? "";
    f.elements.shipping_cost.value = p.shipping_cost ?? C.shippingCost;
    $("#offerBox").hidden = !p.id; // offers need a saved product
    $("#ofEmail").value = ""; $("#ofName").value = ""; $("#ofMsg").textContent = "";
    $("#ofPrice").value = p.family_price ?? "";
    $("#ofQty").value = "1"; $("#ofDays").value = "14";
    previewImg();
    open("#productEditor");
  }
  function previewImg() { const v = $("#productForm").elements.image.value; $("#imgPreview").innerHTML = imgTag(v, $("#productForm").elements.name.value || "Preview"); }
  $("#productForm").elements.image.oninput = previewImg;
  $("#photoInput").onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const msg = $("#uploadMsg"); const btn = $(".upload-btn");
    msg.textContent = "Uploading…"; btn.style.opacity = .5;
    try {
      const url = await Store.uploadImage(file);
      $("#productForm").elements.image.value = url;
      previewImg();
      msg.textContent = "Photo added ✓ — remember to Save product.";
    } catch (err) { msg.textContent = "Upload failed: " + err.message; }
    btn.style.opacity = 1; e.target.value = "";
  };
  $("#addSize").onclick = () => $("#sizeRows").insertAdjacentHTML("beforeend", sizeRow());
  $("#sizeRows").addEventListener("click", e => { if (e.target.dataset.rmsize !== undefined) e.target.parentElement.remove(); });
  $$("[data-preset]").forEach(b => b.onclick = () => ($("#sizeRows").innerHTML = PRESETS[b.dataset.preset].map(s => sizeRow(s, 0)).join("")));
  $("#productForm").onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    const sizes = {};
    $$("#sizeRows .size-row").forEach(r => { const [s, n] = r.querySelectorAll("input"); if (s.value.trim()) sizes[s.value.trim()] = Math.max(0, parseInt(n.value || 0, 10)); });
    const p = { ...(products.find(x => x.id === f.dataset.id) || {}), id: f.dataset.id || undefined,
      name: f.elements.name.value.trim(), category: f.elements.category.value, price: Number(f.elements.price.value),
      badge: f.elements.badge.value.trim(), image: f.elements.image.value.trim(), description: f.elements.description.value.trim(),
      active: f.elements.active.checked, sizes,
      allow_backorder: f.elements.allow_backorder.checked, lead_time: f.elements.lead_time.value.trim() || "5–8 business days",
      family_price: f.elements.family_price.value === "" ? null : Number(f.elements.family_price.value),
      shipping_cost: f.elements.shipping_cost.value === "" ? C.shippingCost : Math.max(0, Number(f.elements.shipping_cost.value)) };
    if (!p.id) delete p.id;
    try { await Store.saveProduct(p); close("#productEditor"); toast("Product saved"); loadAll(); }
    catch (err) { toast(err.message); }
  };
  $("#deleteProduct").onclick = async () => {
    const id = $("#productForm").dataset.id;
    if (!id || !confirm("Delete this product permanently? (Tip: untick 'Visible' to hide it instead.)")) return;
    await Store.deleteProduct(id); close("#productEditor"); toast("Product deleted"); loadAll();
  };

  // ---------- friends & family offers ----------
  $("#ofSend").onclick = async () => {
    const id = $("#productForm").dataset.id;
    const email = $("#ofEmail").value.trim(), price = $("#ofPrice").value;
    const msg = $("#ofMsg");
    if (!email) return (msg.textContent = "Enter their email address.");
    if (price === "") return (msg.textContent = "Enter their price.");
    const btn = $("#ofSend"); btn.disabled = true; msg.textContent = "Sending…";
    try {
      const res = await Store.sendOffer({ product_id: id, email, name: $("#ofName").value.trim(), price: Number(price),
        max_qty: Number($("#ofQty").value), expires_days: Number($("#ofDays").value) });
      msg.innerHTML = (res.emailed ? `✓ Sent to ${esc(email)}. ` : `⚠ ${esc(res.error || "Email failed")} — you can send them the link yourself: `)
        + `<a href="${esc(res.url)}" target="_blank" rel="noopener">their link</a> <button type="button" class="copy-link" data-copy="${esc(res.url)}">copy link</button>`;
      $("#ofEmail").value = ""; $("#ofName").value = "";
      loadOffers();
    } catch (err) { msg.textContent = "Couldn't send: " + err.message; }
    btn.disabled = false;
  };
  document.addEventListener("click", e => {
    const c = e.target.closest("[data-copy]"); if (!c) return;
    try { navigator.clipboard.writeText(c.dataset.copy); toast("Link copied"); } catch { toast(c.dataset.copy); }
  });
  function offerStatus(o) {
    if (o.status === "used") return ["used", "Used"];
    if (o.status === "cancelled") return ["closed", "Cancelled"];
    if (o.expires_at && new Date(o.expires_at) < new Date()) return ["closed", "Expired"];
    if (o.status === "reserved") return ["open", "At checkout"];
    return ["open", "Not used yet"];
  }
  function renderOffers() {
    const f = $("#offerFilter").value;
    const shop = location.origin + location.pathname.replace(/admin\.html$/, "");
    const term = $("#offerSearch").value.trim().toLowerCase();
    const text = o => [o.name, o.email, o.products?.name, o.product_id, o.note, o.order_id].join(" ").toLowerCase();
    const list = offers.filter(o => (!f || offerStatus(o)[0] === f) && (!term || term.split(/\s+/).every(w => text(o).includes(w))));
    $("#offersTable").innerHTML = `<thead><tr><th>Sent</th><th>To</th><th>Item</th><th>Price</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody>` +
      (list.length ? list.map(o => {
        const [kind, label] = offerStatus(o);
        const pill = kind === "used" ? "paid" : kind === "closed" ? "refunded" : "packed";
        const link = `${shop}?offer=${encodeURIComponent(o.token)}`;
        return `<tr>
          <td>${fmtDate(o.created_at)}</td>
          <td>${esc(o.name || "")}<div class="small">${esc(o.email)}</div></td>
          <td>${esc(o.products?.name || o.product_id)}${o.max_qty > 1 ? `<div class="small">up to ${o.max_qty} items</div>` : ""}</td>
          <td>${money(o.price)}</td>
          <td>${o.expires_at ? fmtDate(o.expires_at) : "Never"}</td>
          <td><span class="pill ${pill}">${label}</span>${o.order_id ? `<div class="small">${esc(o.order_id)}</div>` : ""}</td>
          <td>${kind === "open" ? `<button class="copy-link" data-copy="${esc(link)}">copy link</button> <button class="copy-link" data-cancel="${esc(o.token)}">cancel</button>` : ""}</td></tr>`;
      }).join("") : `<tr><td colspan="7" class="small">${term || f ? "No offers match your search." : Store.live ? "No offers yet. Open a product in Stock to send one." : "Offers work once the shop is live (connected to Supabase)."}</td></tr>`) + "</tbody>";
  }
  $("#offerFilter").onchange = renderOffers;
  $("#offerSearch").oninput = renderOffers;
  $("#offersTable").addEventListener("click", async e => {
    const t = e.target.dataset.cancel; if (!t) return;
    if (!confirm("Cancel this offer? The link will stop working.")) return;
    try { await Store.cancelOffer(t); toast("Offer cancelled"); loadOffers(); } catch (err) { toast(err.message); }
  });

  // ---------- orders ----------
  const STATUSES = ["paid", "packed", "shipped", "delivered", "refunded"];
  function trackCell(o) {
    if (!o.tracking_number) return o.status === "shipped" || o.status === "delivered" ? `<button class="small link" data-ship="${esc(o.id)}">+ Add tracking</button>` : "";
    const url = window.EMAIL_T ? window.EMAIL_T.trackingUrl(o.carrier, o.tracking_number) : "";
    const num = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(o.tracking_number)}</a>` : esc(o.tracking_number);
    return `<div class="small">${esc(o.carrier || "")}</div>${num} <button class="small link" data-ship="${esc(o.id)}">edit</button>`;
  }
  // Welcome codes: offer to send personal codes to people who subscribed before codes were personal
  async function refreshWelcomeCodes() {
    if (!Store.live) { $("#wcStatus").textContent = "Works once the shop is live."; return; }
    try {
      const { pending } = await Store.welcomeCodes("count");
      $("#wcStatus").textContent = pending ? `${pending} subscriber${pending === 1 ? "" : "s"} (who haven't ordered yet) don't have a personal code.` : "Everyone on the list has a personal code (or has already ordered).";
      $("#wcSend").hidden = !pending;
    } catch (err) { $("#wcStatus").textContent = "Couldn't check welcome codes: " + err.message; }
  }
  $("#wcSend").onclick = async () => {
    if (!confirm("Email a personal one-use 5% code to every subscriber who hasn't got one yet and hasn't ordered?")) return;
    const b = $("#wcSend"); b.disabled = true; b.textContent = "Sending…";
    try {
      const r = await Store.welcomeCodes("send");
      toast(`Sent ${r.sent} code${r.sent === 1 ? "" : "s"}${r.failed ? ` · ${r.failed} failed` : ""}${r.limitHit ? " · daily email limit reached, try again tomorrow" : r.remaining ? ` · ${r.remaining} left — press again` : ""}`);
    } catch (err) { toast(err.message); }
    finally { b.disabled = false; b.textContent = "Send personal codes to existing subscribers"; refreshWelcomeCodes(); }
  };

  // "Message customer": write and send an email from inside admin; past messages show on the order
  let msgOrder = null;
  async function openMessage(id) {
    const o = orders.find(x => x.id === id); if (!o) return;
    msgOrder = o;
    const f = $("#msgForm"); f.reset();
    f.elements.subject.value = `Your HS Sourced It order ${o.id}`;
    const first = (o.customer_name || "").trim().split(/\s+/)[0];
    f.elements.message.value = `Hi${first ? " " + first : ""},\n\n\n\nThanks,\nHS Sourced It`;
    $("#msgTo").textContent = `To ${o.customer_name ? o.customer_name + " · " : ""}${o.customer_email} · order ${o.id}`;
    $("#msgHistory").innerHTML = "";
    open("#msgEditor");
    const ta = f.elements.message; const pos = ta.value.indexOf("\n\n") + 2; ta.focus(); ta.setSelectionRange(pos, pos);
    try {
      const msgs = msgsForOrder(o.id).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
      $("#msgHistory").innerHTML = msgs.length ? `<h3>Previous messages</h3>` + msgs.map(m => `<div class="msg ${m.direction === "in" ? "in" : "out"}">
        <div class="small">${m.direction === "in" ? "From customer" : "Sent"} · ${fmtDate(m.created_at)} · ${esc(m.subject)}</div><div class="msg-body">${esc(m.body)}</div></div>`).join("") : "";
    } catch (err) { /* history is a nice-to-have; sending still works */ }
  }
  $("#ordersTable").addEventListener("click", e => { const b = e.target.closest("[data-msg]"); if (b) openMessage(b.dataset.msg); });
  $("#msgForm").onsubmit = async e => {
    e.preventDefault(); const f = e.target; const btn = $("#msgSend");
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      const res = await Store.sendMessage(msgOrder.id, f.elements.subject.value.trim(), f.elements.message.value.trim());
      toast(res.demo ? "Saved (demo — email not sent)" : `Message sent to ${msgOrder.customer_email} ✓`);
      if (res.message) messages.unshift(res.message); else { try { messages = await Store.getAllMessages(); } catch (_) {} }
      close("#msgEditor"); renderOrders();
    } catch (err) { toast(err.message); }
    finally { btn.disabled = false; btn.textContent = "Send message"; }
  };
  function renderOrders() {
    const st = $("#orderFilter").value;
    const term = $("#orderSearch").value.trim().toLowerCase();
    const text = o => [o.id, o.customer_name, o.customer_email, o.shipping_address, o.tracking_number, o.status,
      ...(o.items || []).map(i => `${i.name} ${i.size}`)].join(" ").toLowerCase();
    const list = orders.filter(o => (!st || (st === "toship" ? (o.status === "paid" || o.status === "packed") : o.status === st)) && (!term || term.split(/\s+/).every(w => text(o).includes(w))));
    $("#ordersTable").innerHTML = `<thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Tracking</th></tr></thead><tbody>` +
      (list.length ? list.map(o => `<tr data-row="${esc(o.id)}" class="oc">
        <td class="oc-head"><strong>${esc(o.id)}</strong><span class="oc-date">${fmtDate(o.created_at)}</span><span class="oc-total">${money(o.total)}</span>${o.offer_token ? `<div><span class="pill on">Friends & family</span></div>` : ""}</td><td class="oc-hide">${fmtDate(o.created_at)}</td>
        <td class="oc-cust">${esc(o.customer_name || "")}<div class="small">${esc(o.customer_email)}</div>${o.shipping_address ? `<div class="small">${esc(o.shipping_address)}</div>` : ""}${o.customer_email ? `<button type="button" class="email-cust" data-msg="${esc(o.id)}">✉ Message customer</button>` : ""}${msgsForOrder(o.id).length ? `<button type="button" class="msg-count" data-msg="${esc(o.id)}">💬 ${msgsForOrder(o.id).length} message${msgsForOrder(o.id).length === 1 ? "" : "s"} · view</button>` : ""}</td>
        <td class="oc-items">${(o.items || []).map(i => `<div class="oc-item">${i.qty}× ${esc(i.name)} <span class="small">(${esc(i.size)})</span>${i.backorder ? ` <span class="pill wait">${esc(i.lead_time || "Out of stock")}</span>` : ""}</div>`).join("")}</td>
        <td class="oc-hide">${money(o.total)}</td>
        <td class="oc-status"><select data-oid="${esc(o.id)}">${STATUSES.map(s => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}</select></td>
        <td class="oc-track">${trackCell(o)}</td></tr>`).join("")
      : `<tr><td colspan="7" class="small">${$("#orderSearch").value.trim() || $("#orderFilter").value ? "No orders match your search." : "No orders."}</td></tr>`) + "</tbody>";
  }
  $("#orderFilter").onchange = renderOrders;
  $("#orderSearch").oninput = renderOrders;
  $("#ordersTable").addEventListener("change", async e => {
    const id = e.target.dataset.oid; if (!id) return;
    const o = orders.find(x => x.id === id);
    if (e.target.value === "shipped") { e.target.value = o.status; return openShip(o); }
    try { await Store.updateOrder(id, { status: e.target.value, carrier: o.carrier || "", tracking_number: o.tracking_number || "" }); o.status = e.target.value; toast(`${id} marked ${e.target.value}`); renderOrders(); renderDashboard(); }
    catch (err) { toast(err.message); }
  });
  $("#ordersTable").addEventListener("click", e => { const b = e.target.closest("[data-ship]"); if (b) openShip(orders.find(o => o.id === b.dataset.ship)); });

  // "Mark as shipped" dialog
  function openShip(o) {
    const f = $("#shipForm"); f.dataset.id = o.id;
    $("#shipTitle").textContent = `Ship ${o.id}`;
    $("#shipWho").textContent = `${o.customer_name || ""} ${o.customer_email}`.trim();
    const names = window.EMAIL_T ? window.EMAIL_T.CARRIER_NAMES : ["Royal Mail", "Evri", "DPD", "DHL", "UPS", "Parcelforce", "Yodel", "Other"];
    f.elements.carrier.innerHTML = names.map(n => `<option ${n === (o.carrier || "Royal Mail") ? "selected" : ""}>${n}</option>`).join("");
    f.elements.tracking_number.value = o.tracking_number || "";
    f.elements.notify.checked = o.status !== "shipped" && o.status !== "delivered";
    $("#shipNote").textContent = Store.live ? "" : "Demo mode — no email will actually be sent.";
    open("#shipEditor");
  }
  $("#previewShip").onclick = () => {
    const f = $("#shipForm"); const o = orders.find(x => x.id === f.dataset.id);
    showAutoPreview("shipped", { orderId: o.id, name: o.customer_name, items: o.items, carrier: f.elements.carrier.value, trackingNumber: f.elements.tracking_number.value });
    close("#shipEditor");
    goTab("email");
  };
  $("#shipForm").onsubmit = async e => {
    e.preventDefault(); const f = e.target; const o = orders.find(x => x.id === f.dataset.id);
    const patch = { status: "shipped", carrier: f.elements.carrier.value, tracking_number: f.elements.tracking_number.value.trim() };
    const btn = f.querySelector("button.btn-accent"); btn.disabled = true;
    try {
      const res = await Store.updateOrder(o.id, patch, f.elements.notify.checked);
      Object.assign(o, patch);
      close("#shipEditor"); renderOrders(); renderDashboard();
      toast(res.emailed ? `${o.id} shipped — customer emailed ✓` : res.demo && f.elements.notify.checked ? `${o.id} shipped (demo: email not sent)` : `${o.id} marked shipped`);
    } catch (err) { toast(err.message); }
    btn.disabled = false;
  };
  $("#exportOrders").onclick = () => csv(orders.map(o => ({ id: o.id, date: o.created_at, email: o.customer_email, name: o.customer_name, total: o.total, status: o.status,
    items: (o.items || []).map(i => `${i.qty}x ${i.name} (${i.size})`).join("; ") })), "orders.csv");

  // ---------- customers / CRM ----------
  function renderCustomers() {
    const term = $("#custSearch").value.toLowerCase();
    const cf = $("#custFilter").value;
    const list = customers.filter(c => [c.name, c.email, (c.tags || []).join(" ")].join(" ").toLowerCase().includes(term)
      && (!cf || (cf === "subs" ? c.marketing_opt_in : (c.order_count > 0 || orders.some(o => o.customer_email === c.email)))));
    $("#custTable").innerHTML = `<thead><tr><th>Customer</th><th>Tags</th><th>Orders</th><th>Spent</th><th>Marketing</th><th>Joined</th></tr></thead><tbody>` +
      (list.length ? list.map(c => `<tr class="click" data-email="${esc(c.email)}">
        <td><strong>${esc(c.name || "—")}</strong><div class="small">${esc(c.email)}</div></td>
        <td>${(c.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("")}</td>
        <td>${c.order_count || 0}</td><td>${money(c.total_spent)}</td>
        <td>${c.marketing_opt_in ? '<span class="pill on">Subscribed</span>' : '<span class="pill">No</span>'}</td>
        <td>${fmtDate(c.created_at)}</td></tr>`).join("")
      : `<tr><td colspan="6" class="small">No customers yet.</td></tr>`) + "</tbody>";
  }
  $("#custSearch").oninput = renderCustomers;
  $("#custFilter").onchange = renderCustomers;
  // Dashboard numbers open the matching list
  $("#kpis").addEventListener("click", e => {
    const k = e.target.closest("[data-kpi]"); if (!k) return;
    const i = Number(k.dataset.kpi);
    if (i <= 2) { goTab("orders"); $("#orderSearch").value = ""; $("#orderFilter").value = i === 2 ? "toship" : ""; renderOrders(); }
    else if (i === 3) { goTab("stock"); }
    else { goTab("customers"); $("#custSearch").value = ""; $("#custFilter").value = i === 5 ? "subs" : ""; renderCustomers(); }
  });
  $("#custTable").addEventListener("click", e => { const r = e.target.closest("[data-email]"); if (r) editCustomer(r.dataset.email); });
  $("#addCustomer").onclick = () => editCustomer(null);
  function editCustomer(email) {
    const c = customers.find(x => x.email === email) || { name: "", email: "", phone: "", tags: [], notes: "", marketing_opt_in: false };
    const f = $("#custForm"); f.dataset.email = c.email;
    ["name", "email", "phone", "notes"].forEach(k => (f.elements[k].value = c[k] || ""));
    f.elements.tags.value = (c.tags || []).join(", ");
    f.elements.marketing_opt_in.checked = !!c.marketing_opt_in;
    const theirs = orders.filter(o => o.customer_email === c.email);
    $("#custOrders").innerHTML = theirs.length ? theirs.map(o => `<button type="button" class="mini mini-link" data-goto="${esc(o.id)}"><span>${esc(o.id)} · ${fmtDate(o.created_at)}</span><span>${money(o.total)} <span class="pill ${o.status}">${o.status}</span> ›</span></button>`).join("") : "No orders yet.";
    $("#custCode").innerHTML = c.welcome_code
      ? `Welcome code: <strong>${esc(c.welcome_code)}</strong>${c.welcome_code_expires_at ? ` · ${new Date(c.welcome_code_expires_at) < new Date() ? "expired" : "use by"} ${fmtDate(c.welcome_code_expires_at)}` : ""} <span class="small">(Stripe shows whether it's been used)</span>` : "";
    $("#deleteCustomer").hidden = !c.email;
    open("#custEditor");
  }
  // Click an order in a customer's history → jump to it on the Orders tab
  function goToOrder(id) {
    close("#custEditor");
    goTab("orders");
    $("#orderFilter").value = ""; renderOrders();
    const row = $$("#ordersTable tr[data-row]").find(r => r.dataset.row === id);
    if (!row) return toast("Couldn't find that order");
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash");
  }
  $("#recentOrders").addEventListener("click", e => { const b = e.target.closest("[data-goto]"); if (b) goToOrder(b.dataset.goto); });
  $("#lowStock").addEventListener("click", e => { const b = e.target.closest("[data-goprod]"); if (b) { goTab("stock"); editProduct(b.dataset.goprod); } });
  $("#custOrders").addEventListener("click", e => { const b = e.target.closest("[data-goto]"); if (b) goToOrder(b.dataset.goto); });
  $("#custForm").onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    const existing = customers.find(x => x.email === f.dataset.email) || {};
    const c = { ...existing, name: f.elements.name.value.trim(), email: f.elements.email.value.trim().toLowerCase(), phone: f.elements.phone.value.trim(),
      tags: f.elements.tags.value.split(",").map(t => t.trim().toLowerCase()).filter(Boolean), notes: f.elements.notes.value, marketing_opt_in: f.elements.marketing_opt_in.checked };
    try { await Store.saveCustomer(c); close("#custEditor"); toast("Customer saved"); loadAll(); } catch (err) { toast(err.message); }
  };
  $("#deleteCustomer").onclick = async () => {
    const email = $("#custForm").dataset.email;
    if (!email || !confirm(`Delete ${email} and their CRM record?`)) return;
    await Store.deleteCustomer(email); close("#custEditor"); toast("Customer deleted"); loadAll();
  };
  $("#exportCustomers").onclick = () => csv(customers.map(c => ({ name: c.name, email: c.email, phone: c.phone, tags: (c.tags || []).join(" "), orders: c.order_count, spent: c.total_spent, marketing: c.marketing_opt_in, notes: c.notes })), "customers.csv");

  // ---------- email ----------
  const TEMPLATES = {
    drop: { subject: "🔥 New drop lands Friday", html: `<h1>New drop. Friday 7pm.</h1>\n<p>Fresh trainers and tracksuits are landing this Friday. Subscribers get first access.</p>\n<p><a href="SHOP_URL" class="btn">Shop the drop</a></p>` },
    restock: { subject: "It's back. Restock just landed.", html: `<h1>Back in stock.</h1>\n<p>The pieces you missed are back — but not for long. Sizes are limited.</p>\n<p><a href="SHOP_URL" class="btn">Grab yours</a></p>` },
    sale: { subject: "20% off this weekend only", html: `<h1>20% off. 48 hours.</h1>\n<p>Use code <strong>HS20</strong> at checkout. Ends Sunday midnight.</p>\n<p><a href="SHOP_URL" class="btn">Shop the sale</a></p>` }
  };
  const shopUrl = () => location.origin + location.pathname.replace(/admin\.html$/, "");
  const logoUrl = () => shopUrl() + "images/logo.png";
  const fakeUnsub = h => h.replace("{{unsubscribe}}", '<a href="#" style="color:#999">Unsubscribe</a>');
  function wrapEmail(inner) {
    if (!window.EMAIL_T) return inner;
    return window.EMAIL_T.campaignEmail({ inner, shopUrl: shopUrl(), logoUrl: logoUrl() });
  }
  // Previews of the automatic emails
  const SAMPLE_ITEMS = [{ name: "Travis Scott x Jordan 1 Low 'Olive'", size: "UK 9", qty: 1, price: 220 }];
  function showAutoPreview(kind, data = {}) {
    const T = window.EMAIL_T; if (!T) return toast("Email designs still loading — try again");
    const base = { shopUrl: shopUrl(), logoUrl: logoUrl() };
    const e = kind === "welcome" ? T.welcomeEmail({ ...base, name: "Jayden", code: "WELCOME-7KQ2MX", percent: C.welcomePercent, expiresAt: new Date(Date.now() + 30 * 86400000), ...data })
      : kind === "order" ? T.orderConfirmedEmail({ ...base, orderId: "ORD-7F3K2Q", name: "Jayden Reid", items: SAMPLE_ITEMS, total: 220, address: "12 High Street, Leeds, LS1 4AB", ...data })
      : T.orderShippedEmail({ ...base, orderId: "ORD-7F3K2Q", name: "Jayden Reid", items: SAMPLE_ITEMS, carrier: "Royal Mail", trackingNumber: "AB123456789GB", ...data });
    $("#preview").srcdoc = fakeUnsub(e.html);
    $("#previewSubject").textContent = "Subject: " + e.subject;
  }
  $("#autoEmails").addEventListener("click", e => { const k = e.target.dataset.auto; if (k) showAutoPreview(k); });
  function segments() {
    const tags = new Set(); customers.forEach(c => (c.tags || []).forEach(t => tags.add(t)));
    return ["all", ...tags];
  }
  function segCount() {
    const s = $("#segment").value;
    const n = customers.filter(c => c.marketing_opt_in && (s === "all" || (c.tags || []).includes(s))).length;
    $("#segCount").textContent = `${n} subscribed recipient${n === 1 ? "" : "s"}`;
  }
  function renderEmail() {
    const cur = $("#segment").value || "all";
    $("#segment").innerHTML = segments().map(s => `<option value="${esc(s)}" ${s === cur ? "selected" : ""}>${s === "all" ? "All subscribers" : "Tag: " + esc(s)}</option>`).join("");
    segCount();
    $("#campaignList").innerHTML = campaigns.length ? campaigns.map(c => `<div class="mini"><span>${esc(c.subject)}<div class="small">${fmtDate(c.created_at)} · ${esc(c.segment)}</div></span><span>${c.recipients} sent ${c.status ? `<span class="pill">${esc(c.status)}</span>` : ""}</span></div>`).join("") : `<p class="small">No campaigns yet.</p>`;
  }
  $("#segment").onchange = segCount;
  $("#template").onchange = e => { const t = TEMPLATES[e.target.value]; if (!t) return; const f = $("#campaignForm"); f.elements.subject.value = t.subject; f.elements.html.value = t.html; preview(); };
  function preview() { $("#preview").srcdoc = fakeUnsub(wrapEmail($("#campaignForm").elements.html.value)); $("#previewSubject").textContent = "Subject: " + ($("#campaignForm").elements.subject.value || "—"); }
  $("#previewBtn").onclick = preview;
  $("#campaignForm").elements.html.oninput = preview;
  $("#campaignForm").onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    const segment = $("#segment").value;
    const n = parseInt($("#segCount").textContent, 10) || 0;
    const warn = n > 300 ? `\n\nHeads up: Brevo's free plan sends 300 emails a day, so only about 300 will go today.` : "";
    if (!confirm(`Send "${f.elements.subject.value}" to ${$("#segCount").textContent}?${warn}`)) return;
    try {
      const res = await Store.sendCampaign({ subject: f.elements.subject.value, inner: f.elements.html.value, html: wrapEmail(f.elements.html.value), segment });
      if (res.demo) {
        toast(`Demo: would send to ${res.sent}. Recipient list copied to clipboard.`);
        navigator.clipboard?.writeText(res.emails.join(", ")).catch(() => {});
      } else if (res.limitHit) toast(`Sent ${res.sent} of ${res.total} — Brevo's daily limit was reached.`);
      else toast(`Sent to ${res.sent} subscribers${res.failed ? ` (${res.failed} failed)` : ""}`);
      f.reset(); preview(); campaigns = await Store.getCampaigns(); renderEmail();
    } catch (err) { toast(err.message); }
  };

  // ---------- settings ----------
  $("#backupBtn").onclick = async () => {
    const data = await Store.exportAll();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `hs-sourced-it-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  $("#resetDemo").onclick = () => { if (confirm("Reset all demo data?")) { Store.resetDemo(); location.reload(); } };

  window.addEventListener("email-templates-ready", () => { if (orders.length) renderOrders(); });
  boot();
})();
