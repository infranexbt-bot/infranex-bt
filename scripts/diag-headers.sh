#!/bin/bash
# DIAGNOSTIC (temporary, ~30s downtime):
# 1. See whether exported env reaches the running app (workers status discriminator)
# 2. Swap :3000 with a header-echo server and hit the PUBLIC URL to capture
#    exactly which headers the space-z.ai edge forwards (Host, x-forwarded-*).
# 3. Restore the production server.
set -u
PROJECT=/home/z/my-project

echo "=== A) who is serving :3000 ==="
ss -ltnp 2>/dev/null | rg ':3000' || echo "(nothing on :3000)"

echo "=== B) env discriminator: login + workers/status ==="
ADMIN=$(grep -oE '[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}' "$PROJECT/MEMORY.md" 2>/dev/null | head -1)
[ -z "$ADMIN" ] && ADMIN='BRJ2-W2GT-WJNF-97VC'
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/login || true)
echo "login page: $CODE"
if [ "$CODE" = "200" ]; then
  rm -f /tmp/cj.txt
  curl -s -c /tmp/cj.txt -o /tmp/login.json -w 'login: %{http_code}\n' --max-time 10 \
    -X POST http://127.0.0.1:3000/api/auth/login \
    -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:3000' \
    -d "{\"userId\":\"admin\",\"accessCode\":\"$ADMIN\"}"
  curl -s -b /tmp/cj.txt --max-time 10 http://127.0.0.1:3000/api/workers/status | head -c 600
  echo
fi

echo "=== C) header echo through public URL ==="
pkill -f run-prod-keepalive.sh 2>/dev/null; pkill -f "standalone/server.js" 2>/dev/null; sleep 2
cat > /tmp/echo-headers.js <<'EOF'
require("http").createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  const h = { ...req.headers };
  delete h.cookie; delete h.authorization;
  res.end(JSON.stringify({ method: req.method, url: req.url, headers: h }, null, 1));
}).listen(3000, "127.0.0.1", () => console.log("echo up"));
EOF
setsid nohup /usr/local/bin/bun /tmp/echo-headers.js > /tmp/echo.log 2>&1 < /dev/null &
sleep 2
echo "--- public URL headers as seen by the app ---"
curl -s --max-time 15 -X POST https://x1vjv8jfmfp0-d.space-z.ai/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://x1vjv8jfmfp0-d.space-z.ai' \
  -H 'sec-fetch-site: same-origin' \
  -d '{"userId":"x","accessCode":"y"}'
echo
echo "--- direct local headers for comparison ---"
curl -s --max-time 5 -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:3000' \
  -d '{"userId":"x","accessCode":"y"}' | head -c 400
echo
pkill -f echo-headers.js 2>/dev/null; sleep 1

echo "=== D) restore production server ==="
cd "$PROJECT" || exit 1
setsid nohup bash run-prod-keepalive.sh > /tmp/prod-keepalive.log 2>&1 < /dev/null &
for i in $(seq 1 30); do
  sleep 4
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/login 2>/dev/null)
  [ "$c" = "200" ] && { echo "server restored: 200"; exit 0; }
done
echo "RESTORE FAILED"
exit 1
