#!/bin/bash
# PROFIT-RANK visual pass — boots server + captures the panel itself
# (scrolled into view), expanded rows and the All-toggle state.
set -u
cd /home/z/my-project
say() { echo "[visual] $*"; }

if ! curl -s -o /dev/null --max-time 3 http://localhost:3000; then
  nohup setsid bash -c 'export DATABASE_URL=file:/home/z/my-project/db/custom.db NODE_OPTIONS="--max-old-space-size=1024"; exec node node_modules/.bin/next dev -p 3000 >> dev.log 2>&1' < /dev/null > /dev/null 2>&1 &
  for i in $(seq 1 36); do
    sleep 5
    c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://localhost:3000 2>/dev/null)
    { [ "$c" = "307" ] || [ "$c" = "200" ]; } && break
  done
fi
say "server status: $(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://localhost:3000)"

agent-browser open http://localhost:3000 > /dev/null 2>&1
sleep 6
agent-browser snapshot > /tmp/pv-snap.txt 2>&1
if grep -q "Operator sign-in" /tmp/pv-snap.txt; then
  UR=$(grep -oE 'textbox "User ID"[^,]*, ref=(e[0-9]+)' /tmp/pv-snap.txt | grep -oE 'e[0-9]+' | head -1)
  PR=$(grep -oE 'textbox "Access code"[^,]*, ref=(e[0-9]+)' /tmp/pv-snap.txt | grep -oE 'e[0-9]+' | head -1)
  BR=$(grep -oE 'button "Sign in" \[ref=(e[0-9]+)\]' /tmp/pv-snap.txt | grep -oE 'e[0-9]+' | head -1)
  agent-browser fill "@$UR" 'admin' > /dev/null
  agent-browser fill "@$PR" 'BRJ2-W2GT-WJNF-97VC' > /dev/null
  agent-browser click "@$BR" > /dev/null
  sleep 6
  say "logged in"
fi
SR=$(grep -oE 'button "Subnets 03" \[ref=(e[0-9]+)\]' /tmp/pv-snap.txt | grep -oE 'e[0-9]+' | head -1)
[ -n "$SR" ] && agent-browser click "@$SR" > /dev/null
sleep 10

# Scroll the Profit Rank panel into view
agent-browser eval '
(() => {
  const el = [...document.querySelectorAll("p")].find(p => p.innerText.trim().toUpperCase() === "PROFIT RANK");
  if (!el) return "panel not found";
  el.scrollIntoView({ block: "start" });
  window.scrollBy(0, -80);
  return "scrolled to panel";
})()' > /tmp/pv-scroll.txt 2>&1
say "$(cat /tmp/pv-scroll.txt)"
sleep 1
agent-browser screenshot /home/z/my-project/tool-results/profit-rank-visual-1.png && say "shot 1 ok"

# Expand all rows
agent-browser eval '
(() => {
  const b = [...document.querySelectorAll("button")].find(x => x.innerText.includes("Show all"));
  if (b) { b.click(); return "expanded: " + b.innerText.trim(); }
  return "no expand button (<=10 rows)";
})()' > /tmp/pv-expand.txt 2>&1
say "$(cat /tmp/pv-expand.txt)"
sleep 1

# Row count under GPU-only + expand
agent-browser eval 'JSON.stringify({rows: document.querySelectorAll("table tbody tr").length})' > /tmp/pv-count.txt 2>&1
say "rows (GPU only, expanded): $(cat /tmp/pv-count.txt)"
agent-browser screenshot /home/z/my-project/tool-results/profit-rank-visual-2.png && say "shot 2 ok"

# Toggle to All (panel's own toggle = the button whose text starts with "All " inside the panel card)
agent-browser eval '
(() => {
  const p = [...document.querySelectorAll("p")].find(x => x.innerText.trim().toUpperCase() === "PROFIT RANK");
  const card = p ? p.closest("div.rounded-xl, div[class*=card], .card") : null;
  const root = card ? card.parentElement : document;
  const b = [...root.querySelectorAll("button")].find(x => /^All \d+$/.test(x.innerText.trim()));
  if (b) { b.click(); return "All toggle clicked: " + b.innerText.trim(); }
  return "panel All toggle not found";
})()' > /tmp/pv-all.txt 2>&1
say "$(cat /tmp/pv-all.txt)"
sleep 1
agent-browser eval 'JSON.stringify({rows: document.querySelectorAll("table tbody tr").length})' > /tmp/pv-count2.txt 2>&1
say "rows (All): $(cat /tmp/pv-count2.txt)"

# GPU-only state count for contrast
agent-browser screenshot /home/z/my-project/tool-results/profit-rank-visual-3.png && say "shot 3 ok"

# Sanity: verdict distribution across all rows
agent-browser eval '
(() => {
  const chips = [...document.querySelectorAll("table tbody td:last-child span")].map(s => s.innerText.trim());
  return JSON.stringify({
    total: chips.length,
    profitable: chips.filter(v => v.includes("Profitable")).length,
    marginal: chips.filter(v => v.includes("Marginal")).length,
    below: chips.filter(v => v.includes("Below")).length
  });
})()' > /tmp/pv-verdicts.txt 2>&1
say "verdicts: $(cat /tmp/pv-verdicts.txt)"
say "VISUAL PASS COMPLETE"
