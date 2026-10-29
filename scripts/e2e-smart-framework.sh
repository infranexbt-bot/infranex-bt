#!/bin/bash
# One-shot: revive dev server + E2E test SMART Framework (browser + API CRUD).
# Everything happens inside ONE tool call — the spawned server dies when this exits.
set +e
cd /home/z/my-project
OUT=/home/z/my-project/scripts/e2e-out
mkdir -p "$OUT"

echo "=== 1. REVIVE SERVER (keeper standard command) ==="
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
if [ "$up" != "200" ]; then echo "SERVER FAILED TO START — aborting"; exit 1; fi

echo "=== 2. API LOGIN (capture session cookie) ==="
curl -si --max-time 20 -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"userId":"admin","code":"BRJ2-W2GT-WJNF-97VC"}' -o "$OUT/login-headers.txt"
head -1 "$OUT/login-headers.txt"
COOKIE_LINE=$(grep -i '^set-cookie:' "$OUT/login-headers.txt" | head -1 | sed 's/^[Ss]et-[Cc]ookie: //' | sed 's/;.*//' | tr -d '\r')
echo "cookie pair: $COOKIE_LINE"
CNAME="${COOKIE_LINE%%=*}"
CVAL="${COOKIE_LINE#*=}"
if [ -z "$CNAME" ] || [ "$CNAME" = "$COOKIE_LINE" ]; then echo "NO COOKIE — auth failed"; cat "$OUT/login-headers.txt" | head -20; exit 1; fi

echo "=== 3. API CRUD E2E on /api/smart-goals ==="
AUTH="Cookie: $COOKIE_LINE"
echo "--- POST create ---"
curl -s --max-time 20 -X POST http://localhost:3000/api/smart-goals \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"title":"E2E keeper test goal","specific":"Prove CRUD works","metric":"API roundtrip","target":"1 roundtrip","current":"0","achievable":"Yes — local test","confidence":5,"relevant":"Server liveness proof","deadline":"2026-11-15","milestones":"[{\"text\":\"create\",\"done\":true},{\"text\":\"update\",\"done\":false}]"}' \
  -o "$OUT/post.json" -w "http=%{http_code}\n"
GID=$(bun -e "const j=await(Bun.file('$OUT/post.json').json()); console.log(j.goal?.id||'')" 2>/dev/null)
echo "created id=$GID"
echo "--- GET list ---"
curl -s --max-time 20 http://localhost:3000/api/smart-goals -H "$AUTH" -o "$OUT/list.json" -w "http=%{http_code}\n"
bun -e "const j=await(Bun.file('$OUT/list.json').json()); console.log('count=',j.goals?.length, 'first=',j.goals?.[0]?.title)" 2>/dev/null
echo "--- PATCH status ---"
curl -s --max-time 20 -X PATCH "http://localhost:3000/api/smart-goals?id=$GID" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"status":"active","current":"1"}' -o "$OUT/patch.json" -w "http=%{http_code}\n"
bun -e "const j=await(Bun.file('$OUT/patch.json').json()); console.log('status=',j.goal?.status,'current=',j.goal?.current)" 2>/dev/null
echo "--- DELETE ---"
curl -s --max-time 20 -X DELETE "http://localhost:3000/api/smart-goals?id=$GID" -H "$AUTH" -o "$OUT/del.json" -w "http=%{http_code}\n"
cat "$OUT/del.json"; echo
echo "--- GET after delete (count should drop) ---"
curl -s --max-time 20 http://localhost:3000/api/smart-goals -H "$AUTH" -o "$OUT/list2.json" -w "http=%{http_code}\n"
bun -e "const j=await(Bun.file('$OUT/list2.json').json()); console.log('count after delete=',j.goals?.length)" 2>/dev/null

echo "=== 4. BROWSER E2E ==="
agent-browser close 2>/dev/null
agent-browser set viewport 1440 900
agent-browser open http://localhost:3000/login --timeout 60000
agent-browser wait 3000
agent-browser cookies set "$CNAME" "$CVAL"
agent-browser open http://localhost:3000/ --timeout 60000
agent-browser wait 6000
echo "--- snapshot after login ---"
agent-browser snapshot -i -c > "$OUT/after-login.txt" 2>&1
grep -iE "SMART Framework|Dashboard|Intelligence" "$OUT/after-login.txt" | head -8
agent-browser screenshot "$OUT/after-login.png"

echo "--- click SMART Framework ---"
agent-browser find text "SMART Framework" click
agent-browser wait 4000
agent-browser snapshot -i -c > "$OUT/smart-view.txt" 2>&1
echo "--- SMART view snapshot (first 40 lines) ---"
head -40 "$OUT/smart-view.txt"
agent-browser screenshot "$OUT/smart-view.png"
echo "--- page errors ---"
agent-browser errors > "$OUT/errors.txt" 2>&1
head -10 "$OUT/errors.txt"
agent-browser close 2>/dev/null

echo "=== 5. DONE — server will die when this call ends ==="
