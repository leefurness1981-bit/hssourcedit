-- Set when a subscriber's personal welcome code couldn't be created at sign-up,
-- so the admin can show it and offer a "Send welcome code" button.
alter table customers add column if not exists welcome_code_failed_at timestamptz;
