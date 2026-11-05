// INVEST-PLAYBOOK-VERIFY — mint a local session cookie for browser
// self-verification of the auth-gated dashboard. Writes the cookie value to
// /tmp/infranex-verify-cookie (never stdout) so it can be injected into the
// verification browser context. Does NOT read or print any access code.
import { PrismaClient } from "@prisma/client";
import { createSessionToken } from "../src/lib/auth";

const db = new PrismaClient();
const user = await db.appUser.findFirst({
  where: { active: true, role: "admin" },
  orderBy: { userId: "asc" },
});
if (!user) {
  console.error("no active admin user found");
  process.exit(1);
}
const token = await createSessionToken({
  userId: user.userId,
  label: user.label,
  role: user.role,
});
await Bun.write("/tmp/infranex-verify-cookie", token);
console.log("cookie written for user:", user.userId, "role:", user.role);
await db.$disconnect();
