#!/bin/bash
# subnet-ui-1 v3 — open dialog via the card's netuid badge (α120, α112).
set -u
cd /home/z/my-project
say() { echo "[jobs-card3] $*"; }
mkdir -p tool-results

open_case () {
  local label="$1" badge="$2" shot="$3"
  say "case: $label — opening card with badge '$badge'"
  local RES
  RES=$(agent-browser eval "
    (() => {
      const want = '$badge';
      const leaves = [...document.querySelectorAll('div,span,p')].filter(el =>
        el.children.length === 0 && el.textContent && el.textContent.trim() === want);
      if (!leaves.length) return 'badge-not-in-dom';
      let node = leaves[0];
      for (let i = 0; i < 12 && node; i++) {
        node = node.parentElement;
        if (!node) break;
        const btn = [...node.querySelectorAll('button')].find(b => b.textContent.trim() === 'Requirements');
        if (btn) { btn.click(); return 'clicked'; }
      }
      return 'no-requirements-button';
    })()
  " 2>&1 | tail -1)
  say "  open: $RES"
  sleep 4
  agent-browser eval '
    (() => {
      const h = [...document.querySelectorAll("p,span")].find(x => x.textContent.trim() === "What miners do here");
      if (!h) return "card-not-found";
      h.scrollIntoView({ block: "start" });
      return "card-ok";
    })()
  ' 2>&1 | tail -1
  sleep 1
  agent-browser screenshot "tool-results/$shot" > /dev/null 2>&1
  say "  shot: tool-results/$shot"
  agent-browser press Escape > /dev/null 2>&1; sleep 1
  agent-browser press Escape > /dev/null 2>&1; sleep 1
}

agent-browser snapshot > /tmp/jc3.txt 2>&1
SR=$(grep -oE 'button "Subnets 03" \[ref=(e[0-9]+)\]' /tmp/jc3.txt | grep -oE 'e[0-9]+' | head -1)
[ -n "$SR" ] && agent-browser click "@$SR" > /dev/null
sleep 8

open_case "affine" "α120" "jobs-card3-affine.png"
open_case "forsale" "α112" "jobs-card3-forsale.png"
say "done"
