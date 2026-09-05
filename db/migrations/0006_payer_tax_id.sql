-- 0006 — ת"ז של המשלם: המפתח החזק שהתגלה בכיול על הקובץ האמיתי.
-- שדה "פרטים" של הפועלים מסתיים ב-"(מס ת-ז:…)" ב-~75% מהתנועות,
-- לעומת בנק-סניף-חשבון ב-~25% בלבד.

alter table bank_transactions add column parsed_payer_tax_id text;
create index bank_transactions_payer_tax_id_idx
  on bank_transactions (parsed_payer_tax_id);

-- משלם יכול להיות מזוהה לפי חשבון ו/או לפי ת"ז — שניהם ייחודיים
alter table payers add column tax_id text unique;
