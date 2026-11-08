# Database changes

Put each database change in its own `.sql` file here, named with a number so they run in order:

```
0001_product_display_order.sql
0002_welcome_codes.sql
```

When a file is pushed to GitHub, the **Deploy Supabase** action runs it once against the live database and records it in the `_migrations` table, so it never runs twice.

- Never edit a file that has already run. Make a new one instead.
- `supabase/schema.sql` is the original full setup (already run by hand). It is not run automatically.
