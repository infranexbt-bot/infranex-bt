#!/bin/bash
# AUDIT-FINAL — single-call runtime verification (server + login + guarded APIs)
set -u
cd /home/z/my-project
say() { echo "[audit-final] $*"; }

# stop leftovers, start fresh server inside THIS call
pkill -f "next dev" 2>/dev/null; pkill -f run-dev-keepalive 2>/dev/null; sleep 2
export DATABASE_URL="file:/home/z/my-project/db/custom.db"
export NODE_OPTIONS="--max-old-space-size=768"
node node_modules/.bin/next dev -p 3000 >> /tmp/audit-dev.log 2>&1 &
SRV=$!

up=0
for i in $(seq 1 40); do
  sleep 5
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3000/login 2>/dev/null)
  if [ "$c" = "200" ] || [ "$c" = "307" ]; then up=1; say "server up after ~$((i*5))s (login=$c)"; break; fi
done
[ "$up" = "0" ] && { say "FAIL: server never came up"; tail -5 /tmp/audit-dev.log; exit 1; }

# 1) login
code=$(curl -s -c /tmp/audit-cookie.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userId":"admin","accessCode":"BRJ2-W2GT-WJNF-97VC"}' \
  -o /tmp/audit-login.json -w "%{http_code}" --max-time 60)
say "login: $code $(head -c 80 /tmp/audit-login.json)"

# 2) guarded APIs WITH session
say "--- guarded APIs (with session) ---"
for ep in "api/auth/session" "api/workers/status" "api/subnets/odds-history?netuid=64" "api/devops/subnet-requirements?netuid=64" "api/monitoring" "api/network"; do
  code=$(curl -s -b /tmp/audit-cookie.txt -o /tmp/audit-ep.json -w "%{http_code}" --max-time 90 "http://localhost:3000/$ep")
  say "  $ep → $code ($(wc -c < /tmp/audit-ep.json)B)"
done

# 3) guarded APIs WITHOUT session (must be 401/403)
say "--- guard rejection (no cookie) ---"
for ep in "api/workers/status" "api/providers/keys" "api/monitoring" "api/deployments" "api/devops/hosts"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "http://localhost:3000/$ep")
  say "  $ep → $code $([ "$code" = "401" ] || [ "$code" = "403" ] && echo PASS || echo CHECK)"
done

# 4) heavy write endpoint rate limit (sync-all twice fast)
say "--- rate limit check (sync-all) ---"
c1=$(curl -s -b /tmp/audit-cookie.txt -o /dev/null -w "%{http_code}" --max-time 120 -X POST "http://localhost:3000/api/subnets/sync-all")
say "  sync-all #1 → $c1"
c2=$(curl -s -b /tmp/audit-cookie.txt -o /tmp/audit-rl.json -w "%{http_code}" --max-time 60 -X POST "http://localhost:3000/api/subnets/sync-all")
say "  sync-all #2 → $c2 $(head -c 60 /tmp/audit-rl.json)"

# 5) key pages render
say "--- pages ---"
for pg in "" "subnets" "opportunities" "cpus" "deployments"; do
  code=$(curl -s -b /tmp/audit-cookie.txt -o /tmp/audit-page.html -w "%{http_code}" --max-time 90 "http://localhost:3000/$pg")
  say "  /$pg → $code ($(wc -c < /tmp/audit-page.html)B)"
done

say "server log tail:"
grep -iE "error|warn" /tmp/audit-dev.log | grep -v "prisma:query" | tail -5 || echo "  (no errors in dev log)"
kill $SRV 2>/dev/null
say "DONE"
