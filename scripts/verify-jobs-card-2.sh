#!/bin/bash
# subnet-ui-1 v2 — click a SPECIFIC subnet card's Requirements button by name.
set -u
cd /home/z/my-project
say() { echo "[jobs-card2] $*"; }
mkdir -p tool-results

open_case () {
  local label="$1" name="$2" shot="$3"
  say "case: $label — opening '$name'"
  local RES
  RES=$(agent-browser eval "
    (() => {
      const want = '$name'.toLowerCase();
      const leaves = [...document.querySelectorAll('div,span,p,h3,h4')].filter(el =>
        el.children.length === 0 && el.textContent && el.textContent.trim().toLowerCase().includes(want));
      if (!leaves.length) return 'name-not-in-dom';
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
  agent-browser snapshot > "/tmp/jc-${label}.txt" 2>&1
  say "  shot: tool-results/$shot"
  agent-browser press Escape > /dev/null 2>&1; sleep 1
  agent-browser press Escape > /dev/null 2>&1; sleep 1
}

# ensure on Subnets page
agent-browser snapshot > /tmp/jc2.txt 2>&1
if ! grep -q "SECTION" /tmp/jc2.txt; then
  agent-browser open http://localhost:3000 > /dev/null 2>&1; sleep 6
  agent-browser snapshot > /tmp/jc2.txt 2>&1
fi
SR=$(grep -oE 'button "Subnets 03" \[ref=(e[0-9]+)\]' /tmp/jc2.txt | grep -oE 'e[0-9]+' | head -1)
[ -n "$SR" ] && agent-browser click "@$SR" > /dev/null
sleep 8

open_case "chutes" "Chutes" "jobs-card2-chutes.png"
open_case "affine" "Affine" "jobs-card2-affine.png"
open_case "forsale" "for sale" "jobs-card2-forsale.png"
say "done"
