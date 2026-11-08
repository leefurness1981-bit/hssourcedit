-- Delivery cost per product (default £4.95). Free delivery with 2+ items is handled at checkout.
alter table products add column if not exists shipping_cost numeric(10,2) not null default 4.95 check (shipping_cost >= 0);
