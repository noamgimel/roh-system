# אפיון טכני — מערכת ניהול לקוחות, יתרות והנפקת מסמכים

**לקוח:** משרד רואה חשבון עצמאי, מתנהל כחברה בע"מ
**ספק:** NoamG
**גרסה:** 1.0 — שלב א'
**סטטוס:** מאושר לפיתוח, בכפוף לפריטים בסעיף 15

---

## 1. מטרת המערכת

היום המשרד מנפיק מסמכי הכנסה ידנית, אחד אחד, אחרי בדיקה ידנית של דף חשבון הבנק. אין שום מעקב אחר יתרות לקוחות — לא ידוע מי חייב כמה. לקוחות מזדמנים אינם מתועדים כלל.

המערכת נבנית כדי:

1. להחזיק רשומת לקוחות מלאה — קבועים ומזדמנים
2. לנהל יתרת חוב מחושבת לכל לקוח
3. לקלוט דף חשבון בנק, להתאים תנועות ללקוחות, ולהנפיק מסמכים מרוכזים
4. לאפשר הנפקת מסמך בודד ללקוח יחיד

**היקף:** כ-30 מסמכים בחודש. כל התשלומים מגיעים בהעברה בנקאית בלבד.

**זו תשתית.** מודולים עתידיים (אונבורדינג לקוחות, תבניות וואטסאפ, תזכורות) ייבנו על גביה ואינם בהיקף הנוכחי.

---

## 2. הכרעות שנסגרו — אין לשנות בלי אישור

| נושא | הכרעה |
|---|---|
| ספק הנפקה | **פייפרלס** (הלקוח כבר עובד שם; המספור ממשיך; אין מעבר) |
| ארכיטקטורה | שכבת מתאם — Sumit ממומשת כחלופה מלאה |
| סוג מסמך | **חשבונית מס קבלה** (`iType = 2`) |
| קליטת בנק | ייצוא CSV ידני. **אין התחברות לבנק** |
| תדירות | שבועית, לפי הוראת הלקוח |
| תאריך מסמך | תאריך ההנפקה. תאריך התשלום נרשם בפרטי התקבול |
| משתמשים | משתמש יחיד. ריבוי משתמשים = תוספת בתשלום |
| מקור אמת ללקוחות | האקסל של הלקוח. המערכת מייבאת ומייצאת, **לא מחליפה** |
| אחסון | אזור אירופה (גרמניה) |

**רקע רגולטורי:** המשרד מתנהל כחברה בע"מ ולכן **אין עליו חובת הפקת קבלות** לפי הוראות ניהול פנקסי חשבונות. המערכת מספקת נוחות ומעקב, לא ציות. אין לבנות טיעונים או התנהגות מוצר על בסיס "חובה חוקית".

---

## 3. סטאק

| רכיב | טכנולוגיה | הערה |
|---|---|---|
| בסיס נתונים | Supabase (PostgreSQL) | **מסלול Pro** — נדרשים גיבויים אוטומטיים |
| ממשק | Vercel | Next.js |
| אוטומציות | n8n Cloud | חיובים חודשיים, ריטריים, משימות מתוזמנות |
| הנפקת מסמכים | Paperless API | דרך שכבת מתאם |
| אחסון מסמכים | Google Drive | גיבוי בלבד, **לא מערכת החשבונות** |

אזור אחסון: EU. יש לאמת הסמכת ISO 27001 ומיקום אירוח של n8n Cloud לפני חתימת נספח אבטחת המידע.

---

## 4. מודל הנתונים

```sql
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

  client_type       text not null default 'קבוע',  -- 'קבוע' | 'מזדמן'
  rate              numeric(12,2),          -- תעריף חודשי, ללקוח קבוע
  opening_balance   numeric(12,2) not null default 0,
  withholding_rate  numeric(5,2) not null default 0,  -- ניכוי במקור; הלקוח פטור

  external_doc_client_id text,              -- מזהה הלקוח אצל ספק ההנפקה
  is_active         boolean not null default true,
  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
```

> `withholding_rate` נשאר בסכימה למרות שהלקוח פטור — זול עכשיו, יקר אחר כך, וקריטי לשכפול ללקוח שני.

```sql
-- ============ משלמים ============
-- לקוח ≠ ישות מחייבת ≠ משלם.
-- אותו אדם עשוי להופיע כעצמאי, כבן זוג וכבעלים של חברה.
-- העברה אחת עשויה לשלם עבור כמה רשומות לקוח.

create table payers (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,
  bank_key      text unique,        -- "בנק-סניף-חשבון" מנורמל — מפתח ההתאמה החזק
  created_at    timestamptz default now()
);

create table payer_clients (
  payer_id     uuid references payers(id) on delete cascade,
  client_id    uuid references clients(id) on delete cascade,
  confirmed_at timestamptz,          -- מולא = אושר ידנית, נחשב ודאי
  primary key (payer_id, client_id)
);
```

```sql
-- ============ חיובים ============
create table charges (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id),
  charge_date date not null,
  amount      numeric(12,2) not null,
  description text,
  source      text not null,         -- 'auto_monthly' | 'manual' | 'opening'
  period_key  text,                  -- 'YYYY-MM' — מונע חיוב חודשי כפול
  created_at  timestamptz default now(),
  unique (client_id, source, period_key)
);
```

```sql
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
  created_at     timestamptz default now()
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

  status            text not null default 'new',
    -- new | matched | needs_review | approved | issued | ignored | failed
  matched_client_id uuid references clients(id),
  match_confidence  text,                   -- exact | high | medium | none
  match_reason      text,
  created_at        timestamptz default now()
);
```

```sql
-- ============ מסמכים שהונפקו ============
create table documents (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients(id),
  bank_transaction_id uuid references bank_transactions(id),

  amount              numeric(12,2) not null,
  payment_date        date not null,        -- מועד קבלת הכסף בפועל
  issued_at           timestamptz,          -- מועד ההנפקה

  idempotency_key     text not null unique, -- שכבת מניעת כפילות שנייה
  status              text not null default 'draft',
    -- draft | approved | sending | issued | failed | credited

  provider            text not null,        -- 'paperless' | 'sumit'
  provider_doc_id     text,
  provider_doc_number text,
  provider_client_id  text,
  tax_confirm         text,                 -- מספר הקצאה
  download_url        text,
  drive_file_id       text,

  error_message       text,
  created_at          timestamptz default now()
);

create table credit_notes (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references documents(id),
  provider_doc_id  text,
  reason           text not null,
  created_by       text,
  created_at       timestamptz default now()
);
```

```sql
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
  created_at  timestamptz default now()
);
```

### חישוב היתרה

```sql
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
```

**היתרה מחושבת ולעולם לא נשמרת כשדה.** שדה סטטי יסטה מהמציאות תוך שבועות.

---

## 5. שכבת המתאם להנפקה

ממשק פנימי אחד. המערכת לעולם לא קוראת ישירות לספק.

```ts
interface DocumentProvider {
  createDocument(input: CreateDocumentInput): Promise<CreateDocumentResult>;
  cancelDocument(providerDocId: string, reason: string): Promise<CancelResult>;
  findDocuments(query: FindQuery): Promise<ProviderDocument[]>;
}

interface CreateDocumentInput {
  preview: boolean;              // ריצה יבשה — לא נוצר מסמך
  client: {
    taxId: string;
    name: string;
    email?: string;
    mobile?: string;
    address?: string;
    externalId: string;          // clients.id שלנו
    isFixed: boolean;            // קבוע מול מזדמן
    providerClientId?: string;
  };
  items: { name: string; count: number; price: number; vatZero?: boolean }[];
  payment: {
    amount: number;
    paidAt: string;              // ISO — מועד קבלת הכסף בפועל
    method: 'bank_transfer';
    bank?: string; branch?: string; account?: string;
  };
  remark?: string;
}

interface CreateDocumentResult {
  providerDocId: string;
  documentNumber: string;
  taxConfirm?: string;
  downloadUrl?: string;
  providerClientId?: string;
}
```

### מימוש פייפרלס — הספק הפעיל

**בסיס:** `https://pl-apis-prod-il.azurewebsites.net`
**הזדהות:** טוקן שנוצר בממשק הלקוח (הגדרות ← חיבורים והרשאות). מחייב את חבילת האוטומציה והקישוריות, 50₪ לחודש.
**הגבלת קצב:** 10 קריאות לדקה. חובה תור עם השהיה.

| פעולה | Endpoint |
|---|---|
| יצירת מסמך | `PUT /api/invoices/create` |
| חיפוש מסמכים | `PUT /api/documents/search` |
| חיפוש לקוחות | `PUT /api/clients/search` |
| חיפוש מוצרים | `PUT /api/products/search` |
| עדכון מוצר | `PUT /api/products/update` |

**מיפוי `invoices/create`:**

```
type.iType         = 2            // חשבונית מס קבלה
type.bIsPreview    = preview
type.sRemark       = remark
type.sBasedOnDocID = <לביטול בלבד; אם מולא, client/items/payments מתעלמים>

client.sNumber     = client.taxId
client.sName       = client.name
client.sEmail      = client.email
client.sMobile     = client.mobile
client.sAddress    = client.address
client.sExternalID = client.externalId
client.bIsFixed    = client.isFixed
client.sPaperlessID = client.providerClientId   // אם ידוע

items[].sProductName = item.name
items[].dCount       = item.count
items[].dPrice       = item.price
items[].bVAT0        = item.vatZero

payments[].dAmount = payment.amount
payments[].dtDue   = payment.paidAt      // תאריך התשלום בפועל
payments[].sBank   = payment.bank
payments[].sBranch = payment.branch
payments[].sAccount = payment.account
payments[].iType   = <קוד העברה בנקאית — לאמת מול paymentType>
```

**תשובה:** `sDocumentID`, `sInvoiceNumber`, `sTaxConfirm`, `sDownloadPageURL`, `sURL`, `sClientID`.

**התנהגויות מאומתות:**
- הלקוח נוצר תוך כדי קריאת יצירת המסמך. אין endpoint נפרד ואין צורך בו.
- תאריך המסמך = מועד ההנפקה. `dtDue` = מועד התשלום. אושר על ידי הלקוח כמספק.
- `bIsPreview=true` **אינו מפיק מסמך** — מחזיר קישור לטיוטה בלבד.
- המספור ממשיך את הסדרה הקיימת של המשרד.
- **אין מנגנון מניעת כפילות מצד הספק.** באחריותנו.

**עדיין לא אומת בפועל — לבדוק בקריאה ראשונה:**
- התנהגות `sBasedOnDocID` וסוג המסמך הנוצר בביטול
- ערך `iType` הנכון בתוך `payments` עבור העברה בנקאית
- יכולות הסינון של `documents/search` (טווח תאריכים, לקוח, סכום)
- האם `sExternalID` נשמר וניתן לאחזור

### מימוש Sumit — חלופה מלאה

**בסיס:** `https://api.sumit.co.il`

| פעולה | Endpoint |
|---|---|
| יצירת מסמך | `/accounting/documents/create/` |
| סיום טיוטה | `/accounting/documents/movetobooks/` |
| ביטול | `/accounting/documents/cancel/` |
| PDF | `/accounting/documents/getpdf/` |
| פרטי מסמך | `/accounting/documents/getdetails/` |
| רשימת מסמכים | `/accounting/documents/list/` |
| לקוח | `/accounting/customers/create/` (SearchMode = מוצא או יוצר) |
| מספר הבא | `/accounting/general/getnextdocumentnumber/` |
| מכסות | `/website/companies/listquotas/` |

**הבדלים שהמתאם חייב לגשר עליהם:**
- ב-Sumit ניתן לתארך את **המסמך עצמו** אחורה. ברירת מחדל חוסמת מעל 3 ימים; הסרת החסימה מסירה אותה לגמרי (אין חלון מותאם). קריאה חורגת מחזירה שגיאה ולא מפיקה מסמך.
- טיוטה אינה מקבלת מספר. המספר מוקצה רק ב-`movetobooks`.
- ביטול מסמך חשבונאי יוצר מסמך זיכוי; ביטול טיוטה מוחק אותה.
- **`setnextdocumentnumber` — אסור לקרוא לה מהמערכת.** פעולה ידנית חד-פעמית של הלקוח בלבד.
- יש מכסת פעולות חודשית, נספרת לפי תאריך יצירה. לבדוק דרך `listquotas`.

---

## 6. קליטת דף חשבון

**מקור:** בנק הפועלים, אתר עסקי. "עובר ושב" ← "מידע" ← "תנועות בחשבון" ← טווח תאריכים ← אייקון הייצוא.
**פורמט:** CSV. **מגבלה: 2,000 תנועות לייצוא.**
**קידוד:** לפענח כ-`windows-1255` ולהמיר ל-UTF-8. לאמת מול קובץ אמיתי.

**עמודות:**
```
תאריך | תיאור הפעולה | פרטים | חשבון | אסמכתא | תאריך ערך | חובה | זכות | יתרה לאחר פעולה
```

### כללי עיבוד

1. **לעבד רק שורות עם ערך ב"זכות".** שורות "חובה" מסוננות.
2. לחשב `row_hash` לכל שורה:
   ```
   sha256(account + '|' + txn_date + '|' + reference + '|' + credit + '|' + balance_after)
   ```
   `יתרה לאחר פעולה` הוא המבדיל הקריטי — שתי תנועות זהות באותו יום יציגו יתרה שונה.
3. שורה שה-hash שלה קיים — **מסומנת ככפולה ולא נטענת מחדש.**
4. **עיבוד בסדר כרונולוגי עולה** בתוך כל אצווה.
5. כללי החרגה — לסמן `ignored` אוטומטית ולאפשר סימון ידני:
   - החזרים מרשות המסים
   - העברות בין חשבונות של העסק
   - כל תנועה שהמשתמש סימן "לא תשלום לקוח"

### פענוח שדה "פרטים"

```
המבצע: <שם המשלם> עבור: <טקסט חופשי> <בנק-סניף-חשבון>
```

```regex
/המבצע:\s*(?<payer>.+?)\s+עבור:\s*(?<purpose>.*?)\s*(?<account>\d{2}-\d{3}-\d{4,})?\s*$/
```

**המספר בסוף הוא בנק-סניף-חשבון של המשלם — מפתח ההתאמה החזק ביותר במערכת.** שם משתנה בכתיב; מספר חשבון לא. הפרסר חייב להיות סובלני: לא כל סוגי התנועות עומדים בתבנית. שורה שלא נפרסה נכנסת לתור הידני, לא נכשלת.

`עבור:` הוא טקסט חופשי שהמשלם הקליד — משמש כרמז בלבד, לעולם לא כהחלטה.

---

## 7. מנוע ההתאמה

עוצרים בהתאמה הראשונה:

| # | כלל | ביטחון |
|---|---|---|
| 1 | `parsed_bank_key` קיים ב-`payers` עם קישור **יחיד** ב-`payer_clients` | `exact` — אוטומטי |
| 2 | `parsed_bank_key` קיים אך מקושר **לכמה** לקוחות | `none` — תור ידני תמיד |
| 3 | שם מנורמל תואם `clients.name` או `spouse_name` | `high` — דורש אישור |
| 4 | תאימות חלקית של שם + סכום תואם חיוב פתוח | `medium` — דורש אישור |
| 5 | ללא התאמה | `none` — תור ידני |

**נרמול שם:** הסרת רווחים כפולים, ניקוד, "בע"מ", "עו"ד", "רו"ח", תווי פיסוק. השוואה חסרת רגישות לרישום.

**טבלת הכינויים הלומדת:** כל אישור ידני כותב שורה ל-`payer_clients` עם `confirmed_at`. מהפעם הבאה אותו משלם מזוהה אוטומטית.

> **חשוב לציפיות:** ביום הראשון הטבלה ריקה וכמעט כל תנועה תדרוש אישור. ההתכנסות לאוטומציה כמעט מלאה לוקחת שבועות. **אין להציג למשתמש הבטחה לזיהוי אוטומטי מלא מהיום הראשון.**

**מקרים שדורשים טיפול מפורש בממשק:**
- תשלום מרוכז הסוגר כמה חודשים או כמה ישויות → פיצול ידני לכמה חיובים
- תשלום חלקי → סוגר חלקית, היתרה נשארת פתוחה
- שני לקוחות באותו סכום ובאותו יום → נפתר לפי `bank_key`

---

## 8. מנוע היתרות

**חיוב חודשי אוטומטי** — משימה מתוזמנת ב-n8n, ב-1 לכל חודש:

```
for each client where is_active and client_type = 'קבוע' and rate is not null:
    insert into charges (client_id, charge_date, amount, source, period_key)
    values (client.id, first_of_month, client.rate, 'auto_monthly', 'YYYY-MM')
    on conflict do nothing   -- האינדקס הייחודי מונע חיוב כפול
```

**חיוב חד-פעמי** — נוצר ידנית ללקוח מזדמן כשמסופק שירות.

**יתרת פתיחה** — הלקוח מזין בעצמו לכל לקוח, פעם אחת, במסך ייעודי.

**מה מוריד את היתרה:** מסמך בסטטוס `issued`. תנועה שהותאמה אך טרם הונפק לה מסמך מוצגת בנפרד כ"שולם, טרם הונפק" — כדי שמסך היתרות לא ישקר וגם לא יבלבל.

---

## 9. מסכי המערכת

| מסך | תוכן |
|---|---|
| **לקוחות** | טבלה, חיפוש, סינון לפי סוג וסטטוס, יצירה, עריכה, פעיל/לא פעיל |
| **כרטיס לקוח** | פרטים, תעריף, יתרת פתיחה, יתרה נוכחית, היסטוריית חיובים ומסמכים |
| **ייבוא אקסל** | העלאה, מיפוי עמודות, תצוגה מקדימה, דוח שגיאות, ייצוא חזרה |
| **קליטת דף חשבון** | העלאת CSV ← **מסך ביניים**: "בקובץ X תנועות, Y חדשות, Z כבר טופלו, W הוחרגו" |
| **תור אישורים** | רשימת תנועות עם הלקוח שזוהה ורמת הביטחון; תיקון, פיצול, החרגה, אישור |
| **יתרות** | כל הלקוחות ויתרתם; סימון נפרד ל"שולם טרם הונפק" |
| **מסמכים** | היסטוריה, סטטוס, מספר מסמך, קישור להורדה, פעולת ביטול |
| **יומן ביקורת** | לקריאה בלבד |

**הנפקת מסמך בודד** היא פעולה מכרטיס הלקוח, לא פיצ'ר נלווה. זו גם רשת הביטחון אם ההתאמה האוטומטית מאכזבת.

---

## 10. זרימת ההנפקה

```
תנועה מאושרת בתור
   ↓
יצירת שורת documents בסטטוס 'draft' עם idempotency_key
   ↓
[אופציונלי] קריאה עם preview=true — ריצה יבשה, לא נוצר מסמך
   ↓
סטטוס 'sending' → קריאה לספק
   ↓
הצלחה: שמירת provider_doc_id, documentNumber, taxConfirm, downloadUrl
        סטטוס 'issued', התנועה מסומנת 'issued'
        הורדת המסמך לגוגל דרייב, תיקייה לפי שם לקוח
   ↓
כשל: סטטוס 'failed' + error_message. חזרה לתור הידני.
```

**כלל קריטי — אין שליחה חוזרת אוטומטית.** אם קריאה לא החזירה תשובה, המערכת **אינה** שולחת שוב. במקום זה היא קוראת ל-`documents/search` בטווח הרלוונטי ובודקת אם המסמך כבר נוצר. רק אם לא — מאפשרת שליחה מחדש, באישור המשתמש.

**ביטול:** לעולם לא מחיקה. יצירת מסמך זיכוי דרך `sBasedOnDocID`, שמירת רשומה ב-`credit_notes`, ועדכון המסמך המקורי לסטטוס `credited`.

---

## 11. מניעת כפילות — שתי שכבות

אף אחד משני הספקים אינו מספק מנגנון. זו אחריות המערכת.

**שכבה 1 — `row_hash`.** מונע קליטה חוזרת של אותה תנועת בנק.

**שכבה 2 — `idempotency_key`.** נוצר לפני הקריאה לספק ונשמר עם אילוץ ייחודיות:

```
idempotency_key = sha256(client_id + '|' + bank_transaction_id + '|' + amount + '|' + payment_date)
```

**שכבה 3 — אימות בדיעבד.** לאחר כל אצווה, שליפת המסמכים מהספק בטווח והשוואה מול `documents`. פער מדווח למשתמש.

---

## 12. אבטחה ופרטיות

המערכת מחזיקה מאגר של רואה חשבון: ת"ז, תיקי ניכויים, נתוני בן זוג ונתוני חוב. **רמת אבטחה בינונית לפחות.**

| דרישה | יישום |
|---|---|
| הצפנה במעבר ובמנוחה | TLS; הצפנת Supabase |
| בקרת גישה | הרשאות מינימום; מפתחות API בסודות בלבד, לעולם לא בקוד או ב-repo |
| תיעוד גישה | `audit_log` על כל צפייה, שינוי, אישור והנפקה |
| גיבויים | Supabase Pro — גיבוי אוטומטי יומי |
| מיקום | אזור EU |
| ספקי משנה | ISO 27001 לכל ספק; לאמת n8n Cloud |
| פיתוח | **נתונים ממוסכים בלבד עד לחתימת ההסכם.** בדיקות מול חשבון פייפרלס נפרד של NoamG שאינו מנהל הנהלת חשבונות אמיתית |

**הסכם שירות עם נספח אבטחת מידע לפי תקנה 15 חייב להיחתם לפני נגיעה בנתונים אמיתיים.** הלקוח הוא בעל המאגר; NoamG הוא מחזיק.

---

## 13. כללי ברזל

1. **המערכת לעולם לא יוצרת, לא מספררת ולא מאחסנת מסמך מס כמקור.** הספק מקצה מספר וחותמת. בסיס הנתונים הוא מערכת עזר תפעולית בלבד.
2. **אין מחיקה ואין עריכה** של מסמך שהונפק. ביטול = מסמך זיכוי.
3. **אישור אנושי לפני כל הנפקה.** לא נדרש בחוק — נדרש אצלנו.
4. **המערכת לא סומכת על הבנק, היא סומכת על עצמה.** מסך ביניים בכל קליטה.
5. **אין שליחה חוזרת אוטומטית.** אימות לפני ניסיון נוסף.
6. **אין התחברות לבנק.** ייצוא ידני בלבד.
7. **האקסל לא מוחלף — הוא נקרא.** ייבוא וייצוא, בלי הבטחת מיגרציה.
8. **אין קריאה ל-`setnextdocumentnumber`** או לכל פעולה שמשנה מספור.
9. **עיבוד כרונולוגי עולה** בתוך כל אצווה.
10. **יומן ביקורת מלא**, בלי יוצא מן הכלל.
11. **המערכת אינה נותנת ייעוץ מס או חשבונאות.** כל שיקול דעת מקצועי הוא של הלקוח.
12. **כל קריאה לספק עוברת דרך המתאם.** אין קריאות ישירות בלוגיקה העסקית.

---

## 14. מחוץ להיקף

אונבורדינג לקוחות בטופס · תבניות הודעה וכפתור וואטסאפ · תזכורות דיווח מע"מ ומקדמות · ריבוי משתמשים והרשאות · ייפוי כוח מול רשות המסים · חיבור אוטומטי לבנק · ניהול הוצאות המשרד.

כולם מודולים עתידיים על אותה תשתית, בתמחור נפרד.

---

## 15. פריטים חסרים לפני עלייה לאוויר

| # | פריט | על מי |
|---|---|---|
| 1 | הסכם שירות + נספח אבטחת מידע חתומים | NoamG → לקוח |
| 2 | ייצוא של חודש תנועות אמיתי לכיול הפרסר וההתאמה | לקוח |
| 3 | קובץ האקסל המלא | לקוח |
| 4 | תעריף חודשי לכל לקוח קבוע | לקוח |
| 5 | יתרות פתיחה | לקוח |
| 6 | רכישת חבילת האוטומציה והפקת טוקן | NoamG (פיתוח), לקוח (פרודקשן) |
| 7 | משמעות עמודת `6` ושתי עמודות `מקדמות` באקסל | לקוח |
| 8 | מספר חשבונות הבנק שאליהם נכנסים תשלומים | לקוח |
| 9 | אימות ISO 27001 ומיקום אירוח של n8n Cloud | NoamG |

---

## 16. קריטריוני קבלה

1. ייבוא האקסל יוצר את כל הלקוחות עם `tax_id` כמפתח, בלי כפילויות, ומדווח על שורות שנכשלו
2. קליטת אותו קובץ CSV פעמיים מזהה 100% מהשורות כמטופלות ואינה יוצרת רשומה חדשה
3. הפרסר מחלץ שם משלם וחשבון בנק מקובץ אמיתי; שורות שלא נפרסו מגיעות לתור ולא מפילות את הקליטה
4. אישור ידני של התאמה אחת גורם לזיהוי אוטומטי של אותו משלם בקליטה הבאה
5. משלם המקושר לכמה לקוחות מגיע לתור הידני תמיד, גם אחרי אישור קודם
6. חיוב חודשי נוצר פעם אחת בלבד לכל לקוח קבוע לכל חודש, גם בהרצה כפולה
7. מסך היתרות תואם חישוב ידני על נתוני בדיקה
8. הנפקה בתצוגה מקדימה אינה יוצרת מסמך אצל הספק
9. הנפקה אמיתית שומרת מספר מסמך, מספר הקצאה וקישור להורדה, ומורידה את המסמך לדרייב
10. שליחה כפולה של אותה תנועה נחסמת על ידי `idempotency_key`
11. ביטול יוצר מסמך זיכוי ואינו מוחק דבר
12. כל פעולה מהותית מופיעה ביומן הביקורת
13. החלפת הספק במתאם ל-Sumit אינה דורשת שינוי בלוגיקה העסקית
