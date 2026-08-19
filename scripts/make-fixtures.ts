// יוצר קובצי דוגמה ממוסכים לבדיקה ידנית של המסכים:
//   npm run fixtures
// fixtures/bank-sample.csv — דף חשבון בקידוד windows-1255 (כמו מהבנק)
// fixtures/clients-sample.xlsx — אקסל לקוחות
import fs from "node:fs";
import path from "node:path";
import { buildBankCsvCp1255 } from "../tests/helpers/fixtureBankCsv";
import { buildFixtureWorkbook } from "../tests/helpers/fixtureWorkbook";

async function main() {
  const dir = path.join(process.cwd(), "fixtures");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "bank-sample.csv"), buildBankCsvCp1255());
  fs.writeFileSync(
    path.join(dir, "clients-sample.xlsx"),
    await buildFixtureWorkbook()
  );
  console.log("נכתבו: fixtures/bank-sample.csv, fixtures/clients-sample.xlsx");
}

main();
