#!/bin/bash
# Full flow in ONE call: health -> login -> wait for Finney sync -> screenshot dashboard.
set -u
OUT=/home/z/my-project/download
BASE=http://127.0.0.1:3000

CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/login" || true)
if [ "$CODE" != "200" ]; then
  cd /home/z/my-project || exit 1
  setsid nohup bash run-prod-keepalive.sh > /tmp/prod-keepalive.log 2>&1 < /dev/null &
  for i in $(seq 1 40); do
    sleep 3
    CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/login" || true)
    [ "$CODE" = "200" ] && break
  done
fi
[ "$CODE" = "200" ] || { echo "SERVER_DOWN"; tail -30 /tmp/prod-keepalive.log 2>/dev/null; exit 1; }
echo "SERVER_UP"

agent-browser set viewport 1440 900 >/dev/null 2>&1 || true
agent-browser open "$BASE/login"
agent-browser wait --load networkidle >/dev/null 2>&1 || true
agent-browser wait 2500
echo "url now: $(agent-browser get url)"

SNAP=$(agent-browser snapshot -i)
ref_id() { printf '%s' "$1" | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/^ref=/@/'; }
REF_USER=$(ref_id "$(printf '%s' "$SNAP" | grep -i 'User ID')")
REF_CODE=$(ref_id "$(printf '%s' "$SNAP" | grep -i 'Access code')")
REF_SIGN=$(ref_id "$(printf '%s' "$SNAP" | grep -iE 'button "Sign in"')")
echo "refs: user=$REF_USER code=$REF_CODE sign=$REF_SIGN"

if [ -n "$REF_USER" ] && [ -n "$REF_CODE" ] && [ -n "$REF_SIGN" ]; then
  ADMIN=$(grep -oE '[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}' /home/z/my-project/MEMORY.md 2>/dev/null | head -1)
  [ -z "$ADMIN" ] && ADMIN='BRJ2-W2GT-WJNF-97VC'
  agent-browser fill "$REF_USER" "admin"
  agent-browser fill "$REF_CODE" "$ADMIN"
  agent-browser click "$REF_SIGN"
  agent-browser wait 5000
  agent-browser wait --load networkidle >/dev/null 2>&1 || true
  echo "url after login: $(agent-browser get url)"
else
  echo "NO_LOGIN_FORM (maybe already in)"
fi

# Wait for Finney chain sync + live data
agent-browser wait 22000
agent-browser screenshot "$OUT/app-preview-dashboard.png" && echo "dash shot ok"
agent-browser close >/dev/null 2>&1 || true
echo "DONE"
