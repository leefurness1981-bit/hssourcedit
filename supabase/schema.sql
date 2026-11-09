-- =========================================================
-- HS Sourced It shop — Supabase schema
-- Paste into Supabase > SQL Editor > New query > Run
-- =========================================================

-- Admin users (add your email after running — see bottom)
create table if not exists admins (
  email text primary key
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- Products & stock (stock is per size: {"UK 8": 5, "UK 9": 2})
create table if not exists products (
  id text primary key,
  name text not null,
  category text not null default 'trainers',
  price numeric(10,2) not null check (price >= 0),
  badge text default '',
  image text default '',
  description text default '',
  sizes jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  allow_backorder boolean not null default true,      -- pre-orders allowed when a size is out of stock
  lead_time text not null default '5–8 business days', -- wait time shown for out-of-stock sizes
  shipping_cost numeric(10,2) not null default 4.95 check (shipping_cost >= 0), -- delivery cost when bought on its own
  created_at timestamptz not null default now()
);

-- Customers / CRM
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text default '',
  phone text default '',
  tags text[] not null default '{}',
  notes text default '',
  marketing_opt_in boolean not null default false,
  total_spent numeric(10,2) not null default 0,
  order_count int not null default 0,
  created_at timestamptz not null default now()
);

-- Orders (written by the Stripe webhook)
create table if not exists orders (
  id text primary key,
  stripe_session_id text unique,
  customer_email text not null,
  customer_name text default '',
  shipping_address text default '',
  items jsonb not null default '[]'::jsonb,
  total numeric(10,2) not null default 0,
  status text not null default 'paid',
  created_at timestamptz not null default now()
);

-- Columns added for tracking + welcome emails (safe to re-run)
alter table orders    add column if not exists carrier text default '';
alter table orders    add column if not exists tracking_number text default '';
alter table orders    add column if not exists shipped_at timestamptz;
alter table customers add column if not exists welcome_sent_at timestamptz;

-- Email campaigns log
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  html text not null,
  segment text not null default 'all',
  recipients int not null default 0,
  status text default 'sent',
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table admins    enable row level security;
alter table products  enable row level security;
alter table customers enable row level security;
alter table orders    enable row level security;
alter table campaigns enable row level security;

drop policy if exists "public read active products" on products;
create policy "public read active products" on products for select using (active or is_admin());
drop policy if exists "admin write products" on products;
create policy "admin write products" on products for all using (is_admin()) with check (is_admin());

drop policy if exists "admin customers" on customers;
create policy "admin customers" on customers for all using (is_admin()) with check (is_admin());

drop policy if exists "admin orders" on orders;
create policy "admin orders" on orders for all using (is_admin()) with check (is_admin());

drop policy if exists "admin campaigns" on campaigns;
create policy "admin campaigns" on campaigns for all using (is_admin()) with check (is_admin());

drop policy if exists "admin read admins" on admins;
create policy "admin read admins" on admins for select using (is_admin());

-- ---------- Newsletter signup (callable by anyone, only adds/opts-in) ----------
create or replace function subscribe(p_email text, p_name text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email'; end if;
  insert into customers (email, name, marketing_opt_in, tags)
  values (lower(trim(p_email)), coalesce(p_name, ''), true, array['newsletter'])
  on conflict (email) do update
    set marketing_opt_in = true,
        name = case when customers.name = '' then excluded.name else customers.name end,
        tags = case when 'newsletter' = any(customers.tags) then customers.tags else array_append(customers.tags, 'newsletter') end;
end $$;
-- Only the 'subscribe' server function calls this (so every signup gets the welcome email)
revoke execute on function subscribe(text, text) from public, anon, authenticated;

-- ---------- Atomic stock decrement (used by the webhook only) ----------
create or replace function decrement_stock(p_id text, p_size text, p_qty int)
returns void language plpgsql security definer set search_path = public as $$
begin
  update products
     set sizes = jsonb_set(sizes, array[p_size], to_jsonb(greatest(0, coalesce((sizes ->> p_size)::int, 0) - p_qty)))
   where id = p_id;
end $$;
revoke execute on function decrement_stock(text, text, int) from public, anon, authenticated;

-- ---------- Product photo storage (used by the admin "Upload photo" button) ----------
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
on conflict (id) do nothing;
drop policy if exists "admin upload product images" on storage.objects;
create policy "admin upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and is_admin());
drop policy if exists "admin update product images" on storage.objects;
create policy "admin update product images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and is_admin());
drop policy if exists "admin delete product images" on storage.objects;
create policy "admin delete product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and is_admin());

-- ---------- Starter products (edit/delete in the admin) ----------
insert into products (id, name, category, price, badge, image, description, sizes) values
 ('travis-scott-jordan-1-low-pink-red','Travis Scott x Jordan 1 Low — Pink / Red','trainers',220,'New','images/jordan-1-low-pink-red.jpg','White leather, pink suede overlays, red reverse Swoosh, vintage cream sole.','{"UK 6":1,"UK 7":1,"UK 8":2,"UK 9":2,"UK 10":1,"UK 11":1}'),
 ('travis-scott-jordan-1-low-cream-pink','Travis Scott x Jordan 1 Low — Cream / Pink','trainers',220,'New','images/jordan-1-low-cream-pink.jpg','Cream and white leather with a pink reverse Swoosh and pink heel.','{"UK 6":1,"UK 7":1,"UK 8":2,"UK 9":2,"UK 10":1,"UK 11":1}'),
 ('travis-scott-jordan-1-low-olive','Travis Scott x Jordan 1 Low ''Olive''','trainers',220,'New','images/jordan-1-low-olive.jpg','Olive suede and sail leather with a black reverse Swoosh.','{"UK 6":1,"UK 7":1,"UK 8":2,"UK 9":2,"UK 10":1,"UK 11":1}'),
 ('supreme-hoodie-joggers-set-black','Supreme Vertical Logo Hoodie & Joggers — Black','tracksuits',180,'New','images/supreme-hoodie-joggers-set-black.jpg','Heavyweight fleece hoodie and joggers with oversized side logo.','{"S":1,"M":2,"L":2,"XL":1}'),
 ('moncler-maya-puffer-black','Moncler Maya Puffer Jacket — Black','jackets',650,'New','images/moncler-maya-puffer-black.jpg','Glossy quilted down jacket with detachable hood.','{"S":1,"M":2,"L":2,"XL":1}'),
 ('travis-scott-jordan-1-low-velvet-brown','Travis Scott x Jordan 1 Low ''Velvet Brown''','trainers',220.00,'New','images/jordan-1-low-velvet-brown.jpg','Dark brown suede low-top with the reverse Swoosh. Comes boxed with spare pink laces.','{"UK 6":1,"UK 7":1,"UK 8":2,"UK 9":2,"UK 10":1,"UK 11":1}'),
 ('asics-3-piece-set-black','ASICS 3-Piece Set — Black','tracksuits',69.99,'New','images/asics-3-piece-set-black.jpg','Hooded zip jacket, long-sleeve tee and cuffed joggers in lightweight black stretch fabric.','{"S":2,"M":3,"L":3,"XL":2}'),
 ('air-runner-red','Air Runner ''90','trainers',119.99,'Bestseller','https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=80','Retro runner with a cushioned sole and bold colourway.','{"UK 6":4,"UK 7":6,"UK 8":8,"UK 9":5,"UK 10":2,"UK 11":0}'),
 ('court-low-white','Court Low Triple White','trainers',89.99,'','https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=900&q=80','Clean leather low-top. Goes with everything.','{"UK 6":3,"UK 7":5,"UK 8":7,"UK 9":7,"UK 10":4,"UK 11":2}'),
 ('tech-tracksuit-black','Tech Fleece Tracksuit — Black','tracksuits',129.99,'Bestseller','https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=900&q=80','Full-zip tech fleece jacket + tapered joggers.','{"XS":2,"S":6,"M":9,"L":7,"XL":4,"XXL":1}'),
 ('heavy-hoodie','Heavyweight Hoodie','hoodies',54.99,'','https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=900&q=80','450gsm brushed-back cotton. Boxy fit.','{"XS":4,"S":8,"M":10,"L":10,"XL":6,"XXL":3}')
on conflict (id) do nothing;

-- ---------- IMPORTANT: make yourself an admin ----------
-- 1) Supabase > Authentication > Users > Add user (your email + password)
-- 2) Then run:  insert into admins (email) values ('you@yourdomain.com');


-- =========================================================
-- Friends & family offers (also in migrations/0002_family_offers.sql)

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

-- Messages to (and later, from) customers, shown on the order in admin.
create table if not exists customer_messages (
  id uuid primary key default gen_random_uuid(),
  order_id text,                                   -- null = general message to the customer
  customer_email text not null,
  direction text not null default 'out',           -- out = we sent it, in = they sent it
  subject text not null default '',
  body text not null default '',
  sent_by text,                                    -- admin email that sent it
  created_at timestamptz not null default now()
);
alter table customer_messages enable row level security;
drop policy if exists "admin messages" on customer_messages;
create policy "admin messages" on customer_messages for all using (is_admin()) with check (is_admin());
create index if not exists customer_messages_order_idx on customer_messages (order_id, created_at desc);
create index if not exists customer_messages_email_idx on customer_messages (customer_email, created_at desc);
alter table customers add column if not exists welcome_code text;
alter table customers add column if not exists welcome_code_expires_at timestamptz;
alter table customers add column if not exists welcome_code_failed_at timestamptz;

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


-- Activity log: every change to products (incl. stock), orders, customers, offers, pages and
-- messages is recorded automatically by the database, with who did it and before/after values.
-- Edge functions also add "event" rows (e.g. emails sent). Rows older than a year are removed
-- by the keep-awake GitHub Action.
create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null default 'system',     -- admin email, or 'system' (website / Stripe / automations)
  table_name text not null,                 -- products | orders | customers | offers | site_pages | customer_messages
  record_id text not null,
  label text not null default '',           -- product name / order id / customer email … for display
  action text not null,                     -- insert | update | delete | event
  changes jsonb not null default '{}'::jsonb, -- update: {field: [old, new]}; insert/delete: the row; event: details
  summary text not null default ''          -- event rows: a ready-made sentence
);
create index if not exists audit_log_at_idx on audit_log (at desc);
create index if not exists audit_log_record_idx on audit_log (table_name, record_id, at);

alter table audit_log enable row level security;
drop policy if exists "admin read audit" on audit_log;
create policy "admin read audit" on audit_log for select using (is_admin());
-- no insert/update/delete policies: only the trigger and server functions can write

create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  diff jsonb := '{}'::jsonb;
  k text;
  who text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at') and (o -> k) is distinct from (n -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then return null; end if;
  end if;
  begin
    who := nullif(auth.jwt() ->> 'email', '');
  exception when others then who := null;
  end;
  insert into audit_log (actor, table_name, record_id, label, action, changes)
  values (
    coalesce(who, 'system'),
    tg_table_name,
    coalesce(case tg_table_name
      when 'customers' then r ->> 'email' when 'offers' then r ->> 'token' when 'site_pages' then r ->> 'slug'
      else r ->> 'id' end, ''),
    coalesce(case tg_table_name
      when 'products' then r ->> 'name' when 'orders' then r ->> 'id' when 'customers' then r ->> 'email'
      when 'offers' then r ->> 'email' when 'site_pages' then r ->> 'title'
      when 'customer_messages' then coalesce(r ->> 'order_id', r ->> 'customer_email') end, ''),
    lower(tg_op),
    case tg_op when 'UPDATE' then diff when 'INSERT' then n else o end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['products','orders','customers','offers','site_pages','customer_messages'] loop
    execute format('drop trigger if exists audit_%1$s on %1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on %1$I for each row execute function audit_row()', t);
  end loop;
end $$;
