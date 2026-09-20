/**
 * restore-users.ts — one-off recovery: re-seed AppUser rows from the
 * wipe-proof mirror after a DB rebuild. Codes are re-hashed (scrypt) and
 * re-encrypted (AES-256-GCM, same .devops-secret). Then re-mirror to
 * scripts/users.local.json.
 *
 * Run: cd /home/z/my-project && bun scripts/restore-users.ts
 */
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { hashCode, generateAccessCode } from "../src/lib/auth-users";
import { encryptSecret } from "../src/lib/devops/crypto";

const MIRROR = "/tmp/my-project/infranex-users.local.json";
const db = new PrismaClient();

interface MirrorUser {
  userId: string;
  label?: string;
  role: string;
  code: string;
}

async function main() {
  const raw = fs.readFileSync(MIRROR, "utf8");
  const users = JSON.parse(raw) as MirrorUser[];
  console.log(`mirror users: ${users.length}`);

  for (const u of users) {
    if (!u.userId || !u.code) {
      console.log(`SKIP malformed entry: ${u.userId ?? "?"}`);
      continue;
    }
    const code = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(u.code)
      ? u.code
      : generateAccessCode(); // corrupt mirror entry → fresh code
    await db.appUser.upsert({
      where: { userId: u.userId },
      update: {
        codeHash: hashCode(code),
        codeEnc: encryptSecret(code),
        active: true,
        label: u.label ?? u.userId,
        role: u.role || "member",
      },
      create: {
        userId: u.userId,
        label: u.label ?? u.userId,
        role: u.role || "member",
        active: true,
        codeHash: hashCode(code),
        codeEnc: encryptSecret(code),
      },
    });
    console.log(`restored: ${u.userId} (${u.role})`);
  }

  // Re-create the repo mirror (scripts/users.local.json) the same way
  // syncCredentialFiles does.
  const rows = await db.appUser.findMany({ orderBy: { userId: "asc" } });
  const payload = rows.map((r) => ({
    userId: r.userId,
    label: r.label ?? r.userId,
    role: r.role,
    code: r.codeEnc ? require("../src/lib/devops/crypto").decryptSecret(r.codeEnc) : "",
  }));
  fs.writeFileSync(
    "/home/z/my-project/scripts/users.local.json",
    JSON.stringify(payload, null, 2) + "\n",
    { mode: 0o600 }
  );
  console.log(`mirror re-synced: scripts/users.local.json (${rows.length} users)`);

  const count = await db.appUser.count();
  console.log(`AppUser rows now: ${count}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error("RESTORE FAILED:", e);
  process.exit(1);
});
