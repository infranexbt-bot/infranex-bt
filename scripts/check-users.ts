// Check AppUser rows against the mirror file
import { PrismaClient } from "@prisma/client";
import { verifyCode } from "../src/lib/auth-users";

const db = new PrismaClient();
async function main() {
  const users = await db.appUser.findMany();
  const code = "BRJ2-W2GT-WJNF-97VC";
  for (const u of users) {
    const match = u.userId === "admin" ? verifyCode(code, u.codeHash) : null;
    console.log(u.userId, u.role, "active=" + u.active, "codeHashLen=" + u.codeHash.length, u.userId === "admin" ? `codeMatches=${match}` : "");
  }
}
main().finally(() => db.$disconnect());
