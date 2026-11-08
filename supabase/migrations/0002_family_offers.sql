-- Friends & family offers: a one-time personal link for one product at a set price.

-- Default family price per product (pre-fills the price when sending an offer)
alter table products add column if not exists family_price numeric(10,2) check (family_price is null or family_price >= 0);

create table if not exists offers (
  token text primary key,                         -- the random code in the link
  product_id text not null references products(id) on delete cascade,
  email text not null,
  name text not null default '',
  price numeric(10,2) not null check (price >= 0),
  max_qty int not null default 1 check (max_qty between 1 and 10),
  status text not null default 'sent',            -- sent | reserved | used | cancelled
  expires_at timestamptz,                         -- null = never expires
  stripe_session_id text,
  reserved_until timestamptz,
  order_id text,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table offers enable row level security;
drop policy if exists "admin offers" on offers;
create policy "admin offers" on offers for all using (is_admin()) with check (is_admin());
create index if not exists offers_created_idx on offers (created_at desc);

-- Orders remember which offer (if any) they came from
alter table orders add column if not exists offer_token text;
