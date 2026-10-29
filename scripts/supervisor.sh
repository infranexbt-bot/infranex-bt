#!/bin/bash
# Infranex in-container supervisor — POPOUT-1 reliability layer.
#
# Unlike the gateway cron holders (agentTurn scripts that may run in a
# different execution context), THIS loop lives inside the app container
# itself. It checks /login every 20 s and revives the dev server whenever it
# is down, forever. It never exits on its own, so turn boundaries, gateway
# timeouts and racing holders cannot orphan the app.
#
# Also keeps the RSS guard: preemptive restart when next-server RSS passes
# 2.2 GB (the kernel OOM-kills around 1.9-2.5 GB in this 4 GB container, so
# we restart BEFORE the killer arrives).
#
# Log: scripts/supervisor.log — one line per action, timestamped.

cd /home/z/my-project
LOG=/home/z/my-project/scripts/supervisor.log

log() { echo "[$(date '+%m-%d %H:%M:%S')] $*" >> "$LOG"; }

log "supervisor started (pid $$)"

while true; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://localhost:3000/login)

  if [ "$code" != "200" ]; then
    log "down (code=$code) — restarting dev server"
    pkill -f "next dev" 2>/dev/null
    pkill -f "bun run dev" 2>/dev/null
    sleep 1
    setsid bash -c "INFRANEX_WORKERS=off nohup bun run dev > /home/z/my-project/server.log 2>&1" &
    for i in $(seq 1 20); do
      sleep 3
      code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://localhost:3000/login)
      [ "$code" = "200" ] && break
    done
    log "revived (code=$code)"
  else
    # Healthy — enforce the memory guard.
    rss=$(ps aux | grep 'next-server' | grep -v grep | awk '{s=$6} END {print s+0}')
    if [ "${rss:-0}" -gt 2200000 ] 2>/dev/null; then
      log "RSS guard: next-server at ${rss} KB — preemptive restart"
      pkill -f "next dev" 2>/dev/null
      pkill -f "bun run dev" 2>/dev/null
      sleep 1
      setsid bash -c "INFRANEX_WORKERS=off nohup bun run dev > /home/z/my-project/server.log 2>&1" &
      sleep 15
      log "guard restart done"
    fi
  fi

  sleep 20
done
