#!/bin/bash
# Infranex BT — resilient server supervisor. SINGLE entrypoint for every boot path:
#   * platform recycle  → runs `bun run dev` (package.json "dev" → this script),
#     so a recycled sandbox boots PRODUCTION standalone automatically
#   * manual production → bash run-prod-keepalive.sh
# Server mode is re-evaluated on every (re)start:
#   * PROD: .next/standalone/server.js exists → standalone build (fast, light)
#   * DEV : no build yet (fresh checkout)   → next dev fallback so box still serves
# NOTE: runs with cwd=/ (NOT the project dir) — the sandbox reaper appears to
# target project-dir processes spawned across tool sessions. The platform's
# own recycle supervisor is unaffected by this.
PROJECT_DIR="/home/z/my-project"

# SINGLETON GUARD (2026-11-02, rev2) — COOPERATIVE lock. The platform may
# auto-run `bun run dev` while a tool-session instance is alive. With flock -n
# the loser EXITED — and if the reaper later killed the winner, nothing was
# left serving (observed twice). A BLOCKING flock makes the loser wait; when
# the winner dies the waiter takes over. On acquiring the lock, probe the
# port: if something already answers, a live supervisor owns it — stand down.
exec 9>/tmp/infranex-supervisor.lock
flock 9
if curl -s -m 3 -o /dev/null http://127.0.0.1:3000/ 2>/dev/null; then
  echo "[$(date '+%H:%M:%S')] another supervisor already serving :3000 — standing down" >> "$PROJECT_DIR/server.log"
  exit 0
fi

cd /
export DATABASE_URL="file:$PROJECT_DIR/db/custom.db"
export INFRANEX_REPO_ROOT="$PROJECT_DIR"
export INFRANEX_WORKERS=on
# AUDIT-SEC-4 companion — the space-z.ai preview proxy rewrites the Host header
# to an internal value, so Origin (public *.space-z.ai) never equals Host and
# the CSRF gate 403s every browser POST ("Cross-origin request rejected").
# NOTE: proxy.ts compares these entries against the bare hostname (no scheme),
# so list host names only, comma-separated.
export INFRANEX_ALLOWED_ORIGINS="https://x1vjv8jfmfp0-d.space-z.ai"
export INFRANEX_GATE_DEBUG=1
export NODE_OPTIONS="--max-old-space-size=2048"

# MEMORY-GUARD-3 (2026-09-29) — swap insurance: the 4GB sandbox kernel-OOM-
# killed next-server at 2.9 GB RSS. A 2GB swapfile gives the box headroom so
# a transient spike degrades to slowness instead of a kill. swapon usually
# requires privileges the sandbox denies — try ONCE per sandbox (marker in
# /tmp, which is fresh per sandbox), then never churn a 2GB fallocate again.
if [ ! -e /tmp/.swap-attempted ]; then
  touch /tmp/.swap-attempted
  if ! swapon --show=NAME 2>/dev/null | grep -q .; then
    if [ ! -e "$PROJECT_DIR/.swapfile" ]; then
      (fallocate -l 2G "$PROJECT_DIR/.swapfile" 2>/dev/null \
        && chmod 600 "$PROJECT_DIR/.swapfile" \
        && mkswap "$PROJECT_DIR/.swapfile" >/dev/null 2>&1 \
        && swapon "$PROJECT_DIR/.swapfile" 2>/dev/null) || rm -f "$PROJECT_DIR/.swapfile"
    fi
  fi
fi

# MEMORY-GUARD-3 — RSS watchdog constants. If the prod server tree (bun parent
# + its next-server child) exceeds 1.8 GB we kill it OURSELVES so the loop
# below restarts it cleanly. The kernel OOM killer must never be the one to
# act: it freezes the whole sandbox and takes unrelated processes with it.
# Dev fallback skips the watchdog: Turbopack legitimately spikes during
# compiles and a kill there would just churn.
# 2026-11-02: dmesg showed the kernel global-OOM kills the server at
# ~1.68 GB RSS — BELOW our old 1.8 GB limit, so the watchdog never fired and
# the kernel froze the whole sandbox (user-facing "sandbox is inactive").
# 1.4 GB gives the supervisor a comfortable margin to do a clean restart
# before the kernel ever gets involved.
RSS_LIMIT_KB=1433600   # 1.4 GB in kB
WATCHDOG_POLL=15       # seconds between RSS samples

while true; do
  # Re-evaluate mode each (re)start: a build finished while we were in dev
  # fallback is picked up on the next loop without touching this process.
  if [ -f "$PROJECT_DIR/.next/standalone/server.js" ]; then
    MODE=prod
    export NODE_ENV=production
  else
    MODE=dev
    export NODE_ENV=development
  fi

  if [ "$MODE" = prod ]; then
    # --smol: Bun's low-memory GC mode — smaller heap growth, more aggressive
    # collection. Right-sized for the 4GB sandbox; negligible CPU cost.
    /usr/local/bin/bun --smol "$PROJECT_DIR/.next/standalone/server.js" >> "$PROJECT_DIR/server.log" 2>&1 &
  else
    ( cd "$PROJECT_DIR" && exec /usr/local/bin/bun run dev:next ) >> "$PROJECT_DIR/dev.log" 2>&1 &
  fi
  SERVER_PID=$!

  while kill -0 "$SERVER_PID" 2>/dev/null; do
    sleep "$WATCHDOG_POLL"
    if [ "$MODE" = prod ]; then
      TREE_RSS=$( (ps -o rss= -p "$SERVER_PID" 2>/dev/null; \
                   ps --ppid "$SERVER_PID" -o rss= 2>/dev/null) \
                 | awk '{s+=$1} END{print s+0}')
      [ -z "$TREE_RSS" ] && TREE_RSS=0
      # RSS ramp telemetry — log once we cross 800MB so the slope that leads
      # to a spike is visible in server.log without spamming every poll.
      if [ "$TREE_RSS" -gt 819200 ]; then
        echo "[$(date '+%H:%M:%S')] RSS ${TREE_RSS}kB / ${RSS_LIMIT_KB}kB" >> "$PROJECT_DIR/server.log"
      fi
      if [ "$TREE_RSS" -gt "$RSS_LIMIT_KB" ]; then
        echo "[$(date '+%H:%M:%S')] WATCHDOG: server tree RSS ${TREE_RSS}kB > ${RSS_LIMIT_KB}kB — killing for a clean restart (kernel OOM preempted)" >> "$PROJECT_DIR/server.log"
        kill -9 "$SERVER_PID" 2>/dev/null
        pkill -9 -f "next-server" 2>/dev/null
        break
      fi
    fi
  done

  wait "$SERVER_PID" 2>/dev/null
  echo "[$(date '+%H:%M:%S')] $MODE server exited (code $?), restarting in 3s..." >> "$PROJECT_DIR/server.log"
  sleep 3
done
