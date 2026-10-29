#!/bin/bash
# POPOUT-2 verification — content-only popout + full-app round trip.
# One long call: server (re)start → browser retries → DOM assertions →
# screenshots → "Open full app" round trip. Rides through server flaps
# caused by the parallel session's restart cycles.

cd /home/z/my-project
B="agent-browser"
POP_URL="http://localhost:3000/?view=opportunities&mode=full"

say() { echo "== $*"; }

# --- 1. ensure server up ---
code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login --max-time 5)
if [ "$code" != "200" ]; then
  say "server down ($code) — starting"
  setsid bash -c "INFRANEX_WORKERS=off nohup bun run dev > server.log 2>&1" &
  for i in $(seq 1 20); do
    sleep 4
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login --max-time 5)
    [ "$code" = "200" ] && break
  done
fi
say "server=$code"

# --- 2. land the browser on the popout URL (retry through flaps) ---
landed=0
for attempt in 1 2 3 4 5; do
  pre=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login --max-time 5)
  [ "$pre" != "200" ] && { sleep 8; continue; }
  $B open "$POP_URL" >/dev/null 2>&1
  sleep 3
  url=$($B get url 2>/dev/null)
  case "$url" in
    *view=opportunities*) landed=1; say "landed on attempt $attempt"; break;;
  esac
  sleep 6
done
[ "$landed" = "1" ] || { say "FAIL: never landed on popout URL"; exit 1; }

# --- 3. wait for the client-side standalone swap, then assert ---
$B wait --load networkidle --timeout 120000 >/dev/null 2>&1
$B wait --fn "!document.querySelector('.sidebar-link')" --timeout 60000 >/dev/null 2>&1
sleep 1
sb=$($B get count '.sidebar-link')
nav=$($B get count 'nav')
fab=$($B get count 'a[aria-label*="full dashboard"]')
say "POPOUT: sidebar-links=$sb nav=$nav full-app-btn=$fab (expect 0 0 1)"
$B screenshot /home/z/my-project/download/popout-content-only.png >/dev/null 2>&1
say "screenshot: popout-content-only.png"

# --- 4. round trip: Open full app → full dashboard ---
$B eval "document.querySelector('a[aria-label=\"Open the full dashboard with all menus\"]').click()" >/dev/null 2>&1
ok=0
for i in $(seq 1 15); do
  sleep 3
  n=$($B get count '.sidebar-link' 2>/dev/null)
  [ "${n:-0}" -gt 10 ] && { ok=1; break; }
done
sb2=$($B get count '.sidebar-link')
pb=$($B get count 'button[title*="new window"]')
url2=$($B get url 2>/dev/null)
say "FULLAPP(ok=$ok): url=$url2 sidebar-links=$sb2 popout-buttons=$pb (expect 21/21)"
$B screenshot /home/z/my-project/download/full-dashboard.png >/dev/null 2>&1
say "screenshot: full-dashboard.png"

# --- 5. console errors on current page ---
errs=$($B errors 2>/dev/null | grep -c "Error" || true)
say "console-errors=$errs"
say "DONE"
