-- 0008 — שורות ייבוא שממתינות להשלמה (למשל לקוח בלי ת"ז באקסל).
-- נשארות במסך "ייבוא לקוחות" עד שהמשתמש משלים ויוצר לקוח, או מוחק.
create table client_import_pending (
  id          uuid primary key default gen_random_uuid(),
  source_file text,
  row_number  int,
  name        text,
  data        jsonb not null,      -- כל מה שכן נקרא מהשורה (snake_case)
  errors      text[] not null,
  created_at  timestamptz not null default now(),
  unique (source_file, row_number)  -- אותו קובץ שוב ⇒ לא משכפל
);
