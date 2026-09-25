#!/bin/bash
# PROFIT-RANK E2E — boots the dev server (heap-capped to dodge the 4GB-box
# OOM killer) and verifies the Profit Rank panel end-to-end in ONE call,
# because background processes are reaped at tool-call boundaries.
set -u
cd /home/z/my-project

say() { echo "[verify] $*"; }

# --- 1. Boot server ----------------------------------------------------------
if curl -s -o /dev/null --max-time 3 http://localhost:3000; then
  say "server already up"
else
  say "starting dev server (heap-capped)…"
  nohup setsid bash -c 'export DATABASE_URL=file:/home/z/my-project/db/custom.db NODE_OPTIONS="--max-old-space-size=1024"; exec node node_modules/.bin/next dev -p 3000 >> dev.log 2>&1' < /dev/null > /dev/null 2>&1 &
fi

ok=""
for i in $(seq 1 36); do
  sleep 5
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://localhost:3000 2>/dev/null)
  if [ "$c" = "307" ] || [ "$c" = "200" ]; then ok="$c"; break; fi
  [ $((i % 6)) = 0 ] && say "waiting for server… ($i)"
done
if [ -z "$ok" ]; then say "FAIL: server never came up"; tail -5 dev.log; exit 1; fi
say "server up ($ok)"

# --- 2. Browser login --------------------------------------------------------
agent-browser open http://localhost:3000 > /dev/null 2>&1
sleep 6
agent-browser snapshot > /tmp/pr-snap.txt 2>&1
if grep -q "Operator sign-in" /tmp/pr-snap.txt; then
  say "logging in…"
  UR=$(grep -oE 'textbox "User ID"[^,]*, ref=(e[0-9]+)' /tmp/pr-snap.txt | grep -oE 'e[0-9]+' | head -1)
  PR=$(grep -oE 'textbox "Access code"[^,]*, ref=(e[0-9]+)' /tmp/pr-snap.txt | grep -oE 'e[0-9]+' | head -1)
  BR=$(grep -oE 'button "Sign in" \[ref=(e[0-9]+)\]' /tmp/pr-snap.txt | grep -oE 'e[0-9]+' | head -1)
  agent-browser fill "@$UR" 'admin' > /dev/null
  agent-browser fill "@$PR" 'BRJ2-W2GT-WJNF-97VC' > /dev/null
  agent-browser click "@$BR" > /dev/null
  sleep 6
  say "logged in"
else
  say "already authenticated"
fi

# --- 3. Navigate to Subnets --------------------------------------------------
agent-browser snapshot > /tmp/pr-snap2.txt 2>&1
SR=$(grep -oE 'button "Subnets 03" \[ref=(e[0-9]+)\]' /tmp/pr-snap2.txt | grep -oE 'e[0-9]+' | head -1)
if [ -n "$SR" ]; then
  agent-browser click "@$SR" > /dev/null
  say "navigating to Subnets…"
  sleep 12   # first compile of the view + chain data fetch
else
  say "Subnets button not found — maybe already on the view"
fi

# --- 4. Verify Profit Rank panel ----------------------------------------------
agent-browser eval 'document.body.innerText.includes("Profit rank") && document.body.innerText.includes("rental cost")' > /tmp/pr-has-panel.txt 2>&1
say "panel present: $(cat /tmp/pr-has-panel.txt)"

# Extract header summary + first 3 rows of the ranking table
agent-browser eval '
(() => {
  const t = document.body.innerText;
  const m = t.match(/Profit rank[\s\S]{0,200}/);
  return m ? m[0].replace(/\n+/g, " | ").slice(0, 220) : "NOT FOUND";
})()' > /tmp/pr-header.txt 2>&1
say "header: $(cat /tmp/pr-header.txt)"

agent-browser eval '
(() => {
  const rows = [...document.querySelectorAll("table tbody tr")];
  const panel = rows.length ? rows : [];
  return JSON.stringify(panel.slice(0, 3).map(tr => {
    const tds = [...tr.querySelectorAll("td")].map(td => td.innerText.replace(/\n+/g, "/").trim());
    return tds.slice(0, 8).join(" · ");
  }), null, 1);
})()' > /tmp/pr-rows.txt 2>&1
say "top rows:"; cat /tmp/pr-rows.txt

# Row count + verdict chips
agent-browser eval '
(() => {
  const rows = [...document.querySelectorAll("table tbody tr")];
  const verd = [...document.querySelectorAll("table tbody td:last-child span")].map(s => s.innerText);
  return JSON.stringify({ rows: rows.length,
    profitable: verd.filter(v => v.includes("Profitable")).length,
    avoid: verd.filter(v => v.includes("Below")).length });
})()' > /tmp/pr-stats.txt 2>&1
say "stats: $(cat /tmp/pr-stats.txt)"

agent-browser screenshot /home/z/my-project/tool-results/profit-rank-panel.png && say "screenshot 1 saved"

# --- 5. Exercise controls: sort by Rig rent, then All toggle ------------------
agent-browser eval '
(() => {
  const btns = [...document.querySelectorAll("button")];
  const rent = btns.find(b => b.innerText.trim() === "Rig rent");
  if (rent) { rent.click(); return "clicked Rig rent sort"; }
  return "sort button not found";
})()' > /tmp/pr-sort.txt 2>&1
sleep 1
say "$(cat /tmp/pr-sort.txt)"
agent-browser eval '
(() => {
  const rows = [...document.querySelectorAll("table tbody tr")];
  const first = rows[0];
  return first ? first.innerText.replace(/\n+/g, " | ").slice(0, 160) : "no rows";
})()' > /tmp/pr-first-rent.txt 2>&1
say "top by rent: $(cat /tmp/pr-first-rent.txt)"

agent-browser eval '
(() => {
  const btns = [...document.querySelectorAll("button")];
  const all = btns.find(b => b.innerText.trim().startsWith("All"));
  if (all) { all.click(); return "clicked All toggle"; }
  return "All toggle not found";
})()' > /tmp/pr-all.txt 2>&1
sleep 1
say "$(cat /tmp/pr-all.txt)"
agent-browser eval '
(() => {
  const rows = [...document.querySelectorAll("table tbody tr")];
  return "rows with All filter: " + rows.length;
})()' > /tmp/pr-allcount.txt 2>&1
say "$(cat /tmp/pr-allcount.txt)"

agent-browser screenshot /home/z/my-project/tool-results/profit-rank-all-toggle.png && say "screenshot 2 saved"

# --- 6. Row click opens requirements dialog ------------------------------------
agent-browser eval '
(() => {
  const rows = [...document.querySelectorAll("table tbody tr")];
  if (!rows.length) return "no rows";
  const b = rows[0].querySelector("td:nth-child(2) button");
  if (!b) return "row button not found";
  b.click();
  return "clicked row subnet: " + b.innerText.split("\n")[0];
})()' > /tmp/pr-rowclick.txt 2>&1
sleep 3
say "$(cat /tmp/pr-rowclick.txt)"
agent-browser eval 'document.body.innerText.includes("Mining Requirements") ? "requirements dialog OPEN" : "dialog NOT open"' > /tmp/pr-dialog.txt 2>&1
say "$(cat /tmp/pr-dialog.txt)"
agent-browser screenshot /home/z/my-project/tool-results/profit-rank-row-dialog.png && say "screenshot 3 saved"
agent-browser eval '
(() => {
  const btns = [...document.querySelectorAll("button")];
  const close = btns.find(b => b.innerText.trim() === "Close");
  if (close) { close.click(); return "closed"; }
  return "no close btn";
})()' > /dev/null 2>&1

say "E2E COMPLETE"
