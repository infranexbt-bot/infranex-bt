#!/bin/bash
# Resilient dev-server keepalive for infranex-bt.
# Restarts the Next.js dev server automatically if it dies (OOM, signals, etc.)
PROJECT_DIR="/home/z/my-project"
cd "$PROJECT_DIR"
export DATABASE_URL="file:$PROJECT_DIR/db/custom.db"
# OOM-GUARD — 4GB sandbox with no swap: the boot-time chain sweep pushed
# next-server to ~2.9GB RSS and the kernel OOM-killer reaped it (causes
# "sandbox is inactive" on the preview). Workers off = lean boot; /api/network
# still serves the stale-while-revalidate snapshot on demand.
export INFRANEX_WORKERS="${INFRANEX_WORKERS:-off}"

while true; do
  bun run dev >> dev.log 2>&1
  echo "[$(date '+%H:%M:%S')] dev server exited (code $?), restarting in 3s..." >> dev.log
  sleep 3
done
