import postgres from "postgres";
import { migrate } from "@/lib/migrate";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://roh:roh@localhost:54330/roh_test";

/** חיבור נקי ל-DB הבדיקות: מפיל את כל הסכימה ומריץ מיגרציות מאפס. */
export async function freshTestDb() {
  const sql = postgres(TEST_DATABASE_URL, {
    max: 5,
    transform: postgres.camel,
    onnotice: () => {},
  });
  await sql.unsafe(`drop schema public cascade; create schema public;`);
  await migrate(sql);
  return sql;
}
