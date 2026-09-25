#!/bin/bash
# PROFIT-RANK panel close-up — scroll the actual scroll container, shoot fast.
set -u
cd /home/z/my-project
say() { echo "[closeup] $*"; }

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
agent-browser snapshot > /tmp/pc-snap.txt 2>&1
if grep -q "Operator sign-in" /tmp/pc-snap.txt; then
  UR=$(grep -oE 'textbox "User ID"[^,]*, ref=(e[0-9]+)' /tmp/pc-snap.txt | grep -oE 'e[0-9]+' | head -1)
  PR=$(grep -oE 'textbox "Access code"[^,]*, ref=(e[0-9]+)' /tmp/pc-snap.txt | grep -oE 'e[0-9]+' | head -1)
  BR=$(grep -oE 'button "Sign in" \[ref=(e[0-9]+)\]' /tmp/pc-snap.txt | grep -oE 'e[0-9]+' | head -1)
  agent-browser fill "@$UR" 'admin' > /dev/null
  agent-browser fill "@$PR" 'BRJ2-W2GT-WJNF-97VC' > /dev/null
  agent-browser click "@$BR" > /dev/null
  sleep 6
fi
SR=$(grep -oE 'button "Subnets 03" \[ref=(e[0-9]+)\]' /tmp/pc-snap.txt | grep -oE 'e[0-9]+' | head -1)
[ -n "$SR" ] && agent-browser click "@$SR" > /dev/null
sleep 10

# Diagnose which element scrolls, then scroll it so the panel is at top
agent-browser eval '
(() => {
  const el = [...document.querySelectorAll("p")].find(p => p.innerText.trim().toUpperCase() === "PROFIT RANK");
  if (!el) return "panel not found";
  const target = el.getBoundingClientRect().top + window.scrollY - 90;
  const scrollers = [];
  let n = el.parentElement;
  while (n && n !== document.body) {
    if (n.scrollHeight > n.clientHeight + 50) scrollers.push(n);
    n = n.parentElement;
  }
  if (scrollers.length) {
    const s = scrollers[scrollers.length - 1];
    s.scrollTop = target;
    return "scrolled container (scrollH " + s.scrollHeight + ")";
  }
  window.scrollTo(0, target);
  return "scrolled window to " + Math.round(target);
})()' > /tmp/pc-scroll.txt 2>&1
say "$(cat /tmp/pc-scroll.txt)"
sleep 0.4
agent-browser screenshot /home/z/my-project/tool-results/profit-rank-closeup-1.png && say "shot 1 ok"

# Expand + shoot again (scroll may shift after expand)
agent-browser eval '
(() => {
  const b = [...document.querySelectorAll("button")].find(x => x.innerText.includes("Show all"));
  if (b) { b.click(); return "expanded " + b.innerText.trim(); }
  return "already expanded";
})()' > /tmp/pc-expand.txt 2>&1
say "$(cat /tmp/pc-expand.txt)"
sleep 0.6
agent-browser screenshot /home/z/my-project/tool-results/profit-rank-closeup-2.png && say "shot 2 ok"

# Sort by Rig rent and re-scroll + shoot (shows the cost-dominant rows)
agent-browser eval '
(() => {
  const p = [...document.querySelectorAll("p")].find(x => x.innerText.trim().toUpperCase() === "PROFIT RANK");
  if (!p) return "panel gone";
  const card = p.closest("div");
  const root = card && card.parentElement ? card.parentElement : document;
  const b = [...root.querySelectorAll("button")].find(x => x.innerText.trim() === "Rig rent");
  if (b) b.click();
  const el = p;
  const target = el.getBoundingClientRect().top + window.scrollY - 90;
  let n = el.parentElement; const scrollers = [];
  while (n && n !== document.body) { if (n.scrollHeight > n.clientHeight + 50) scrollers.push(n); n = n.parentElement; }
  if (scrollers.length) scrollers[scrollers.length - 1].scrollTop = target; else window.scrollTo(0, target);
  return "sorted by rent + rescrolled";
})()' > /tmp/pc-rent.txt 2>&1
say "$(cat /tmp/pc-rent.txt)"
sleep 0.6
agent-browser screenshot /home/z/my-project/tool-results/profit-rank-closeup-3.png && say "shot 3 ok"
say "CLOSEUP PASS COMPLETE"
