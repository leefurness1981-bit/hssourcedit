-- Reviews: customers are emailed a private link once their order is marked delivered.
-- Only the "review" Edge Function can add reviews (it checks the link); anyone can read them;
-- the admin can delete them.
alter table orders add column if not exists review_token text unique;
alter table orders add column if not exists review_requested_at timestamptz;

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references orders(id) on delete cascade,
  product_id text not null,
  rating int not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 1500),
  name text not null default '' check (char_length(name) <= 60),
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);
create index if not exists reviews_product_idx on reviews (product_id, created_at desc);
alter table reviews enable row level security;
drop policy if exists "public read reviews" on reviews;
create policy "public read reviews" on reviews for select using (true);
drop policy if exists "admin delete reviews" on reviews;
create policy "admin delete reviews" on reviews for delete using (is_admin());
-- Visitors can see the review itself but not which order it came from
revoke all on reviews from anon;
grant select (id, product_id, rating, body, name, created_at) on reviews to anon;

-- Expenses: things bought (stock, packaging…) for working out profit. Not part of shop stock.
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  price numeric(10,2) not null default 0,
  website text not null default '',
  notes text not null default '',
  bought_on date not null default current_date,
  created_at timestamptz not null default now()
);
alter table expenses enable row level security;
drop policy if exists "admin expenses" on expenses;
create policy "admin expenses" on expenses for all using (is_admin()) with check (is_admin());

-- Activity log labels for the new tables
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
      when 'customer_messages' then coalesce(r ->> 'order_id', r ->> 'customer_email')
      when 'reviews' then r ->> 'order_id' when 'expenses' then r ->> 'item' end, ''),
    lower(tg_op),
    case tg_op when 'UPDATE' then diff when 'INSERT' then n else o end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['reviews','expenses'] loop
    execute format('drop trigger if exists audit_%1$s on %1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on %1$I for each row execute function audit_row()', t);
  end loop;
end $$;
