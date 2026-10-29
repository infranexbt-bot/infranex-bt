import { Database } from "bun:sqlite";

const db = new Database("/home/z/my-project/db/custom.db", { readonly: true });

try {
  const count = db.query("SELECT COUNT(*) as c FROM SmartGoal").get();
  console.log("SmartGoal total rows:", count.c);

  const rows = db.query("SELECT * FROM SmartGoal ORDER BY rowid DESC LIMIT 5").all();
  console.log("--- latest 5 rows ---");
  for (const r of rows) {
    console.log(JSON.stringify(r).slice(0, 400));
  }
} catch (e) {
  console.log("ERR:", e.message);
}
db.close();
