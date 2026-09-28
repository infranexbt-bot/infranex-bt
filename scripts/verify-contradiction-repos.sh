#!/bin/bash
# Verify hardware requirements for contradiction subnets (category A/B cross-check)
set -u
OUT=/tmp/sn-verify
mkdir -p "$OUT"

declare -A REPOS=(
  [7]="entrius/allways"
  [21]="ippcteam/SN21-adtao"
  [54]="yanez-compliance/MIID-subnet"
  [56]="gradients-ai/G.O.D"
  [79]="taos-im/sn-79"
  [102]="Connito-AI/Connito"
  [107]="minos-protocol/minos_subnet"
)

for nu in 7 21 54 56 79 102 107; do
  repo="${REPOS[$nu]}"
  for br in main master; do
    code=$(curl -s -m 20 -o "$OUT/sn$nu-readme.md" -w "%{http_code}" \
      "https://raw.githubusercontent.com/$repo/$br/README.md")
    [ "$code" = "200" ] && break
  done
  echo "SN$nu ($repo): readme http=$code size=$(wc -c < "$OUT/sn$nu-readme.md" 2>/dev/null)"
done
