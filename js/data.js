/* =========================================================
   DATA LAYER
   One API, two backends:
     - Demo:  localStorage (no setup, single browser)
     - Live:  Supabase (database + auth) + Edge Functions
              (Stripe checkout, webhook stock updates, email)
   ========================================================= */
(function () {
  const C = window.SHOP_CONFIG;
  const LIVE = !!(C.supabaseUrl && C.supabaseAnonKey);
  const U = "https://images.unsplash.com/";

  const SEED_PRODUCTS = [
    // ---- Your products (photos in /images) — check names, prices & sizes in Admin > Stock ----
    { id: "travis-scott-jordan-1-low-velvet-brown", name: "Travis Scott x Jordan 1 Low 'Velvet Brown'", category: "trainers", price: 220.00, badge: "New",
      image: "images/jordan-1-low-velvet-brown.jpg",
      description: "Dark brown suede low-top with the reverse Swoosh. Comes boxed with pink tissue paper and spare pink laces.",
      sizes: { "UK 6": 1, "UK 7": 1, "UK 8": 2, "UK 9": 2, "UK 10": 1, "UK 11": 1 } },
    { id: "asics-3-piece-set-black", name: "ASICS 3-Piece Set — Black", category: "tracksuits", price: 69.99, badge: "New",
      image: "images/asics-3-piece-set-black.jpg",
      description: "Hooded zip jacket, long-sleeve tee and cuffed joggers in lightweight black stretch fabric with reflective logos.",
      sizes: { "S": 2, "M": 3, "L": 3, "XL": 2 } },
    { id: "travis-scott-jordan-1-low-pink-red", name: "Travis Scott x Jordan 1 Low — Pink / Red", category: "trainers", price: 220.00, badge: "New",
      image: "images/jordan-1-low-pink-red.jpg",
      description: "White leather with pink suede overlays, red reverse Swoosh and a vintage cream sole. Boxed with pink and white laces.",
      sizes: { "UK 6": 1, "UK 7": 1, "UK 8": 2, "UK 9": 2, "UK 10": 1, "UK 11": 1 } },
    { id: "travis-scott-jordan-1-low-cream-pink", name: "Travis Scott x Jordan 1 Low — Cream / Pink", category: "trainers", price: 220.00, badge: "New",
      image: "images/jordan-1-low-cream-pink.jpg",
      description: "Cream and white leather with a pink reverse Swoosh and pink heel. Boxed with cream and pink laces.",
      sizes: { "UK 6": 1, "UK 7": 1, "UK 8": 2, "UK 9": 2, "UK 10": 1, "UK 11": 1 } },
    { id: "travis-scott-jordan-1-low-olive", name: "Travis Scott x Jordan 1 Low 'Olive'", category: "trainers", price: 220.00, badge: "New",
      image: "images/jordan-1-low-olive.jpg",
      description: "Olive suede and sail leather with a black reverse Swoosh and aged sole. Boxed with spare laces.",
      sizes: { "UK 6": 1, "UK 7": 1, "UK 8": 2, "UK 9": 2, "UK 10": 1, "UK 11": 1 } },
    { id: "supreme-hoodie-joggers-set-black", name: "Supreme Vertical Logo Hoodie & Joggers — Black", category: "tracksuits", price: 180.00, badge: "New",
      image: "images/supreme-hoodie-joggers-set-black.jpg",
      description: "Heavyweight black fleece hoodie and matching joggers with oversized appliqué logo running down the side.",
      sizes: { "S": 1, "M": 2, "L": 2, "XL": 1 } },
    { id: "moncler-maya-puffer-black", name: "Moncler Maya Puffer Jacket — Black", category: "jackets", price: 650.00, badge: "New",
      image: "images/moncler-maya-puffer-black.jpg",
      description: "Glossy quilted down jacket with detachable hood, zip pockets and arm logo patch. Comes with garment bag.",
      sizes: { "S": 1, "M": 2, "L": 2, "XL": 1 } },
    { id: "air-runner-red", name: "Air Runner '90", category: "trainers", price: 119.99, badge: "Bestseller",
      image: U + "photo-1542291026-7eec264c27ff?w=900&q=80",
      description: "Retro runner with a cushioned sole and bold colourway. Built for all-day wear.",
      sizes: { "UK 6": 4, "UK 7": 6, "UK 8": 8, "UK 9": 5, "UK 10": 2, "UK 11": 0 } },
    { id: "court-low-white", name: "Court Low Triple White", category: "trainers", price: 89.99, badge: "",
      image: U + "photo-1600185365483-26d7a4cc7519?w=900&q=80",
      description: "Clean leather low-top. Goes with literally everything.",
      sizes: { "UK 6": 3, "UK 7": 5, "UK 8": 7, "UK 9": 7, "UK 10": 4, "UK 11": 2 } },
    { id: "street-max", name: "Street Max Volt", category: "trainers", price: 139.99, badge: "New",
      image: U + "photo-1606107557195-0e29a4b5b4aa?w=900&q=80",
      description: "Chunky air unit, breathable mesh upper, statement sole.",
      sizes: { "UK 6": 2, "UK 7": 4, "UK 8": 3, "UK 9": 6, "UK 10": 3, "UK 11": 1 } },
    { id: "trail-shadow", name: "Shadow Trail", category: "trainers", price: 99.99, badge: "",
      image: U + "photo-1608231387042-66d1773070a5?w=900&q=80",
      description: "Grippy outsole and a stealth colourway for the city or the hills.",
      sizes: { "UK 6": 5, "UK 7": 5, "UK 8": 5, "UK 9": 5, "UK 10": 5, "UK 11": 3 } },
    { id: "hi-top-classic", name: "Classic Hi-Top", category: "trainers", price: 74.99, badge: "Sale",
      image: U + "photo-1595950653106-6c9ebd614d3a?w=900&q=80",
      description: "Canvas hi-top with padded collar. A forever shoe.",
      sizes: { "UK 6": 1, "UK 7": 0, "UK 8": 2, "UK 9": 4, "UK 10": 2, "UK 11": 1 } },
    { id: "tech-tracksuit-black", name: "Tech Fleece Tracksuit — Black", category: "tracksuits", price: 129.99, badge: "Bestseller",
      image: U + "photo-1556821840-3a63f95609a7?w=900&q=80",
      description: "Full-zip tech fleece jacket + tapered joggers. Lightweight warmth, sharp fit.",
      sizes: { "XS": 2, "S": 6, "M": 9, "L": 7, "XL": 4, "XXL": 1 } },
    { id: "poly-tracksuit-grey", name: "Poly Tracksuit — Charcoal", category: "tracksuits", price: 79.99, badge: "",
      image: U + "photo-1503341504253-dff4815485f1?w=900&q=80",
      description: "Smooth poly-knit, zip pockets, ribbed cuffs. Matching set.",
      sizes: { "XS": 3, "S": 4, "M": 6, "L": 6, "XL": 3, "XXL": 2 } },
    { id: "retro-track-navy", name: "Retro Track Set — Navy", category: "tracksuits", price: 94.99, badge: "New",
      image: U + "photo-1611312449408-fcece27cdbb7?w=900&q=80",
      description: "Throwback taping, relaxed fit, heavyweight jersey.",
      sizes: { "XS": 1, "S": 3, "M": 5, "L": 4, "XL": 2, "XXL": 0 } },
    { id: "heavy-hoodie", name: "Heavyweight Hoodie", category: "hoodies", price: 54.99, badge: "",
      image: U + "photo-1556905055-8f358a7a47b2?w=900&q=80",
      description: "450gsm brushed-back cotton. Boxy fit, double-lined hood.",
      sizes: { "XS": 4, "S": 8, "M": 10, "L": 10, "XL": 6, "XXL": 3 } },
    { id: "essential-tee", name: "Essential Box Tee", category: "tees", price: 24.99, badge: "",
      image: U + "photo-1521572163474-6864f9cf17ab?w=900&q=80",
      description: "Heavy cotton tee with dropped shoulders. Buy two.",
      sizes: { "XS": 6, "S": 12, "M": 15, "L": 15, "XL": 8, "XXL": 4 } }
  ].map(p => ({ ...p, active: true, allow_backorder: true, lead_time: "5–8 business days", shipping_cost: 4.95 }));

  // ---------- helpers ----------
  const ls = {
    get(k, d) { try { const v = localStorage.getItem("hs_" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("hs_" + k, JSON.stringify(v)); } catch {} }
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const now = () => new Date().toISOString();

  function ensureSeed() {
    if (!ls.get("products")) { ls.set("products", SEED_PRODUCTS); ls.set("seeded_ids", SEED_PRODUCTS.map(p => p.id)); }
    else {
      // add any newly-shipped starter products without re-adding ones you deleted
      const products = ls.get("products", []);
      const seeded = ls.get("seeded_ids", products.map(p => p.id));
      const fresh = SEED_PRODUCTS.filter(p => !seeded.includes(p.id) && !products.some(x => x.id === p.id));
      if (fresh.length) {
        const firstOld = products.findIndex(p => !p.image || p.image.startsWith("http"));
        products.splice(firstOld < 0 ? products.length : firstOld, 0, ...fresh);
        ls.set("products", products);
      }
      ls.set("seeded_ids", SEED_PRODUCTS.map(p => p.id));
    }
    if (!ls.get("customers")) {
      ls.set("customers", [
        { id: uid(), email: "jayden.r@example.com", name: "Jayden R", phone: "", tags: ["vip"], notes: "Buys every trainer drop.", marketing_opt_in: true, total_spent: 389.97, order_count: 3, created_at: now() },
        { id: uid(), email: "kai.m@example.com", name: "Kai M", phone: "", tags: [], notes: "", marketing_opt_in: true, total_spent: 129.99, order_count: 1, created_at: now() },
        { id: uid(), email: "subscriber@example.com", name: "", phone: "", tags: ["newsletter"], notes: "", marketing_opt_in: true, total_spent: 0, order_count: 0, created_at: now() }
      ]);
    }
    if (!ls.get("orders")) {
      ls.set("orders", [
        { id: "ORD-" + uid().toUpperCase().slice(-6), customer_email: "kai.m@example.com", customer_name: "Kai M",
          items: [{ id: "tech-tracksuit-black", name: "Tech Fleece Tracksuit — Black", size: "M", qty: 1, price: 129.99 }],
          total: 129.99, status: "shipped", created_at: now() }
      ]);
    }
    if (!ls.get("campaigns")) ls.set("campaigns", []);
  }

  // ---------- Supabase ----------
  let sb = null;
  function client() {
    if (!sb) sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey);
    return sb;
  }
  async function q(promise) {
    const { data, error } = await promise;
    if (error) throw new Error(error.message);
    return data;
  }
  async function fn(name, body) {
    const s = client();
    const { data: { session } } = await s.auth.getSession();
    const res = await fetch(`${C.supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: C.supabaseAnonKey,
        Authorization: "Bearer " + (session ? session.access_token : C.supabaseAnonKey) },
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  // ---------- Public API ----------
  const Store = {
    live: LIVE,

    // Products
    async getProducts({ includeInactive = false } = {}) {
      if (LIVE) {
        let query = client().from("products").select("*").order("created_at");
        if (!includeInactive) query = query.eq("active", true);
        return q(query);
      }
      ensureSeed();
      const all = ls.get("products", []);
      return includeInactive ? all : all.filter(p => p.active);
    },
    async saveProduct(p) {
      if (!p.id) p.id = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + uid().slice(-4);
      if (LIVE) return q(client().from("products").upsert(p).select().single());
      const all = ls.get("products", []);
      const i = all.findIndex(x => x.id === p.id);
      i >= 0 ? (all[i] = p) : all.push(p);
      ls.set("products", all);
      return p;
    },
    async deleteProduct(id) {
      if (LIVE) return q(client().from("products").delete().eq("id", id));
      ls.set("products", ls.get("products", []).filter(p => p.id !== id));
    },

    // Product photo upload — resizes in the browser first (max 1200px, JPEG)
    async uploadImage(file) {
      const blob = await resizeImage(file, 1200, 0.82);
      if (LIVE) {
        const path = `products/${Date.now()}-${uid()}.jpg`;
        const s = client();
        const { error } = await s.storage.from("product-images").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
        if (error) throw new Error(error.message);
        return s.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      }
      // Demo: keep a smaller copy in the browser
      const small = await resizeImage(file, 800, 0.72);
      return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(small); });
    },

    // Customers / CRM
    async getCustomers() {
      if (LIVE) return q(client().from("customers").select("*").order("created_at", { ascending: false }));
      ensureSeed();
      return ls.get("customers", []);
    },
    async saveCustomer(c) {
      if (LIVE) return q(client().from("customers").upsert(c, { onConflict: "email" }).select().single());
      const all = ls.get("customers", []);
      const i = all.findIndex(x => x.email.toLowerCase() === c.email.toLowerCase());
      if (i >= 0) all[i] = { ...all[i], ...c };
      else all.unshift({ id: uid(), tags: [], notes: "", total_spent: 0, order_count: 0, created_at: now(), ...c });
      ls.set("customers", all);
      return c;
    },
    async deleteCustomer(email) {
      if (LIVE) return q(client().from("customers").delete().eq("email", email));
      ls.set("customers", ls.get("customers", []).filter(c => c.email !== email));
    },
    async subscribe(email, name = "", website = "") {
      if (LIVE) return fn("subscribe", { email, name, website });
      ensureSeed();
      const all = ls.get("customers", []);
      const ex = all.find(c => c.email.toLowerCase() === email.toLowerCase());
      if (ex) { ex.marketing_opt_in = true; if (!ex.tags.includes("newsletter")) ex.tags.push("newsletter"); }
      else all.unshift({ id: uid(), email, name, phone: "", tags: ["newsletter"], notes: "", marketing_opt_in: true, total_spent: 0, order_count: 0, created_at: now() });
      ls.set("customers", all);
      return { demo: true, code: C.welcomeCode };
    },

    // Orders
    async getOrders() {
      if (LIVE) return q(client().from("orders").select("*").order("created_at", { ascending: false }));
      ensureSeed();
      return ls.get("orders", []);
    },
    // patch: { status, carrier, tracking_number }. notify=true emails the customer when shipped.
    async updateOrder(id, patch, notify = false) {
      if (LIVE) return fn("order-update", { id, ...patch, notify });
      const all = ls.get("orders", []);
      const o = all.find(x => x.id === id); Object.assign(o, patch);
      if (patch.status === "shipped") o.shipped_at = now();
      ls.set("orders", all);
      return { demo: true, emailed: false };
    },

    // Checkout
    // cart: [{id, size, qty}]
    async checkout(cart, email, offer) {
      if (LIVE) {
        const { url } = await fn("create-checkout", {
          items: cart.map(({ id, size, qty }) => ({ id, size, qty })), email, offer,
          success_url: location.origin + location.pathname + "?checkout=success&session_id={CHECKOUT_SESSION_ID}",
          cancel_url: location.origin + location.pathname + (offer ? "?offer=" + encodeURIComponent(offer) : "?checkout=cancelled")
        });
        location.href = url;
        return;
      }
      // DEMO: simulate a paid order — decrement stock, record order & customer
      const products = ls.get("products", []);
      const items = [];
      for (const line of cart) {
        const p = products.find(x => x.id === line.id);
        if (!p) throw new Error(`Sorry — ${line.name} is no longer available.`);
        if (p.allow_backorder === false && (p.sizes[line.size] || 0) < line.qty) throw new Error(`Sorry — ${line.name} (${line.size}) just sold out.`);
      }
      let total = 0;
      for (const line of cart) {
        const p = products.find(x => x.id === line.id);
        const have = Math.max(0, p.sizes[line.size] || 0);
        p.sizes[line.size] = Math.max(0, have - line.qty);
        total += p.price * line.qty;
        const pre = line.qty > have;
        items.push({ id: p.id, name: p.name, size: line.size, qty: line.qty, price: p.price, ...(pre ? { backorder: true, lead_time: (p.lead_time || "5–8 business days") } : {}) });
      }
      total += deliveryFor(cart, products);
      ls.set("products", products);
      const orders = ls.get("orders", []);
      const order = { id: "ORD-" + uid().toUpperCase().slice(-6), customer_email: email || "guest@example.com", customer_name: "",
        items, total: Math.round(total * 100) / 100, status: "paid", created_at: now() };
      orders.unshift(order); ls.set("orders", orders);
      const customers = ls.get("customers", []);
      let c = customers.find(x => x.email === order.customer_email);
      if (!c) { c = { id: uid(), email: order.customer_email, name: "", phone: "", tags: [], notes: "", marketing_opt_in: false, total_spent: 0, order_count: 0, created_at: now() }; customers.unshift(c); }
      c.total_spent = Math.round((c.total_spent + order.total) * 100) / 100; c.order_count += 1;
      ls.set("customers", customers);
      return { demo: true, order };
    },

    // Friends & family offers (live mode only)
    async getOffer(token) {
      if (!LIVE) return { valid: false, reason: "Offers work once the shop is live." };
      return fn("offer-info", { token });
    },
    async sendOffer(o) {
      if (!LIVE) throw new Error("Offers work once the shop is connected to Supabase (live mode).");
      return fn("send-offer", o);
    },
    async getOffers() {
      if (!LIVE) return [];
      return q(client().from("offers").select("*, products(name)").order("created_at", { ascending: false }));
    },
    async cancelOffer(token) {
      return q(client().from("offers").update({ status: "cancelled" }).eq("token", token).neq("status", "used"));
    },

    // Email campaigns
    async getCampaigns() {
      if (LIVE) return q(client().from("campaigns").select("*").order("created_at", { ascending: false }));
      ensureSeed();
      return ls.get("campaigns", []);
    },
    async sendCampaign({ subject, inner, html, segment }) {
      if (LIVE) return fn("send-email", { subject, inner, segment });
      const customers = ls.get("customers", []).filter(c => c.marketing_opt_in && (segment === "all" || (c.tags || []).includes(segment)));
      const camp = { id: uid(), subject, html, segment, recipients: customers.length, created_at: now(), status: "demo (not sent)" };
      const all = ls.get("campaigns", []); all.unshift(camp); ls.set("campaigns", all);
      return { sent: customers.length, demo: true, emails: customers.map(c => c.email) };
    },

    // Auth (admin)
    async session() {
      if (!LIVE) return { user: { email: "demo@admin" } };
      const { data } = await client().auth.getSession();
      return data.session;
    },
    async signIn(email, password) {
      if (!LIVE) return;
      const { error } = await client().auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    async signOut() { if (LIVE) await client().auth.signOut(); },

    // Backup / reset (demo)
    exportAll: async () => ({ products: await Store.getProducts({ includeInactive: true }), customers: await Store.getCustomers(), orders: await Store.getOrders() }),
    resetDemo() { ["products", "customers", "orders", "campaigns"].forEach(k => localStorage.removeItem("hs_" + k)); }
  };

  function resizeImage(file, max, quality) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) return reject(new Error("Please choose an image file"));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => (b ? resolve(b) : reject(new Error("Couldn't process that photo"))), "image/jpeg", quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that photo (try a JPG or PNG)")); };
      img.src = url;
    });
  }

  // ---------- shared UI helpers ----------
  const money = n => C.currencySymbol + Number(n || 0).toFixed(2);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  function fallbackImg(label) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1000' viewBox='0 0 800 1000'><rect width='800' height='1000' fill='#1a1a1a'/><rect x='40' y='40' width='720' height='920' fill='none' stroke='#ffffff' stroke-width='2' stroke-dasharray='10 10'/><text x='400' y='500' fill='#f5f5f5' font-family='Arial Black,Arial' font-size='52' text-anchor='middle'>${esc(label).slice(0, 22)}</text><text x='400' y='560' fill='#ffffff' font-family='Arial' font-size='24' text-anchor='middle' letter-spacing='4'>ADD YOUR PHOTO</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function imgTag(src, label, cls = "") {
    return `<img class="${cls}" src="${esc(src || fallbackImg(label))}" alt="${esc(label)}" loading="lazy" onerror="this.onerror=null;this.src=window.KERB.fallbackImg(this.alt)">`;
  }
  const totalStock = p => Object.values(p.sizes || {}).reduce((a, b) => a + Number(b || 0), 0);
  // Pre-orders: out-of-stock sizes can still be ordered (unless switched off per product) with a wait time
  const DEFAULT_LEAD_TIME = "5–8 business days";
  const canPreorder = p => p.allow_backorder !== false;
  const leadTime = p => (p.lead_time || "").trim() || DEFAULT_LEAD_TIME;
  const stockOf = (p, size) => Math.max(0, Number((p.sizes || {})[size] || 0));
  const maxQty = (p, size) => (canPreorder(p) ? 10 : stockOf(p, size));
  // Delivery: free with N+ items, otherwise one delivery charge = the highest delivery cost of the items in the bag
  const shipCostOf = p => (p && p.shipping_cost != null && p.shipping_cost !== "" ? Number(p.shipping_cost) : C.shippingCost);
  function deliveryFor(lines, products) {
    const count = lines.reduce((a, l) => a + Number(l.qty || 0), 0);
    if (count === 0 || count >= C.freeShippingMinItems) return 0;
    return Math.max(0, ...lines.map(l => shipCostOf(products.find(p => p.id === l.id))));
  }

  window.Store = Store;
  // Sizes in a sensible order (the database stores them alphabetically): XXS..XXXL, then shoe/number sizes low to high
  const SIZE_ORDER = ["XXXS","XXS","XS","S","M","L","XL","XXL","XXXL","4XL","5XL"];
  function sizeRank(s) {
    const k = String(s).toUpperCase().replace(/\s+/g, "").replace(/^(2XL)$/, "XXL").replace(/^(3XL)$/, "XXXL").replace(/^(2XS)$/, "XXS")
      .replace(/^SMALL$/, "S").replace(/^MEDIUM$/, "M").replace(/^LARGE$/, "L").replace(/^ONESIZE$/, "M");
    const i = SIZE_ORDER.indexOf(k);
    if (i >= 0) return [0, i];
    const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
    return isNaN(n) ? [2, 0] : [1, n];
  }
  const sortSizes = list => [...list].sort((a, b) => {
    const ka = sizeRank(Array.isArray(a) ? a[0] : a), kb = sizeRank(Array.isArray(b) ? b[0] : b);
    return ka[0] - kb[0] || ka[1] - kb[1] || String(a).localeCompare(String(b));
  });
  const sizeEntries = p => sortSizes(Object.entries(p.sizes || {}));
  window.KERB = { sortSizes, sizeEntries, money, esc, fallbackImg, imgTag, totalStock, DEFAULT_LEAD_TIME, canPreorder, leadTime, stockOf, maxQty, shipCostOf, deliveryFor };
})();
