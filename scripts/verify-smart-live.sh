#!/bin/bash
# Verify SMART Framework page live: revive server, login, API check, browser check.
set +e
cd /home/z/my-project
OUT=/home/z/my-project/scripts/e2e-out
mkdir -p "$OUT"

echo "=== 1. REVIVE SERVER (keeper standard) ==="
pkill -f "next dev" 2>/dev/null
pkill -f "bun run dev" 2>/dev/null
sleep 1
setsid bash -c "INFRANEX_WORKERS=off nohup bun run dev > server.log 2>&1" &

up=000
for i in $(seq 1 60); do
  up=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/login 2>/dev/null)
  if [ "$up" = "200" ]; then echo "server up after ${i} polls"; break; fi
  sleep 1
done
echo "login=$up"
if [ "$up" != "200" ]; then echo "SERVER FAILED TO START"; exit 1; fi

echo "=== 2. API LOGIN (admin) ==="
curl -si --max-time 20 -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"userId":"admin","code":"${INFRANEX_ADMIN_CODE:-}"}' -o "$OUT/login-headers.txt"
head -1 "$OUT/login-headers.txt"
COOKIE_LINE=$(grep -i '^set-cookie:' "$OUT/login-headers.txt" | head -1 | sed 's/^[Ss]et-[Cc]ookie: //' | sed 's/;.*//' | tr -d '\r')
echo "cookie pair: $COOKIE_LINE"
CNAME="${COOKIE_LINE%%=*}"
CVAL="${COOKIE_LINE#*=}"
if [ -z "$CNAME" ] || [ "$CNAME" = "$COOKIE_LINE" ]; then echo "NO COOKIE — auth failed"; exit 1; fi
AUTH="Cookie: $COOKIE_LINE"

echo "=== 3. SMART-GOALS API CHECK ==="
curl -s --max-time 20 http://localhost:3000/api/smart-goals -H "$AUTH" -o "$OUT/list.json" -w "api_http=%{http_code}\n"
bun -e "const j=await(Bun.file('$OUT/list.json').json()); console.log('goals=',j.goals?.length??('ERR '+JSON.stringify(j).slice(0,200)))" 2>/dev/null

echo "=== 4. SERVED BUNDLE CONTAINS NAV ENTRY? ==="
HTML=$(curl -s --max-time 20 http://localhost:3000/ -H "$AUTH")
CHUNKS=$(echo "$HTML" | grep -oE '/_next/static/chunks/[^"]+\.js' | sort -u | head -40)
echo "$HTML" > "$OUT/root.html"
FOUND=no
for c in $CHUNKS; do
  if curl -s --max-time 20 "http://localhost:3000$c" | grep -q "SMART Framework"; then
    echo "FOUND 'SMART Framework' in chunk: $c"
    FOUND=yes
    break
  fi
done
[ "$FOUND" = "no" ] && echo "NOT FOUND in first $(echo $CHUNKS | wc -w) chunks (may be lazy-loaded)"

echo "=== 5. BROWSER E2E ==="
agent-browser close 2>/dev/null
agent-browser set viewport 1440 900
agent-browser open http://localhost:3000/login --timeout 60000
agent-browser wait 3000
agent-browser cookies set "$CNAME" "$CVAL"
agent-browser open http://localhost:3000/ --timeout 60000
agent-browser wait 6000
agent-browser snapshot -i -c > "$OUT/live-sidebar.txt" 2>&1
echo "--- sidebar SMART entry ---"
grep -i "SMART Framework" "$OUT/live-sidebar.txt" || echo "!!! SIDEBAR MISSING SMART FRAMEWORK !!!"
agent-browser screenshot "$OUT/live-dashboard.png"

echo "--- open SMART Framework view ---"
agent-browser find text "SMART Framework" click
agent-browser wait 4000
agent-browser snapshot -i -c > "$OUT/live-smart.txt" 2>&1
head -25 "$OUT/live-smart.txt"
agent-browser screenshot "$OUT/live-smart.png"
echo "--- page errors ---"
agent-browser errors > "$OUT/live-errors.txt" 2>&1
head -10 "$OUT/live-errors.txt"
agent-browser close 2>/dev/null
echo "=== DONE ==="
