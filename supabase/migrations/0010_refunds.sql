-- Refunds made in Stripe are copied onto the order (see stripe-webhook, event charge.refunded)
alter table orders add column if not exists refunded_amount numeric(10,2) not null default 0;
