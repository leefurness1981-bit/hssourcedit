-- Anyone who has placed an order gets the "customer" tag
-- (people who joined the list before buying were missing it).
update customers c
set tags = array_append(c.tags, 'customer')
where not ('customer' = any(c.tags))
  and exists (select 1 from orders o where lower(o.customer_email) = lower(c.email));
