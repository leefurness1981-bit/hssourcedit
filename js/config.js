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
  shippingCost: 4.95,
  freeShippingOver: 75,
  lowStockThreshold: 3,
  welcomeCode: "WELCOME10",   // must match the promotion code you create in Stripe (and WELCOME_CODE on the server)
  welcomePercent: 10,
  contactEmail: "hello@hssourcedit.com",
  instagram: "https://instagram.com/",
  tiktok: "https://tiktok.com/",

  // ---- Live mode (see README.md) ----
  supabaseUrl: "https://ndefypnaczwiryiiqopm.supabase.co",
  supabaseAnonKey: "sb_publishable_Tkhmvl6eUKBYn8K18eO7RA_fA5I8Pra", // publishable key — safe to be public

  // The two big banner photos under the shop — swap for your own (put files in /images)
  lookbookImages: [
    "images/jordan-1-low-velvet-brown.jpg",
    "images/asics-3-piece-set-black.jpg"
  ]
};
