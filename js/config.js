/* =========================================================
   SHOP CONFIG — the only file you need to edit to go live.
   Leave supabaseUrl empty to run in DEMO MODE (data is kept
   in the browser's localStorage — great for testing).
   ========================================================= */
window.SHOP_CONFIG = {
  brand: "HS SOURCED IT",
  brandSuffix: "",
  logo: "images/logo.png",
  tagline: "Trainers, tracksuits & everyday heat. Sourced for you.",
  currency: "GBP",
  currencySymbol: "£",
  shippingCost: 4.95,          // default delivery cost for products that don't have their own (set per product in admin)
  freeShippingMinItems: 2,     // free delivery when the bag has this many items or more (keep in step with FREE_SHIPPING_MIN_ITEMS on the server)
  lowStockThreshold: 3,
  welcomeCode: "WELCOME5",   // must match the promotion code you create in Stripe (and WELCOME_CODE on the server)
  welcomePercent: 5,
  contactEmail: "hello@hssourcedit.com",
  contactUrl: "https://snapchat.com/t/XMwvsQmV", // footer "Contact" link (Snapchat). Set to "" to use the email instead
  tiktok: "https://www.tiktok.com/@hssourcedit",

  // ---- Live mode (see README.md) ----
  supabaseUrl: "https://ndefypnaczwiryiiqopm.supabase.co",
  supabaseAnonKey: "sb_publishable_Tkhmvl6eUKBYn8K18eO7RA_fA5I8Pra", // publishable key — safe to be public

  // The two big banner photos under the shop — swap for your own (put files in /images)
  lookbookImages: [
    "images/jordan-1-low-velvet-brown.jpg",
    "images/asics-3-piece-set-black.jpg"
  ]
};
