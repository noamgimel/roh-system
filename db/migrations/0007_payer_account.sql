-- 0007 — תיקון סמנטי אחרי אימות מול המקור: המספר שאחרי "מח-ן:" בפרטים
-- הוא מספר החשבון של המשלם, לא ת"ז. משנים שמות כדי שהסכימה לא תשקר.
alter table bank_transactions rename column parsed_payer_tax_id to parsed_payer_account;
alter index bank_transactions_payer_tax_id_idx rename to bank_transactions_payer_account_idx;
alter table payers rename column tax_id to account_no;
