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
