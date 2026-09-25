#!/bin/bash
# subnet-ui-1 — E2E verify: "What miners do here" card in the requirements dialog.
# Checks 3 variants: readme-backed (Chutes 64), research (Affine 120), parked (for-sale 112).
set -u
cd /home/z/my-project
say() { echo "[jobs-card] $*"; }
mkdir -p tool-results

if ! curl -s -o /dev/null --max-time 3 http://localhost:3000; then
  nohup setsid bash -c 'export DATABASE_URL=file:/home/z/my-project/db/custom.db NODE_OPTIONS="--max-old-space-size=1024"; exec node node_modules/.bin/next dev -p 3000 >> dev.log 2>&1' < /dev/null > /dev/null 2>&1 &
  for i in $(seq 1 36); do
    sleep 5
    c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://localhost:3000 2>/dev/null)
    { [ "$c" = "307" ] || [ "$c" = "200" ]; } && break
  done
fi
say "server: $(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://localhost:3000)"

agent-browser open http://localhost:3000 > /dev/null 2>&1
sleep 6
agent-browser snapshot > /tmp/jc-snap.txt 2>&1
if grep -q "Operator sign-in" /tmp/jc-snap.txt; then
  UR=$(grep -oE 'textbox "User ID"[^,]*, ref=(e[0-9]+)' /tmp/jc-snap.txt | grep -oE 'e[0-9]+' | head -1)
  PR=$(grep -oE 'textbox "Access code"[^,]*, ref=(e[0-9]+)' /tmp/jc-snap.txt | grep -oE 'e[0-9]+' | head -1)
  BR=$(grep -oE 'button "Sign in" \[ref=(e[0-9]+)\]' /tmp/jc-snap.txt | grep -oE 'e[0-9]+' | head -1)
  agent-browser fill "@$UR" 'admin' > /dev/null
  agent-browser fill "@$PR" 'BRJ2-W2GT-WJNF-97VC' > /dev/null
  agent-browser click "@$BR" > /dev/null
  sleep 6
  agent-browser snapshot > /tmp/jc-snap.txt 2>&1
fi

SR=$(grep -oE 'button "Subnets 03" \[ref=(e[0-9]+)\]' /tmp/jc-snap.txt | grep -oE 'e[0-9]+' | head -1)
[ -n "$SR" ] && agent-browser click "@$SR" > /dev/null
sleep 9

check_case () {
  local label="$1" search="$2" expect="$3" shot="$4"
  say "case: $label (search '$search')"
  # find the search box and type
  agent-browser snapshot > /tmp/jc-snap.txt 2>&1
  SB=$(grep -oE 'textbox "Search subnets"[^,]*, ref=(e[0-9]+)' /tmp/jc-snap.txt | grep -oE 'e[0-9]+' | head -1)
  if [ -z "$SB" ]; then
    SB=$(grep -oE 'textbox "[^"]*Search[^"]*"[^,]*, ref=(e[0-9]+)' /tmp/jc-snap.txt | grep -oE 'e[0-9]+' | head -1)
  fi
  agent-browser fill "@$SB" "$search" > /dev/null
  sleep 3
  # click the first Requirements button visible
  RB=$(grep -oE 'button "Requirements" \[ref=(e[0-9]+)\]' /tmp/jc-snap.txt | grep -oE 'e[0-9]+' | head -1)
  if [ -z "$RB" ]; then
    # snapshot is stale after fill; re-snapshot and find a Requirements button
    agent-browser snapshot > /tmp/jc-snap.txt 2>&1
    RB=$(grep -oE 'button "Requirements" \[ref=(e[0-9]+)\]' /tmp/jc-snap.txt | grep -oE 'e[0-9]+' | head -1)
  fi
  if [ -z "$RB" ]; then say "  FAIL: no Requirements button found"; agent-browser screenshot "tool-results/$shot-fail.png" > /dev/null 2>&1; return 1; fi
  # buttons list is from old snapshot; re-snapshot right before click
  agent-browser snapshot > /tmp/jc-snap.txt 2>&1
  RB=$(grep -oE 'button "Requirements" \[ref=(e[0-9]+)\]' /tmp/jc-snap.txt | grep -oE 'e[0-9]+' | head -1)
  agent-browser click "@$RB" > /dev/null
  sleep 4
  agent-browser snapshot > /tmp/jc-dialog.txt 2>&1
  if grep -qi "What miners do here" /tmp/jc-dialog.txt; then
    say "  card present"
    if grep -qi "$expect" /tmp/jc-dialog.txt; then
      say "  PASS: expected content '$expect' found"
    else
      say "  WARN: '$expect' not in dialog snapshot"
    fi
  else
    say "  FAIL: card missing in dialog"
  fi
  # scroll the card into view inside the dialog scroll container, then shoot
  agent-browser eval '
    (() => {
      const h = [...document.querySelectorAll("p,span")].find(x => x.textContent.trim() === "What miners do here");
      if (!h) return "not found";
      h.scrollIntoView({ block: "start" });
      const sc = h.closest("[data-radix-dialog-content]") || h.closest(".overflow-y-auto");
      if (sc) sc.scrollTop = Math.max(0, sc.scrollTop - 8);
      return "ok";
    })()
  ' > /dev/null 2>&1
  sleep 1
  agent-browser screenshot "tool-results/$shot.png" > /dev/null 2>&1
  say "  shot: tool-results/$shot.png"
  # close dialog (Escape) and clear search for next case
  agent-browser press Escape > /dev/null 2>&1
  sleep 1
  agent-browser press Escape > /dev/null 2>&1
  sleep 1
  agent-browser fill "@$SB" "" > /dev/null 2>&1
  sleep 2
}

check_case "readme-backed" "Chutes" "control-plane" "jobs-card-chutes"
check_case "research" "Affine" "reasoning" "jobs-card-affine"
check_case "parked" "for sale" "parked" "jobs-card-forsale"

say "done"
