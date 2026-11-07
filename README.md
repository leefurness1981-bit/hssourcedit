# HS Sourced It — Streetwear shop for GitHub Pages

A fast, mobile-first shop for trainers, tracksuits, hoodies and tees, with:

- **Storefront** (`index.html`): product grid, filters, size picker with live stock, bag, free-delivery bar, newsletter signup
- **Admin** (`admin.html`): dashboard, **stock management by size**, orders, **customer CRM** (tags, notes, order history, CSV export), **email campaigns**
- **Stripe Checkout** for payments (cards, Apple Pay, Google Pay)
- **Automatic stock reduction + order record + receipt email** when someone pays

It runs in **Demo mode** straight away (data saved in your browser). Then you connect free backend services to go live.

---

## 1. Put it on GitHub Pages (5 minutes)

1. Create a new repo on GitHub, e.g. `hs-sourced-it`.
2. Upload every file in this folder (keep the folder structure). The `.nojekyll` file has to be in there.
3. Go to the repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch `main`, folder `/ (root)` → Save.
4. Your shop goes live at `https://leefurness1981-bit.github.io/hs-sourced-it/` within a minute or two.
5. Admin is at `/admin.html` (in demo mode you don't need to log in).

**Custom domain:** in Settings → Pages, add your domain and point a CNAME DNS record at `leefurness1981-bit.github.io`.

## 2. Change the branding & photos

- **Name, tagline, delivery prices, socials:** `js/config.js`
- **Hero & lookbook photos:** `heroImage` and `lookbookImages` in `js/config.js`
- **Product photos:** Admin → Stock → click a product (or *+ Add product*) → **📷 Upload photo**. Pick a photo from your phone or computer; it's resized automatically. When live, photos are stored in Supabase Storage (set up by `schema.sql`). You can still paste a link instead.
- The starter photos are hotlinked from Unsplash (free to use). If a link ever breaks, a neat "ADD YOUR PHOTO" placeholder shows in its place.
- **Colours & fonts:** the top of `css/style.css` (`--accent` is the highlight colour, currently white).

Tip: shoot products on a plain background, in portrait (4:5), at least 900px wide.

## 3. Go live: database, payments, email

Everything below has a free tier. You'll need:
| Service | What it does | Cost |
|---|---|---|
| [Supabase](https://supabase.com) | Database, admin login, server functions | Free tier |
| [Stripe](https://stripe.com) | Payments | Per-transaction fee only |
| [Brevo](https://www.brevo.com) | All emails: welcome, order confirmed, shipped, campaigns | Free: 300 emails/day |
| [Cloudflare](https://cloudflare.com) | Your inbox: forwards hello@yourdomain to your Gmail | Free |

### 3a. Supabase
1. Create a project. Open **SQL Editor**, paste in `supabase/schema.sql` and run it.
2. **Authentication → Users → Add user**: create your admin login (email + password).
3. In the SQL editor, run: `insert into admins (email) values ('hello@hssourcedit.com');`
4. **Authentication → Sign In / Providers**: turn off "Allow new users to sign up" so only you can log in.
5. **Project Settings → API**: copy the **Project URL** and the **anon / publishable key** into `js/config.js`:
   ```js
   supabaseUrl: "https://xxxx.supabase.co",
   supabaseAnonKey: "eyJ...",
   ```
   (These are safe to have in public code. Row Level Security protects your data.)

### 3b. Deploy the server functions
Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then from this folder:
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF

supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_or_test_xxx \
  STRIPE_WEBHOOK_SECRET=whsec_xxx \
  BREVO_API_KEY=xkeysib-xxx \
  BREVO_LIST_ID=2 \
  EMAIL_FROM_NAME="HS Sourced It" \
  EMAIL_FROM_ORDERS=orders@hssourcedit.com \
  EMAIL_FROM_MARKETING=news@hssourcedit.com \
  REPLY_TO=hello@hssourcedit.com \
  WELCOME_CODE=WELCOME5 WELCOME_PERCENT=5 \
  UNSUBSCRIBE_SECRET=$(openssl rand -hex 32) \
  SITE_URL=https://hssourcedit.com/ \
  SITE_ORIGIN=https://hssourcedit.com \
  SHIPPING_COST=4.95 FREE_SHIPPING_OVER=75 CURRENCY=gbp

for f in create-checkout stripe-webhook send-email unsubscribe subscribe order-update; do
  supabase functions deploy $f --no-verify-jwt
done
```
- `send-email` and `order-update` do their own admin check. The webhook is protected by Stripe's signature.
- `SITE_URL` must be your live shop address. Emails load your logo from `SITE_URL/images/logo.png`.
- `BREVO_LIST_ID` is optional. Set it if you want subscribers copied into a Brevo contact list, so you can also use Brevo's own campaign designer and stats.
- **Optional:** add `RESEND_API_KEY=re_xxx` and order emails go through Resend instead. Then a big campaign can never use up Brevo's 300-a-day limit and block a customer's receipt.

### 3c. Stripe
1. **Developers → API keys**: use the *Secret key* for `STRIPE_SECRET_KEY` (start with test mode `sk_test_…`).
2. **Developers → Webhooks → Add endpoint**:
   - URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
   - Event: `checkout.session.completed`
   - Copy the *Signing secret* (`whsec_…`) and set it as `STRIPE_WEBHOOK_SECRET`.
3. Test with card `4242 4242 4242 4242`, any future date and any CVC. Check Admin → Orders and the stock levels.
4. **Welcome discount (important):** Stripe → Product catalogue → Coupons → **New**: 5% off, duration *Once*. Then add a **Promotion code** `WELCOME5` and tick **"Eligible for first-time orders only"** and **"Limit to one redemption per customer"**. The welcome email promises this code, so it must exist. If you change it, update `WELCOME_CODE` (server) and `welcomeCode` in `js/config.js`.
   Other discount codes work the same way. Checkout already has a "promo code" box.
5. When you're happy, switch to live keys.

### 3d. Brevo (sending emails)
1. Sign up at brevo.com (free plan).
2. **Senders, Domains & Dedicated IPs → Domains → Add a domain**. Brevo shows you DNS records (a `brevo-code` TXT, two DKIM records and a DMARC record). Add them in your domain's DNS. This is what stops emails going to spam and removes any "via brevo" label.
3. **Senders → Add a sender** for `orders@`, `news@` and `hello@` on your domain.
4. **SMTP & API → API keys → Generate** → this is `BREVO_API_KEY`.
5. (Optional) **Contacts → Lists → Create a list** and use its number as `BREVO_LIST_ID`.

**Automatic emails** (designs are in `supabase/functions/_shared/templates.js`; preview them in Admin → Email):
| Email | Sent when |
|---|---|
| Welcome + discount code | Someone signs up (once per address) |
| Order confirmed | Stripe confirms payment |
| Order shipped + tracking link | You choose **shipped** in Admin → Orders and tick "Email the customer" |

All of them have Reply-to set to `REPLY_TO`, so customer replies land in your inbox.

### 3e. Your inbox (free): Cloudflare + Gmail
1. Add your domain to Cloudflare (free plan) and change the **nameservers** at GoDaddy to the two Cloudflare gives you. You still own the domain through GoDaddy. From then on, add every DNS record in Cloudflare instead: Brevo's records and GitHub Pages' records.
2. Cloudflare → your domain → **Email → Email Routing** → add `hello@`, `orders@` and `news@` (or turn on catch-all) → forward to your Gmail.
3. To reply *as* hello@yourdomain from Gmail: Gmail → Settings → **Accounts and Import → Send mail as → Add another email address**
   - SMTP server `smtp-relay.brevo.com`, port `587`, TLS
   - Username and password: from Brevo → **SMTP & API → SMTP** (your SMTP login and an SMTP key)
4. Your SPF record (a TXT record on the root of your domain) must be a **single** line covering both Cloudflare and Brevo, e.g.
   `v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all`
   Cloudflare adds its own record when you turn on Email Routing, so edit that one rather than adding a second.

## How it fits together
```
Shopper ─▶ GitHub Pages (index.html)
             │  reads products ─────────────▶ Supabase DB
             │  newsletter signup ──────────▶ subscribe fn → customers + welcome email (Brevo)
             └─ Checkout ─▶ create-checkout ─▶ Stripe Checkout page
                                                │ paid
                            stripe-webhook ◀────┘
                              ├─ decrement stock
                              ├─ save order + update CRM
                              └─ order confirmed email (Brevo)
Admin ─▶ admin.html (Supabase login) ─▶ stock / orders / CRM
                                     ├─ order-update ─▶ shipped email + tracking (Brevo)
                                     └─ send-email ─▶ Brevo (opted-in only, with unsubscribe)
```

## Legal bits for a UK shop (worth sorting before launch)
- Add **Privacy, Returns and Terms** pages (link them in the footer of `index.html`).
- Marketing email needs opt-in consent (the signup form has the tick box) and an unsubscribe link (added automatically).
- If you use analytics or tracking cookies later, you'll need a cookie banner.
- Many of your customers will be under 18. Keep marketing age-appropriate and don't collect more data than you need.

## Files
```
index.html            storefront
admin.html            staff dashboard
css/style.css         shop styles (colours & fonts at the top)
css/admin.css         admin styles
js/config.js          ← your settings
js/data.js            data layer (demo localStorage ⇄ Supabase) + starter products
js/shop.js            storefront logic
js/admin.js           admin logic
images/               put your own photos here
supabase/schema.sql   database tables, security rules, starter products
supabase/functions/   create-checkout, stripe-webhook, subscribe, order-update, send-email, unsubscribe
  _shared/templates.js  ← email designs (wording lives here)
  _shared/email.ts      Brevo/Resend sending helpers
```
