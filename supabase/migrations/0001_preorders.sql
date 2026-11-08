-- Pre-orders: let customers order out-of-stock sizes, with a wait time per product.
-- Every existing product gets pre-orders switched on and a 5–8 business day wait.
alter table products add column if not exists allow_backorder boolean not null default true;
alter table products add column if not exists lead_time text not null default '5–8 business days';
update products set allow_backorder = true, lead_time = '5–8 business days';
