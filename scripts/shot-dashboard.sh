#!/bin/bash
# Re-open dashboard, wait for Finney chain sync to finish, screenshot LIVE state.
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
[ "$CODE" = "200" ] || { echo "SERVER_DOWN"; exit 1; }
echo "SERVER_UP"

agent-browser set viewport 1440 900 >/dev/null 2>&1 || true
agent-browser open "$BASE/"
agent-browser wait --load networkidle >/dev/null 2>&1 || true
agent-browser wait 20000
echo "url: $(agent-browser get url)"

rm -f "$OUT/app-preview-login.png"
agent-browser screenshot "$OUT/app-preview-dashboard.png" && echo "dash shot ok"
agent-browser close >/dev/null 2>&1 || true
echo "DONE"
