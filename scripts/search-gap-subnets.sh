#!/bin/bash
# subnet-info-1: batch web searches for subnets whose README could not be fetched
cd /home/z/my-project
OUT=scripts/subnet-info-extracts/websearch
mkdir -p "$OUT"

declare -A QUERIES=(
  [120]="Affine Bittensor subnet netuid 120 what do miners do"
  [95]="Actual Bittensor subnet 95 miners computer use"
  [97]="Albedo Bittensor subnet 97 miner tasks"
  [110]="Green Compute Bittensor subnet 110 miners"
  [118]="Ditto Bittensor subnet 118 assistant miner"
  [58]="Bittensor subnet 58 0x miners"
  [31]="rec4ll Bittensor subnet 31 recall miner"
  [117]="everyframe studio Bittensor subnet 117 miner video"
  [122]="CookingTAO Bittensor subnet 122"
  [105]="Beam Network Bittensor subnet 105 miner"
  [126]="Attelier Bittensor subnet 126 miner"
  [103]="Capcomp Bittensor subnet 103 miner"
  [47]="GPUForge Bittensor subnet 47 miner"
  [109]="Finsight Bittensor subnet 109 miner"
  [30]="Endure Network Bittensor subnet 30 miner"
  [113]="LongShort Bittensor subnet 113 finance miner"
  [116]="Memo Bittensor subnet 116 miner"
  [99]="Thirty Spokes Bittensor subnet 99"
  [16]="kenju Bittensor subnet 16 miner"
  [87]="Provenonce Bittensor subnet 87 miner"
  [35]="Bittensor subnet 35 netuid project"
  [57]="Bittensor subnet 57 netuid project"
  [59]="Bittensor subnet 59 netuid project"
  [70]="Bittensor subnet 70 netuid project"
  [84]="Bittensor subnet 84 netuid project"
  [86]="Bittensor subnet 86 netuid project"
  [108]="Bittensor subnet 108 netuid project"
)

for n in "${!QUERIES[@]}"; do
  f="$OUT/$n.json"
  if [ -s "$f" ]; then continue; fi
  echo "searching $n: ${QUERIES[$n]}"
  z-ai function -n web_search -a "{\"query\": \"${QUERIES[$n]}\", \"num\": 5}" -o "$f" 2>/dev/null || echo "  (search failed for $n)"
  sleep 1
done
echo DONE
