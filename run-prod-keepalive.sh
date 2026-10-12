#!/bin/bash
# Resilient PRODUCTION server keepalive for infranex-bt.
# Runs the standalone build (much lighter than dev: no Turbopack, no
# per-route compiles) and restarts it if it dies.
# NOTE: runs with cwd=/ (NOT the project dir) — the sandbox reaper appears to
# target project-dir processes spawned across tool sessions.
PROJECT_DIR="/home/z/my-project"
cd /
export NODE_ENV=production
export DATABASE_URL="file:$PROJECT_DIR/db/custom.db"
export INFRANEX_REPO_ROOT="$PROJECT_DIR"
export INFRANEX_WORKERS=on
export NODE_OPTIONS="--max-old-space-size=2048"

# MEMORY-GUARD-3 (2026-09-29) — swap insurance: the 4GB sandbox kernel-OOM-
# killed next-server at 2.9 GB RSS. A 2GB swapfile gives the box headroom so
# a transient spike degrades to slowness instead of a kill. swapon usually
# requires privileges the sandbox denies — fail silently and clean up.
if ! swapon --show=NAME 2>/dev/null | grep -q .; then
  if [ ! -e "$PROJECT_DIR/.swapfile" ]; then
    (fallocate -l 2G "$PROJECT_DIR/.swapfile" 2>/dev/null \
      && chmod 600 "$PROJECT_DIR/.swapfile" \
      && mkswap "$PROJECT_DIR/.swapfile" >/dev/null 2>&1 \
      && swapon "$PROJECT_DIR/.swapfile" 2>/dev/null) || rm -f "$PROJECT_DIR/.swapfile"
  fi
fi

# MEMORY-GUARD-3 — RSS watchdog constants. If the server tree (bun parent +
# its next-server child) exceeds 1.8 GB we kill it OURSELVES so the loop
# below restarts it cleanly. The kernel OOM killer must never be the one to
# act: it freezes the whole sandbox and takes unrelated processes with it.
RSS_LIMIT_KB=1843200   # 1.8 GB in kB
WATCHDOG_POLL=15       # seconds between RSS samples

while true; do
  # --smol: Bun's low-memory GC mode — smaller heap growth, more aggressive
  # collection. Right-sized for the 4GB sandbox; negligible CPU cost.
  /usr/local/bin/bun --smol "$PROJECT_DIR/.next/standalone/server.js" >> "$PROJECT_DIR/server.log" 2>&1 &
  SERVER_PID=$!

  while kill -0 "$SERVER_PID" 2>/dev/null; do
    sleep "$WATCHDOG_POLL"
    TREE_RSS=$( (ps -o rss= -p "$SERVER_PID" 2>/dev/null; \
                 ps --ppid "$SERVER_PID" -o rss= 2>/dev/null) \
               | awk '{s+=$1} END{print s+0}')
    [ -z "$TREE_RSS" ] && TREE_RSS=0
    if [ "$TREE_RSS" -gt "$RSS_LIMIT_KB" ]; then
      echo "[$(date '+%H:%M:%S')] WATCHDOG: server tree RSS ${TREE_RSS}kB > ${RSS_LIMIT_KB}kB — killing for a clean restart (kernel OOM preempted)" >> "$PROJECT_DIR/server.log"
      kill -9 "$SERVER_PID" 2>/dev/null
      pkill -9 -f "next-server" 2>/dev/null
      break
    fi
  done

  wait "$SERVER_PID" 2>/dev/null
  echo "[$(date '+%H:%M:%S')] prod server exited (code $?), restarting in 3s..." >> "$PROJECT_DIR/server.log"
  sleep 3
done
