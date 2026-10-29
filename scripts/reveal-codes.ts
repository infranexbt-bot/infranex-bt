// One-off: reveal the admin access code via the app's own decryption path
// (same capability the Admin Panel exposes to logged-in admins).
import { decryptSecret } from "../src/lib/devops/crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } },
});

const users = await db.appUser.findMany({ where: { active: true } });
for (const u of users) {
  let code = "";
  try {
    code = u.codeEnc ? decryptSecret(u.codeEnc) : "";
  } catch {
    code = "(decrypt failed)";
  }
  console.log(`${u.userId} (${u.role}): ${code}`);
}
process.exit(0);
