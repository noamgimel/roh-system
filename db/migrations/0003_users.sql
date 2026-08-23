-- 0003 — משתמשים והזדהות.
-- משתמש יחיד בשלב א', אבל הסכימה מוכנה להרחבה לריבוי משתמשים.
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text not null,
  password_hash text not null,
  role          text not null default 'admin'
                check (role in ('admin', 'user')),
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);
