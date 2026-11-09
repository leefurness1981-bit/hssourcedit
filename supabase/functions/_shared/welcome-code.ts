// One-use welcome discount codes: each subscriber gets their own Stripe promotion code
// (e.g. WELCOME-7KQ2MX) that works once and expires after WELCOME_CODE_DAYS (default 30).
// The 5% coupon behind them ("Welcome 5% off") is created automatically in Stripe if it's missing.
import Stripe from "npm:stripe@16";

export const WELCOME_PERCENT = Number(Deno.env.get("WELCOME_PERCENT") ?? "5");
export const WELCOME_CODE_DAYS = Number(Deno.env.get("WELCOME_CODE_DAYS") ?? "30");
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L — easy to type

let stripe: Stripe | null = null;
const client = () => (stripe ??= new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" }));

// Finds the welcome coupon in Stripe (tagged hs_welcome in its metadata), or creates a new one.
// If someone deletes it in the Stripe dashboard, the next sign-up simply makes a fresh one.
let couponId: string | null = null;
async function ensureCoupon(): Promise<string> {
  if (couponId) {
    const c = await client().coupons.retrieve(couponId).catch(() => null);
    if (c && c.valid && !(c as { deleted?: boolean }).deleted) return couponId;
    couponId = null;
  }
  for await (const c of client().coupons.list({ limit: 100 })) {
    if (c.metadata?.hs_welcome === "true" && c.valid && c.percent_off === WELCOME_PERCENT) return (couponId = c.id);
  }
  const created = await client().coupons.create({
    percent_off: WELCOME_PERCENT, duration: "once", name: `Welcome ${WELCOME_PERCENT}% off`,
    metadata: { hs_welcome: "true" },
  });
  return (couponId = created.id);
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "WELCOME-" + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Creates a one-use, expiring code for this email. Returns the code and its expiry date. */
export async function createWelcomeCode(email: string): Promise<{ code: string; expiresAt: Date }> {
  const coupon = await ensureCoupon();
  const expiresAt = new Date(Date.now() + WELCOME_CODE_DAYS * 86400000);
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = randomCode();
    try {
      await client().promotionCodes.create({
        coupon, code, max_redemptions: 1,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        metadata: { email, kind: "welcome" },
      });
      return { code, expiresAt };
    } catch (e) {
      if (attempt === 3 || !/already exists|code/i.test((e as Error).message)) throw e;
    }
  }
  throw new Error("Couldn't create a welcome code");
}
