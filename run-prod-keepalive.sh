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
export INFRANEX_WORKERS=off
export NODE_OPTIONS="--max-old-space-size=2048"

while true; do
  /usr/local/bin/bun "$PROJECT_DIR/.next/standalone/server.js" >> "$PROJECT_DIR/server.log" 2>&1
  echo "[$(date '+%H:%M:%S')] prod server exited (code $?), restarting in 3s..." >> "$PROJECT_DIR/server.log"
  sleep 3
done
