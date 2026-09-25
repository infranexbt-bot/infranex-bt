#!/bin/bash
# STRUCTURE-1 smoke: boot the standalone prod build and probe key routes.
cd /home/z/my-project
LOG=/home/z/my-project/smoke-structure.log
NODE_ENV=production DATABASE_URL=file:/home/z/my-project/db/custom.db \
  INFRANEX_REPO_ROOT=/home/z/my-project \
  NODE_OPTIONS="--max-old-space-size=768" \
  bun .next/standalone/server.js > "$LOG" 2>&1 &
SPID=$!
UP=0
for i in $(seq 1 45); do
  sleep 1
  if curl -s -o /dev/null --max-time 2 http://localhost:3000/login; then UP=1; break; fi
done
echo "server up: $UP"
echo "--- /login (expect 200):"
curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 http://localhost:3000/login
echo "--- / (expect 307 redirect to login, unauthenticated):"
curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 http://localhost:3000/
echo "--- /api/network (expect 401 gated):"
curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 http://localhost:3000/api/network
kill $SPID 2>/dev/null
echo "--- server log tail:"
tail -4 "$LOG"
