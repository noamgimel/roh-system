import fs from "node:fs";
import path from "node:path";
import type { Sql } from "postgres";

// מריץ את כל קובצי ה-SQL שב-db/migrations לפי סדר שמם,
// ומדלג על מה שכבר הוחל (מתועד בטבלת schema_migrations).
export async function migrate(sql: Sql, migrationsDir?: string) {
  const dir =
    migrationsDir ?? path.join(process.cwd(), "db", "migrations");

  await sql`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set(
    (await sql`select name from schema_migrations`).map((r) => r.name as string)
  );

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = fs.readFileSync(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    ran.push(file);
  }
  return ran;
}
