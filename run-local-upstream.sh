#!/usr/bin/env bash
# run-local-upstream.sh — local prod instance on :3000 in THIS netns.
#
# WHY: after a sandbox recycle, the platform's boot flow starts the app via
# `bun run dev` (run-prod-keepalive.sh) in the platform's service netns,
# which is NOT the netns Caddy lives in. Caddy (published-alias upstream)
# proxies to 127.0.0.1:3000 and finds nothing there -> published URL 502s.
# This script gives Caddy a live upstream in its own netns.
#
# Workers are OFF here: the invisible supervisor instance owns background
# jobs, so we avoid two worker pools racing on the same SQLite file.

SERVER="/home/z/my-project/.next/standalone/server.js"
LOG="/tmp/caddy-upstream.log"
RSS_LIMIT_KB=1228800   # 1.2GB — light instance, no workers

# keep the log bounded
[ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 20971520 ] && : > "$LOG"

export NODE_ENV=production
export DATABASE_URL="file:/home/z/my-project/db/custom.db"
export INFRANEX_REPO_ROOT="/home/z/my-project"
export INFRANEX_WORKERS=off
export INFRANEX_ALLOWED_ORIGINS="https://x1vjv8jfmfp0-d.space-z.ai,https://preview-chat-04b679f7-12fc-4962-9379-065a0c16b029.space-z.ai,http://127.0.0.1:3000,http://localhost:3000"
export NODE_OPTIONS="--max-old-space-size=1536"
export PORT=3000
export HOSTNAME=0.0.0.0

echo "[$(date '+%F %T')] local upstream starting (workers=off, rss-limit=${RSS_LIMIT_KB}KB)"

while true; do
  bun --smol "$SERVER" >>"$LOG" 2>&1 &
  child=$!
  while kill -0 "$child" 2>/dev/null; do
    sleep 15
    rss=$(ps -o rss= -p "$child" 2>/dev/null | tr -d ' ')
    if [ -n "$rss" ] && [ "$rss" -gt "$RSS_LIMIT_KB" ]; then
      echo "[$(date '+%F %T')] RSS ${rss}KB > limit, killing for clean restart" >>"$LOG"
      kill -9 "$child" 2>/dev/null
    fi
  done
  wait "$child" 2>/dev/null
  echo "[$(date '+%F %T')] upstream exited, restarting in 3s..." >>"$LOG"
  sleep 3
done
