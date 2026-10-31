#!/bin/bash
# ECHO-DIAG v2 — determine precisely which hop produces the 403.
# App is stopped; a marked echo server owns :3000 and LOGS every hit.
# Then probe the public URL with different header combos.
set -u
PROJECT=/home/z/my-project
LOG=/tmp/echo-hits.log

pkill -f run-prod-keepalive.sh 2>/dev/null; pkill -f "standalone/server.js" 2>/dev/null
pkill -f echo-headers.js 2>/dev/null; sleep 2
: > "$LOG"

cat > /tmp/echo-headers.js <<'EOF'
require("http").createServer((req, res) => {
  const h = { ...req.headers };
  delete h.cookie; delete h.authorization;
  require("fs").appendFileSync("/tmp/echo-hits.log",
    new Date().toISOString() + " " + req.method + " " + req.url + " " + JSON.stringify(h) + "\n");
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("ECHO-SERVER-3000 method=" + req.method + " origin=" + (req.headers.origin ?? "-") +
          " host=" + (req.headers.host ?? "-") +
          " xfh=" + (req.headers["x-forwarded-host"] ?? "-") +
          " sfs=" + (req.headers["sec-fetch-site"] ?? "-"));
}).listen(3000, "127.0.0.1", () => console.log("echo up"));
EOF
setsid nohup /usr/local/bin/bun /tmp/echo-headers.js > /tmp/echo.log 2>&1 < /dev/null &
sleep 2

PUB=https://x1vjv8jfmfp0-d.space-z.ai
J='Content-Type: application/json'
D='{"userId":"x","accessCode":"y"}'

echo "E1 public GET /login:              $(curl -s -o /tmp/e1.txt -w '%{http_code}' --max-time 15 $PUB/login)  body=$(head -c 80 /tmp/e1.txt)"
echo "E2 public POST no Origin:          $(curl -s -o /tmp/e2.txt -w '%{http_code}' --max-time 15 -X POST $PUB/api/auth/login -H "$J" -d "$D")  body=$(head -c 80 /tmp/e2.txt)"
echo "E3 public POST Origin=public host: $(curl -s -o /tmp/e3.txt -w '%{http_code}' --max-time 15 -X POST $PUB/api/auth/login -H "$J" -H "Origin: $PUB" -d "$D")  body=$(head -c 80 /tmp/e3.txt)"
echo "E4 public POST Origin=evil:        $(curl -s -o /tmp/e4.txt -w '%{http_code}' --max-time 15 -X POST $PUB/api/auth/login -H "$J" -H 'Origin: https://evil.example.com' -d "$D")  body=$(head -c 80 /tmp/e4.txt)"
echo "E5 public POST sfs=same-origin:    $(curl -s -o /tmp/e5.txt -w '%{http_code}' --max-time 15 -X POST $PUB/api/auth/login -H "$J" -H "Origin: $PUB" -H 'sec-fetch-site: same-origin' -d "$D")  body=$(head -c 80 /tmp/e5.txt)"
echo
echo "=== requests the echo server actually received ==="
cat "$LOG"

pkill -f echo-headers.js 2>/dev/null; sleep 1
echo "=== restoring production server ==="
cd "$PROJECT" || exit 1
setsid nohup bash run-prod-keepalive.sh > /tmp/prod-keepalive.log 2>&1 < /dev/null &
for i in $(seq 1 30); do
  sleep 4
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/login 2>/dev/null)
  [ "$c" = "200" ] && { echo "server restored: 200"; exit 0; }
done
echo "RESTORE FAILED"; exit 1
