#!/bin/bash
# Infranex hold-and-heal keeper
# Keeps the web app reachable for ~9 minutes per invocation.
# - Restarts the dev server only if it is down (no unconditional pkill).
# - Auto-restarts on mid-hold failures.
# - Includes the next-server RSS memory guard (preemptive restart > 2.2 GB).
# Prints: HOLD: open=<firstcode> close=<lastcode> restarts=<N>

cd /home/z/my-project
restarts=0

first=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://localhost:3000/login)

if [ "$first" != "200" ]; then
  pkill -f "next dev" 2>/dev/null
  pkill -f "bun run dev" 2>/dev/null
  sleep 1
  setsid bash -c "INFRANEX_WORKERS=off nohup bun run dev > server.log 2>&1" &
  restarts=$((restarts+1))
  for i in $(seq 1 20); do
    first=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://localhost:3000/login)
    [ "$first" = "200" ] && break
    sleep 3
  done
fi

# Memory guard: preemptive restart if next-server RSS > 2200000 KB
rss=$(ps aux | grep 'next-server' | grep -v grep | awk '{s=$6} END {print s+0}')
if [ "${rss:-0}" -gt 2200000 ] 2>/dev/null; then
  pkill -f "next dev" 2>/dev/null
  pkill -f "bun run dev" 2>/dev/null
  sleep 1
  setsid bash -c "INFRANEX_WORKERS=off nohup bun run dev > server.log 2>&1" &
  restarts=$((restarts+1))
  sleep 12
  first=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://localhost:3000/login)
fi

last=$first
END=$((SECONDS+510))
while [ $SECONDS -lt $END ]; do
  last=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/login)
  if [ "$last" != "200" ]; then
    pkill -f "bun run dev" 2>/dev/null
    sleep 1
    setsid bash -c "INFRANEX_WORKERS=off nohup bun run dev > server.log 2>&1" &
    restarts=$((restarts+1))
    sleep 12
  fi
  sleep 15
done

echo "HOLD: open=$first close=$last restarts=$restarts"
