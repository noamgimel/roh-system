-- 0001_init — הסכימה המלאה לפי האפיון הטכני v1.0

-- ============ לקוחות ============
create table clients (
  id                uuid primary key default gen_random_uuid(),
  client_no         int,                    -- מספר רץ מהאקסל, לתצוגה בלבד
  tax_id            text not null unique,   -- ת"ז / ח"פ — המפתח הטבעי
  name              text not null,
  activity          text,                   -- תחום פעילות
  entity_type       text,                   -- מורשה / פטור / חברה
  withholding_file  text,                   -- תיק ניכויים
  spouse_name       text,
  spouse_tax_id     text,
  vat_frequency     text,                   -- חד חודשי / דו חודשי
  ni_102_frequency  text,
  tax_102_frequency text,
  advances_rate     numeric(5,2),
  advances_frequency text,
  permissions       text,
  phone             text,
  email             text,

  client_type       text not null default 'קבוע'
                    check (client_type in ('קבוע', 'מזדמן')),
  rate              numeric(12,2),          -- תעריף חודשי, ללקוח קבוע
  opening_balance   numeric(12,2) not null default 0,
  withholding_rate  numeric(5,2) not null default 0,  -- ניכוי במקור; הלקוח פטור

  external_doc_client_id text,              -- מזהה הלקוח אצל ספק ההנפקה
  is_active         boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index clients_name_idx on clients (name);
create index clients_is_active_idx on clients (is_active);

-- עדכון אוטומטי של updated_at
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger clients_set_updated_at
  before update on clients
  for each row execute function set_updated_at();

-- ============ משלמים ============
-- לקוח ≠ ישות מחייבת ≠ משלם.
create table payers (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,
  bank_key      text unique,        -- "בנק-סניף-חשבון" מנורמל — מפתח ההתאמה החזק
  created_at    timestamptz not null default now()
);

create table payer_clients (
  payer_id     uuid references payers(id) on delete cascade,
  client_id    uuid references clients(id) on delete cascade,
  confirmed_at timestamptz,          -- מולא = אושר ידנית, נחשב ודאי
  primary key (payer_id, client_id)
);

-- ============ חיובים ============
create table charges (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id),
  charge_date date not null,
  amount      numeric(12,2) not null,
  description text,
  source      text not null
              check (source in ('auto_monthly', 'manual', 'opening')),
  period_key  text,                  -- 'YYYY-MM' — מונע חיוב חודשי כפול
  created_at  timestamptz not null default now(),
  unique (client_id, source, period_key)
);

create index charges_client_idx on charges (client_id);

-- ============ תנועות בנק ============
create table import_batches (
  id             uuid primary key default gen_random_uuid(),
  file_name      text,
  range_from     date,
  range_to       date,
  rows_total     int,
  rows_new       int,
  rows_duplicate int,
  rows_ignored   int,
  created_at     timestamptz not null default now()
);

create table bank_transactions (
  id                uuid primary key default gen_random_uuid(),
  row_hash          text not null unique,   -- שכבת מניעת כפילות ראשונה
  batch_id          uuid references import_batches(id),

  txn_date          date not null,          -- עמודת "תאריך"
  value_date        date,                   -- עמודת "תאריך ערך"
  description       text,                   -- "תיאור הפעולה"
  details           text,                   -- "פרטים" — הגולמי
  account           text,
  reference         text,                   -- "אסמכתא"
  credit            numeric(12,2) not null, -- "זכות"
  balance_after     numeric(12,2),          -- "יתרה לאחר פעולה"

  parsed_payer_name text,
  parsed_bank_key   text,                   -- בנק-סניף-חשבון של המשלם
  parsed_purpose    text,

  status            text not null default 'new'
                    check (status in ('new', 'matched', 'needs_review',
                                      'approved', 'issued', 'ignored', 'failed')),
  matched_client_id uuid references clients(id),
  match_confidence  text
                    check (match_confidence in ('exact', 'high', 'medium', 'none')),
  match_reason      text,
  created_at        timestamptz not null default now()
);

create index bank_transactions_status_idx on bank_transactions (status);
create index bank_transactions_bank_key_idx on bank_transactions (parsed_bank_key);

-- ============ מסמכים שהונפקו ============
create table documents (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients(id),
  bank_transaction_id uuid references bank_transactions(id),

  amount              numeric(12,2) not null,
  payment_date        date not null,        -- מועד קבלת הכסף בפועל
  issued_at           timestamptz,          -- מועד ההנפקה

  idempotency_key     text not null unique, -- שכבת מניעת כפילות שנייה
  status              text not null default 'draft'
                      check (status in ('draft', 'approved', 'sending',
                                        'issued', 'failed', 'credited')),

  provider            text not null
                      check (provider in ('paperless', 'sumit')),
  provider_doc_id     text,
  provider_doc_number text,
  provider_client_id  text,
  tax_confirm         text,                 -- מספר הקצאה
  download_url        text,
  drive_file_id       text,

  error_message       text,
  created_at          timestamptz not null default now()
);

create index documents_client_idx on documents (client_id);
create index documents_status_idx on documents (status);

create table credit_notes (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references documents(id),
  provider_doc_id  text,
  reason           text not null,
  created_by       text,
  created_at       timestamptz not null default now()
);

-- ============ יומן ביקורת ============
create table audit_log (
  id          bigserial primary key,
  actor       text not null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  before_data jsonb,
  after_data  jsonb,
  ip          inet,
  created_at  timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity, entity_id);

-- ============ חישוב היתרה ============
-- היתרה מחושבת ולעולם לא נשמרת כשדה.
create view client_balances as
select
  c.id, c.name, c.client_type,
  c.opening_balance
    + coalesce((select sum(amount) from charges   where client_id = c.id), 0)
    - coalesce((select sum(amount) from documents where client_id = c.id
                 and status in ('issued')), 0)
  as balance
from clients c
where c.is_active;
