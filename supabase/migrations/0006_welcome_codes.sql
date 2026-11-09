-- Personal one-use welcome codes (one per subscriber)
alter table customers add column if not exists welcome_code text;
alter table customers add column if not exists welcome_code_expires_at timestamptz;
