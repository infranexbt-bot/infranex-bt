// Append the RECOVERY-1 worklog entry (persisted script — never inline).
// Recreates /home/z/my-project/worklog.md after the container wipe; the file
// starts fresh with this entry.
import fs from "node:fs";

const ENTRY = `# INFRANEX BT — Worklog (restarted after container wipe; prior history summarized in git log)

---
Task ID: RECOVERY-1
Agent: main (Super Z)
Task: User asked to "load the web app" — the sandbox had been wiped (repo, scripts, worklog, db, download/ guide all gone). Restore everything from git and bring the app up.

Work Log:
- Detected full workspace reset: only download/skills/upload survived; /home/z/my-project/worklog.md, scripts/, infranex-bt/ all missing. /home/z/my-project/.env reset to stale default DATABASE_URL=file:/home/z/my-project/db/custom.db.
- Restored from GitHub (this is why everything was pushed): git clone -b nextjs-platform https://github.com/krank21r/infranex-bt.git -> at bfb864f (includes docs/setup-guide/ guide v1.3 with Part H + all screenshots via GUIDE-5/GUIDE-6 commits).
- Restored user deliverable: copied docs/setup-guide/* back to /home/z/my-project/download/miner-setup-guide/ (HTML + PDF v1.3 24pp + 19 images + README).
- bun install; prisma db push (db/custom.db recreated); Prisma Client 6.19.2 generated.
- Recreated scripts/users.local.json from conversation-known codes (admin BRJ2-…, ops01, ops02, analyst01, viewer01 — codes PRESERVED, not rotated); ran DATABASE_URL=file:/home/z/my-project/infranex-bt/db/custom.db bun scripts/seed-users.ts -> 5 AppUser rows, codeEnc backfilled, mirrors refreshed (scripts/ + /tmp/my-project wipe-proof copy). Hit the KNOWN stale-DATABASE_URL trap on first seed run (workspace .env points outside repo) — fixed by pinning the URL inline, as per established discipline.
- bun run build (standalone output); started via ( nohup bun run start > prod-launch.log 2>&1 & ); gate checks ALL GREEN: root 307, /login 200, API 401 unauth, POST /api/auth/login admin 200.
- AppUser data restored; runtime data NOT restored (deployments, saved provider keys, wallets were runtime-only in the wiped db — user must re-save their RunPod API key when they get there; no real deployment existed yet, so no loss).
- Bot id for preview identified from FC_FUNCTION_NAME=ws-913f1e62-27d6-476f-89b1-83c4b5cb1b4a; Caddy :81 -> localhost:3000 (Caddyfile verified, CSP frame-ancestors *.space-z.ai fix from PREVIEW-FRAME-1 survives in next.config.ts on the cloned branch).

Stage Summary:
- Full recovery from git in one pass: app RUNNING on port 3000, logins unchanged, guide v1.3 back in download/. Lesson reaffirmed: git push after every turn is what makes container wipes a non-event.
`;

fs.appendFileSync("/home/z/my-project/worklog.md", ENTRY, "utf8");
console.log("worklog recreated, entry appended:", ENTRY.length, "chars");
