-- Editable website pages (Terms first). Edited in Admin > Settings; shown at /terms.html when published.
create table if not exists site_pages (
  slug text primary key,
  title text not null default '',
  body text not null default '',
  published boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table site_pages enable row level security;
drop policy if exists "public read published pages" on site_pages;
create policy "public read published pages" on site_pages for select using (published or is_admin());
drop policy if exists "admin write pages" on site_pages;
create policy "admin write pages" on site_pages for all using (is_admin()) with check (is_admin());

insert into site_pages (slug, title, body, published)
values ('terms', 'Terms of sale', $terms$**Who we are.** HS Sourced It is run by [Seller's full name], a sole trader based in the UK. Postal address: [Postal address]. Email: hello@hssourcedit.com. When these terms say "we" or "us", they mean HS Sourced It.

**These terms.** They apply when you buy from hssourcedit.com. They don't affect your legal rights as a consumer.

**Who can order.** You must be [16] or over, or have a parent or guardian's permission. We sell to customers in the UK only.

**Your order.** Choose your items and pay through our checkout, which is run by Stripe. When your payment goes through, we email you an order confirmation. That email is when our contract with you starts. If something goes wrong with your order after that (for example, we can't get an item), we'll tell you and refund you in full.

**Prices.** Prices are in pounds sterling and shown on each product. [VAT position]. Delivery is added at checkout. We may change prices, but not for orders already confirmed. If we've shown a price that's obviously wrong, we'll contact you before going ahead.

**Discount codes.** Welcome codes work once, on one order, before their expiry date. Codes can't be swapped for cash. Friends & family offer links work once, for the item they were sent for.

**Items in stock.** We aim to dispatch in-stock items within [Dispatch time].

**Items we order in.** Some sizes aren't held in stock but can still be ordered. These show a wait time, for example "Ships in 6–12 business days". The wait time is our best estimate, not a guarantee. If it's going to take a lot longer, we'll email you and you can cancel for a full refund. If we can't get the item at all, we'll refund you in full.

**Delivery.** We deliver to UK addresses. Delivery costs are shown on each product and at checkout, and delivery is free when you order 2 or more items. We'll email you when your order ships, with tracking where available. The items are your responsibility once you, or someone you've nominated, receive them, or once they're left in a safe place you chose. If your order doesn't arrive, contact us and we'll sort it out.

**Product descriptions.** We describe and photograph items as accurately as we can. Colours can look slightly different on different screens.

**Returns.** You can cancel most orders within 14 days of delivery, and faulty items are covered by law. See our returns and refunds policy for details.

**Our responsibility to you.** If we break these terms, we're responsible for loss or damage you suffer that was a foreseeable result. We're not responsible for losses that weren't foreseeable, or for business losses. Nothing here limits our responsibility where the law doesn't allow it, including for death or personal injury caused by our negligence, or for fraud.

**Events outside our control.** If something outside our control (such as a courier strike or a supplier failure) delays your order, we'll tell you. If the delay is long, you can cancel for a full refund.

**Complaints.** Email hello@hssourcedit.com and we'll reply within [3] working days.

**Law.** These terms are governed by the law of England and Wales. You can bring a claim in the courts of England and Wales, or in Scotland or Northern Ireland if you live there.$terms$, false)
on conflict (slug) do nothing;
