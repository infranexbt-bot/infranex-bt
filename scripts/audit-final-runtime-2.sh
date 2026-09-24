#!/bin/bash
# AUDIT-FINAL v2 — authenticated runtime suite (single call)
set -u
cd /home/z/my-project
say() { echo "[audit2] $*"; }

PAT1="next dev"
pkill -f "$PAT1" 2>/dev/null; pkill -f run-dev-keepalive 2>/dev/null; sleep 2
export DATABASE_URL="file:/home/z/my-project/db/custom.db"
export NODE_OPTIONS="--max-old-space-size=768"
node node_modules/.bin/next dev -p 3000 >> /tmp/audit-dev2.log 2>&1 &
SRV=$!

for i in $(seq 1 30); do
  sleep 5
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3000/login 2>/dev/null)
  { [ "$c" = "200" ] || [ "$c" = "307" ]; } && { say "server up (~$((i*5))s)"; break; }
done

say "login: $(curl -s -c /tmp/audit-cookie.txt -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"userId":"admin","code":"BRJ2-W2GT-WJNF-97VC"}' -o /tmp/audit-login.json -w '%{http_code}')"
head -c 100 /tmp/audit-login.json; echo

say "--- guarded APIs WITH session ---"
for ep in "api/auth/session" "api/workers/status" "api/subnets/odds-history?netuid=64" "api/monitoring" "api/network" "api/subnets" "api/deployments"; do
  code=$(curl -s -b /tmp/audit-cookie.txt -o /tmp/ep.json -w "%{http_code}" --max-time 90 "http://localhost:3000/$ep")
  say "  $ep → $code ($(wc -c < /tmp/ep.json)B)"
done

say "--- rate limit: sync-all x2 ---"
curl -s -b /tmp/audit-cookie.txt -o /dev/null -w "  sync-all #1 → %{http_code}\n" --max-time 150 -X POST "http://localhost:3000/api/subnets/sync-all"
sleep 2
rl=$(curl -s -b /tmp/audit-cookie.txt -o /tmp/rl.json -w "%{http_code}" --max-time 60 -X POST "http://localhost:3000/api/subnets/sync-all")
say "  sync-all #2 → $rl ($(head -c 60 /tmp/rl.json))"

say "--- pages (with session) ---"
for pg in "dashboard" "subnets" "opportunities" "cpus" "deployments" "monitoring"; do
  code=$(curl -s -b /tmp/audit-cookie.txt -o /tmp/pg.html -w "%{http_code}" --max-time 120 "http://localhost:3000/$pg")
  say "  /$pg → $code ($(wc -c < /tmp/pg.html)B)"
done

say "--- dev log errors ---"
grep -iE "error" /tmp/audit-dev2.log 2>/dev/null | grep -viE "prisma:query" | tail -4 || true
kill $SRV 2>/dev/null
say "DONE"
