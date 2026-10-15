#!/usr/bin/env bash
# run-prod-keepalive.sh — production server with memory guards.
# Recreated after sandbox recycle (was lost with the wipe).
#   - bun --smol: low-memory GC mode
#   - INFRANEX_WORKERS=off: re-arms nothing on boot (RAM <6GB guard also enforces)
#   - RSS watchdog: clean self-restart if the server tree exceeds 1.8GB RSS
#     (kernel OOM-kill at 4GB preempted — watchdog dies first, cleaner)
# Usage: nohup bash scripts/run-prod-keepalive.sh >/dev/null 2>&1 &

set -u
cd /home/z/my-project

export NODE_ENV=production
export DATABASE_URL="file:/home/z/my-project/db/custom.db"
export INFRANEX_REPO_ROOT=/home/z/my-project
export INFRANEX_WORKERS=off

SERVER="bun .next/standalone/server.js"
RSS_LIMIT_KB=1800000   # 1.8GB
CHECK_INTERVAL=15

while true; do
  echo "[keepalive] starting server ($(date))"
  bun --smol .next/standalone/server.js 2>&1 | tee -a server.log &
  SERVER_PID=$!

  # Watchdog loop for this server generation
  while kill -0 "$SERVER_PID" 2>/dev/null; do
    sleep "$CHECK_INTERVAL"
    RSS=$(ps -o rss= -p "$SERVER_PID" 2>/dev/null | tr -d ' ')
    CHILD_RSS=$(pgrep -P "$SERVER_PID" -o 2>/dev/null | xargs -r ps -o rss= -p 2>/dev/null | awk '{s+=$1} END {print s+0}')
    TOTAL=$(( ${RSS:-0} + ${CHILD_RSS:-0} ))
    if [ "$TOTAL" -gt "$RSS_LIMIT_KB" ]; then
      echo "[keepalive] RSS ${TOTAL}KB > ${RSS_LIMIT_KB}KB — killing for clean restart ($(date))" >> server.log
      kill "$SERVER_PID" 2>/dev/null
      pkill -P "$SERVER_PID" 2>/dev/null
      sleep 2
      kill -9 "$SERVER_PID" 2>/dev/null
      break
    fi
  done

  echo "[keepalive] server exited — restarting in 3s ($(date))" >> server.log
  sleep 3
done
