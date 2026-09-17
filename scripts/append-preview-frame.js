// Append the PREVIEW-FRAME-1 worklog entry (persisted script — never inline).
import fs from "node:fs";

const ENTRY = `
---
Task ID: PREVIEW-FRAME-1
Agent: main (Super Z)
Task: User reported the Z.ai preview link (preview-chat-<chat_id>.space-z.ai) shows "refused to connect". Diagnose and fix.

Work Log:
- State check first (stale-summary discipline): WALLET-ECON-1 (e077e71) was already committed AND pushed after the summary point; worklog entry verified; server live. No rebuild of delivered work needed — closed out the dirty tracked runtime cache (.alpha-price-history.json) with chore commit 5c92d82, tree clean.
- DIAGNOSIS chain: app up + bound 0.0.0.0:3000 (bun pid confirmed via ss -tlnp) -> preview domain resolves + TLS OK + returns 307 from inside the container (proxy reaches app fine) -> headers via preview domain vs local both show X-Frame-Options: DENY on every response -> that header forbids ALL iframe embedding; the preview UI embeds the app in an iframe, and Chrome's exact text for a frame-blocked page is "refused to connect". Root cause = the app's own next.config.ts security header, not the proxy, not the bind address, not auth.
- FIX: next.config.ts headers() — removed X-Frame-Options: DENY, added Content-Security-Policy: frame-ancestors 'self' https://*.space-z.ai https://*.z.ai (code-commented so nobody reintroduces the blanket DENY). frame-ancestors is the modern selective-allow replacement; modern browsers ignore XFO when it is present. Blocks third-party framing still (clickjacking protection preserved), permits the platform's preview/chat surfaces.
- REBUILD CYCLE (discipline held): pkill standalone server -> tsc --noEmit --incremental false (0 errors) -> bun run build (green first try, no fonts.gstatic timeout this time) -> ( nohup bun run start > prod-launch.log 2>&1 & ) + sleep 12.
- VERIFY: gates intact (root 307, /api/deployments 401, /api/wallets 401); through the preview domain: X-Frame-Options GONE, CSP frame-ancestors present on both the 307 and the login 200. Iframe will now load. Header-only change — no logic touched, suites unaffected (436 checks remain the recorded baseline).

Stage Summary:
- Preview embedding fixed at the source: app is framable by the platform's own surfaces (*.space-z.ai, *.z.ai) and by nobody else. If the user's chat UI ever lives on another domain, add that origin to frame-ancestors in next.config.ts and rebuild. Committed and pushed on nextjs-platform.
`;

fs.appendFileSync("/home/z/my-project/worklog.md", ENTRY, "utf8");
console.log("worklog appended:", ENTRY.length, "chars");
