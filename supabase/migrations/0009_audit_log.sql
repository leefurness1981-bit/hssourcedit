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
