#!/bin/bash
# Simple reaper-catcher: poll for package.json disappearance, dump processes at wipe moment
LOG=/home/z/my-project/scripts/forensic.log
: > "$LOG"
touch /home/z/my-project/.wipe_marker 2>/dev/null
rm -f /home/z/my-project/.wipe_marker
for i in $(seq 1 150); do
  TS=$(date '+%H:%M:%S.%N | cut -c1-12')
  TS=$(date '+%H:%M:%S')
  if [ -f /home/z/my-project/package.json ]; then
    echo "$TS present" >> "$LOG"
  else
    echo "$TS !!! PACKAGE.JSON GONE !!!" >> "$LOG"
    echo "=== PROCESS DUMP AT WIPE ===" >> "$LOG"
    ps auxf >> "$LOG" 2>&1
    echo "=== /proc scan for git/rsync ===" >> "$LOG"
    for p in /proc/[0-9]*/cmdline; do
      CMD=$(tr '\0' ' ' < "$p" 2>/dev/null)
      case "$CMD" in
        *git*|*rsync*|*clean*|*sync*|*watch*) echo "PID $p: $CMD" >> "$LOG" ;;
      esac
    done
    break
  fi
  sleep 1
done
echo "MONITOR DONE" >> "$LOG"
