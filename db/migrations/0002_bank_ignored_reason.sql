-- 0002 — סיבת החרגה על תנועת בנק (כללי החרגה אוטומטיים + סימון ידני)
alter table bank_transactions add column ignored_reason text;
