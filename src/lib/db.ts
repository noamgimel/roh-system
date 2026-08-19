import postgres from "postgres";

// חיבור יחיד לכל התהליך — נשמר על הגלובל כדי לשרוד hot-reload בפיתוח
declare global {
  var __sql: ReturnType<typeof postgres> | undefined;
}

function createConnection() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL חסר — הגדר אותו ב-.env.local");
  }
  // הערה: עמודות numeric חוזרות כמחרוזת (ברירת המחדל של postgres.js) —
  // סכומים כספיים לעולם לא עוברים דרך float.
  return postgres(url, {
    max: 10,
    transform: postgres.camel,
  });
}

export const sql = globalThis.__sql ?? createConnection();

if (process.env.NODE_ENV !== "production") {
  globalThis.__sql = sql;
}
