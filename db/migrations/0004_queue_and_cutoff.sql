-- 0004 — תור אישורים מלא + תאריך חתך (שלב א', פריטים 2-3)

-- ============ הגדרות מערכת ============
create table app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- ============ שיוך תשלומים ללקוחות ============
-- תנועה מאושרת נרשמת מול היתרה דרך שורות שיוך:
-- שורה אחת בתנועה רגילה, כמה שורות בפיצול תשלום מרוכז.
create table transaction_allocations (
  id                  uuid primary key default gen_random_uuid(),
  bank_transaction_id uuid not null references bank_transactions(id) on delete cascade,
  client_id           uuid not null references clients(id),
  amount              numeric(12,2) not null check (amount > 0),
  created_at          timestamptz not null default now(),
  unique (bank_transaction_id, client_id)
);

create index transaction_allocations_client_idx
  on transaction_allocations (client_id);

-- ============ יתרה — סמנטיקת שלב א' ============
-- approved = "אושר כתשלום לקוח ונרשם מול היתרה".
-- את היתרה מורידים שיוכי תשלום של תנועות מאושרות (ובעתיד גם issued),
-- ורק אחרי תאריך החתך. מסמכים אינם חלק מהחישוב בשלב א'.
create or replace view client_balances as
select
  c.id, c.name, c.client_type,
  c.opening_balance
    + coalesce((select sum(amount) from charges where client_id = c.id), 0)
    - coalesce((
        select sum(a.amount)
        from transaction_allocations a
        join bank_transactions t on t.id = a.bank_transaction_id
        where a.client_id = c.id
          and t.status in ('approved', 'issued')
          and (
            (select nullif(value, '') from app_settings
              where key = 'balance_cutoff_date') is null
            or t.txn_date > (select nullif(value, '')::date from app_settings
                              where key = 'balance_cutoff_date')
          )
      ), 0)
  as balance
from clients c
where c.is_active;
