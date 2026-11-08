(function () {
  const C = window.SHOP_CONFIG;
  const { sizeEntries, money, esc, imgTag, totalStock, canPreorder, leadTime, stockOf, maxQty, shipCostOf, deliveryFor } = window.KERB;
  const FREE_N = C.freeShippingMinItems;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  let products = [];
  let filter = "all";
  let sort = "featured";
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem("hs_cart") || "[]"); } catch {}

  // ---------- static content from config ----------
  $("#logo").innerHTML = esc(C.brand) + (C.brandSuffix ? `<span>${esc(C.brandSuffix)}</span>` : "");
  if (C.logo) $("#heroLogo").src = C.logo;
  $("#tagline").textContent = C.tagline;
  $("#welcomePct").textContent = C.welcomePercent;
  $("#freeShip").textContent = `When you order ${FREE_N} or more items`;
  $("#lookA").style.backgroundImage = `url("${C.lookbookImages[0]}")`;
  $("#lookB").style.backgroundImage = `url("${C.lookbookImages[1]}")`;
  $("#contactLink").href = C.contactUrl || "mailto:" + C.contactEmail;
  if (C.contactUrl) { $("#contactLink").target = "_blank"; $("#contactLink").rel = "noopener"; }
  $("#ttLink").href = C.tiktok;
  $("#year").textContent = new Date().getFullYear();
  const tick = [`Free UK delivery on ${FREE_N}+ items`, `Join the list for ${C.welcomePercent}% off`];
  $("#ticker").innerHTML = [...tick, ...tick, ...tick, ...tick].map(t => `<span>${esc(t)} ✦</span>`).join("");

  // ---------- toast ----------
  let tt;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ---------- render grid ----------
  function renderGrid() {
    let list = products.filter(p => filter === "all" || p.category === filter);
    if (sort === "low") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "high") list = [...list].sort((a, b) => b.price - a.price);
    if (!list.length) { $("#grid").innerHTML = `<p class="empty">Nothing here yet — check back for the next drop.</p>`; return; }
    $("#grid").innerHTML = list.map((p, i) => {
      const stock = totalStock(p);
      const badge = stock === 0 ? (canPreorder(p) ? `<span class="badge out">Order now</span>` : `<span class="badge out">Sold out</span>`)
        : p.badge ? `<span class="badge ${p.badge.toLowerCase() === "sale" ? "sale" : ""}">${esc(p.badge)}</span>` : "";
      const low = stock > 0 && stock <= C.lowStockThreshold * 2 ? `<div class="low">Selling fast</div>` : "";
      return `<article class="card" data-id="${esc(p.id)}" style="animation-delay:${i * 40}ms" tabindex="0">
        <div class="card-img">${imgTag(p.image, p.name)}${badge}<div class="quick">Quick view</div></div>
        <div class="card-info"><div><h3>${esc(p.name)}</h3><div class="cat">${esc(p.category)}</div>${low}</div><div class="price">${money(p.price)}</div></div>
      </article>`;
    }).join("");
  }

  // ---------- product modal ----------
  function openProduct(id) {
    const p = products.find(x => x.id === id); if (!p) return;
    let selected = null;
    const sizes = sizeEntries(p);
    $("#productBody").innerHTML = `<div class="pm">
      <div class="pm-img">${imgTag(p.image, p.name)}</div>
      <div class="pm-info">
        <p class="eyebrow">${esc(p.category)}</p>
        <h2>${esc(p.name)}</h2>
        <div class="pm-price">${money(p.price)}</div>
        <p class="small">Delivery ${shipCostOf(p) > 0 ? money(shipCostOf(p)) : "free"} · free when you order ${FREE_N}+ items</p>
        <p class="pm-desc">${esc(p.description)}</p>
        <div><p class="small" style="margin-bottom:.5rem">SELECT SIZE</p>
          <div class="sizes">${sizes.map(([s, n]) => `<button class="size ${n > 0 ? "" : "pre"}" data-size="${esc(s)}" ${n > 0 || canPreorder(p) ? "" : "disabled"} title="${n > 0 ? "In stock" : canPreorder(p) ? "Pre-order: ships in " + esc(leadTime(p)) : "Sold out"}">${esc(s)}</button>`).join("")}</div>
          ${canPreorder(p) && sizes.some(([, n]) => n <= 0) ? `<p class="small pre-key">Dashed sizes are out of stock — order now, ships in ${esc(leadTime(p))}.</p>` : ""}</div>
        <div class="stock-note" id="stockNote"></div>
        <button class="btn btn-accent btn-block" id="addBtn" disabled>Select a size</button>
      </div></div>`;
    $$("#productBody .size").forEach(b => b.onclick = () => {
      $$("#productBody .size").forEach(x => x.classList.remove("sel"));
      b.classList.add("sel"); selected = b.dataset.size;
      const n = stockOf(p, selected);
      $("#stockNote").textContent = n <= 0 ? `Out of stock — order now and it ships in ${leadTime(p)}`
        : n <= C.lowStockThreshold ? `Only ${n} left in ${selected}` : "In stock";
      $("#addBtn").disabled = false; $("#addBtn").textContent = "Add to bag — " + money(p.price);
    });
    $("#addBtn").onclick = () => { addToCart(p, selected); close("#productOverlay"); };
    open("#productOverlay");
  }

  // ---------- friends & family offer (one-time link: ?offer=TOKEN) ----------
  let activeOffer = null;
  function offerBanner(html) {
    document.querySelector(".offer-banner")?.remove();
    $("#hero").insertAdjacentHTML("beforebegin", `<div class="offer-banner">${html}</div>`);
  }
  function openOffer(o) {
    const p = o.product; let selected = null;
    const sizes = sizeEntries(p);
    const qtyPicker = o.max_qty > 1
      ? `<label class="small">Quantity <select id="offerQty">${Array.from({ length: o.max_qty }, (_, i) => `<option>${i + 1}</option>`).join("")}</select></label>` : "";
    $("#productBody").innerHTML = `<div class="pm">
      <div class="pm-img">${imgTag(p.image, p.name)}</div>
      <div class="pm-info">
        <p class="eyebrow">Friends & family price${o.name ? " for " + esc(o.name) : ""}</p>
        <h2>${esc(p.name)}</h2>
        <div class="pm-price">${money(o.price)} ${Number(p.price) > o.price ? `<span class="was">${money(p.price)}</span>` : ""}</div>
        <p class="pm-desc">${esc(p.description || "")}</p>
        <div><p class="small" style="margin-bottom:.5rem">SELECT SIZE</p>
          <div class="sizes">${sizes.map(([s, n]) => `<button class="size ${n > 0 ? "" : "pre"}" data-size="${esc(s)}" ${n > 0 || canPreorder(p) ? "" : "disabled"}>${esc(s)}</button>`).join("")}</div>
          ${canPreorder(p) && sizes.some(([, n]) => n <= 0) ? `<p class="small pre-key">Dashed sizes are out of stock — order now, ships in ${esc(leadTime(p))}.</p>` : ""}</div>
        ${qtyPicker}
        <div class="stock-note" id="stockNote"></div>
        <button class="btn btn-accent btn-block" id="addBtn" disabled>Select a size</button>
        <p class="small">This price is personal to you and works for one order${o.max_qty > 1 ? ` (up to ${o.max_qty} items)` : ""}. It can't be combined with other discount codes.</p>
      </div></div>`;
    $$("#productBody .size").forEach(b => b.onclick = () => {
      $$("#productBody .size").forEach(x => x.classList.remove("sel"));
      b.classList.add("sel"); selected = b.dataset.size;
      const n = stockOf(p, selected);
      $("#stockNote").textContent = n <= 0 ? `Out of stock — order now and it ships in ${leadTime(p)}` : "In stock";
      $("#addBtn").disabled = false; $("#addBtn").textContent = "Buy now — " + money(o.price);
    });
    $("#addBtn").onclick = async () => {
      const qty = o.max_qty > 1 ? parseInt($("#offerQty").value, 10) : 1;
      const btn = $("#addBtn"); btn.disabled = true; btn.textContent = "Taking you to checkout…";
      try { await Store.checkout([{ id: p.id, size: selected, qty, name: p.name, price: o.price }], undefined, o.token); }
      catch (err) { toast(err.message); btn.disabled = false; btn.textContent = "Buy now — " + money(o.price); }
    };
    open("#productOverlay");
  }
  async function loadOffer(token) {
    try {
      const o = await Store.getOffer(token);
      if (!o.valid) { offerBanner(`<strong>Friends & family offer</strong> ${esc(o.reason || "This offer isn't available.")}`); return; }
      activeOffer = o;
      offerBanner(`<strong>Friends & family price</strong> ${esc(o.product.name)} for ${money(o.price)} — just for you. <button class="link" id="offerOpen">View</button>`);
      $("#offerOpen").onclick = () => openOffer(o);
      openOffer(o);
    } catch (err) { offerBanner(`<strong>Friends & family offer</strong> Couldn't load your offer — please try the link again.`); }
  }

  // ---------- cart ----------
  function saveCart() { try { localStorage.setItem("hs_cart", JSON.stringify(cart)); } catch {} renderCart(); }
  function addToCart(p, size) {
    const line = cart.find(l => l.id === p.id && l.size === size);
    const max = maxQty(p, size);
    if (line) { if (line.qty >= max) return toast(max ? `Max ${max} per order in ${size}` : `${size} is sold out`); line.qty++; }
    else cart.push({ id: p.id, size, qty: 1, name: p.name, price: p.price, image: p.image });
    saveCart();
    const b = $("#cartBtn"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
    toast(stockOf(p, size) <= 0 ? `${p.name} (${size}) added to bag — ships in ${leadTime(p)}` : `${p.name} (${size}) added to bag`);
  }
  function totals() {
    const sub = cart.reduce((a, l) => a + l.price * l.qty, 0);
    const count = cart.reduce((a, l) => a + l.qty, 0);
    const ship = deliveryFor(cart, products);
    return { sub, ship, total: sub + ship, count };
  }
  // Note under a bag line when some or all of it is a pre-order
  function preNote(l) {
    const p = products.find(x => x.id === l.id); if (!p) return "";
    const have = stockOf(p, l.size);
    if (l.qty <= have) return "";
    const msg = have === 0 ? `Ships in ${leadTime(p)}` : `${have} in stock, ${l.qty - have} ships in ${leadTime(p)}`;
    return `<div class="pre-note">⏳ ${esc(msg)}</div>`;
  }
  function renderCart() {
    $("#cartCount").textContent = cart.reduce((a, l) => a + l.qty, 0);
    const { sub, ship, total, count } = totals();
    $("#cartItems").innerHTML = cart.length ? cart.map((l, i) => `<div class="line">
        ${imgTag(l.image, l.name)}
        <div><h4>${esc(l.name)}</h4><div class="small">Size ${esc(l.size)}</div>${preNote(l)}
          <div class="qty"><button data-dec="${i}" aria-label="Decrease">−</button><span>${l.qty}</span><button data-inc="${i}" aria-label="Increase">+</button></div>
          <button class="remove" data-rm="${i}">Remove</button></div>
        <strong>${money(l.price * l.qty)}</strong></div>`).join("")
      : `<p class="empty">Your bag is empty. Go find some heat.</p>`;
    $("#subtotal").textContent = money(sub);
    $("#shipping").textContent = ship === 0 && sub > 0 ? "FREE" : money(ship);
    $("#total").textContent = money(total);
    const pct = Math.min(100, (count / FREE_N) * 100);
    $("#shipProgress").style.width = pct + "%";
    const left = FREE_N - count;
    $("#shipMsg").textContent = count >= FREE_N ? "You've unlocked free delivery 🔥" : `Add ${left} more item${left === 1 ? "" : "s"} for free delivery`;
    $("#checkoutBtn").disabled = !cart.length;
  }
  $("#cartItems").addEventListener("click", e => {
    const t = e.target;
    if (t.dataset.inc !== undefined) {
      const l = cart[t.dataset.inc]; const p = products.find(x => x.id === l.id);
      if (p && l.qty >= maxQty(p, l.size)) return toast(canPreorder(p) ? "That's the most you can order at once" : "That's all we've got in that size");
      l.qty++; saveCart();
    }
    if (t.dataset.dec !== undefined) { const l = cart[t.dataset.dec]; l.qty--; if (l.qty < 1) cart.splice(t.dataset.dec, 1); saveCart(); }
    if (t.dataset.rm !== undefined) { cart.splice(t.dataset.rm, 1); saveCart(); }
  });
  $("#checkoutBtn").onclick = async () => {
    const btn = $("#checkoutBtn"); btn.disabled = true; btn.textContent = "Taking you to checkout…";
    try {
      const res = await Store.checkout(cart);
      if (res && res.demo) {
        close("#cartOverlay"); cart = []; saveCart(); showSuccess(true, res.order && res.order.id);
        products = await Store.getProducts(); renderGrid();
        btn.textContent = "Checkout securely";
      }
    }
    catch (err) { toast(err.message); btn.disabled = false; btn.textContent = "Checkout securely"; }
  };

  // ---------- overlays ----------
  function open(sel) { $(sel).hidden = false; document.body.style.overflow = "hidden"; }
  function close(sel) { $(sel).hidden = true; document.body.style.overflow = ""; }
  $$(".overlay").forEach(o => o.addEventListener("click", e => {
    if (e.target === o || e.target.closest("[data-close]")) close("#" + o.id);
  }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") $$(".overlay").forEach(o => close("#" + o.id)); });
  $("#cartBtn").onclick = () => open("#cartOverlay");

  // ---------- filters ----------
  function setFilter(cat) {
    filter = cat;
    $$("#filters .chip").forEach(c => c.classList.toggle("active", c.dataset.cat === cat));
    renderGrid();
  }
  $("#filters").addEventListener("click", e => { if (e.target.dataset.cat) setFilter(e.target.dataset.cat); });
  $$("[data-filter]").forEach(a => a.addEventListener("click", () => setFilter(a.dataset.filter)));
  $("#sort").onchange = e => { sort = e.target.value; renderGrid(); };
  $("#grid").addEventListener("click", e => { const c = e.target.closest(".card"); if (c) openProduct(c.dataset.id); });
  $("#grid").addEventListener("keydown", e => { const c = e.target.closest(".card"); if (c && e.key === "Enter") openProduct(c.dataset.id); });

  // ---------- newsletter / CRM capture ----------
  $("#signupForm").onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (!$("#consent").checked) { $("#signupMsg").textContent = "Tick the box so we can email you."; return; }
    try {
      const res = await Store.subscribe(f.get("email").trim(), (f.get("name") || "").trim(), f.get("website") || "");
      $("#signupMsg").textContent = res && res.demo
        ? `You're on the list. (Demo mode — no email sent. Your code would be ${C.welcomeCode}.)`
        : res && res.already ? "You're already on the list — thanks!" : `You're on the list. Check your inbox for ${C.welcomePercent}% off.`;
      e.target.reset(); $("#consent").checked = false;
    } catch (err) { $("#signupMsg").textContent = err.message; }
  };

  // ---------- checkout return ----------
  const params = new URLSearchParams(location.search);
  function showSuccess(demo, orderId) {
    document.querySelector(".success")?.remove();
    const num = orderId ? `<p class="order-num">Order number<strong>${esc(orderId)}</strong></p>` : "";
    $("#shop").insertAdjacentHTML("beforebegin", `<section class="success"><h1>ORDER<br>LOCKED IN.</h1>
      ${num}
      <p>Thanks for shopping with ${esc(C.brand)}. ${demo ? "(Demo mode — no payment was taken.)" : "Your confirmation email is on its way — check your spam folder if it's not there in a few minutes."}</p>
      <a href="#shop" class="btn btn-accent">Keep shopping</a></section>`);
    document.querySelector(".success").scrollIntoView({ behavior: "smooth" });
  }

  if (params.get("offer") && params.get("checkout") !== "success") loadOffer(params.get("offer"));
  if (params.get("checkout") === "success") {
    cart = []; saveCart();
    // Same order number the confirmation email and admin use: ORD- + last 8 characters of the Stripe session ID
    const sid = params.get("session_id") || "";
    showSuccess(false, sid ? "ORD-" + sid.slice(-8).toUpperCase() : "");
    history.replaceState(null, "", location.pathname);
  } else if (params.get("checkout") === "cancelled") {
    toast("Checkout cancelled — your bag is still here.");
    history.replaceState(null, "", location.pathname);
  }

  // ---------- boot ----------
  (async () => {
    try { products = await Store.getProducts(); }
    catch (err) { $("#grid").innerHTML = `<p class="empty">Couldn't load products: ${esc(err.message)}</p>`; return; }
    // refresh cart prices / drop removed products
    cart = cart.filter(l => products.some(p => p.id === l.id)).map(l => ({ ...l, price: products.find(p => p.id === l.id).price }));
    renderGrid(); renderCart();
  })();
})();
