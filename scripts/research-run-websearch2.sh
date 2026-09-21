#!/bin/bash
# Second-pass verification for ambiguous subnets + macro context
OUT=/home/z/my-project/scripts/research/websearch
mkdir -p "$OUT"
declare -A Q=(
  [sn25_ur2]="\"Subnet 25\" bittensor UR miners incentive"
  [sn20_witness2]="bittensor \"Witness\" subnet 20 video miners"
  [sn97_albedo2]="Albedo subnet 97 bittensor human data labeling miners how it works"
  [sn10_pareton2]="Pareton bittensor subnet 10 inference network"
  [sn104_taostatus2]="TAOstatus bittensor subnet 104 what does it do"
  [sn36_epago2]="Epago subnet 36 bittensor agents API mining"
  [sn107_minos2]="Minos subnet 107 bittensor what does it do wallet"
  [sn16_kenju2]="kenju subnet 16 bittensor what is it"
  [sn122_cooking2]="CookingTAO subnet 122 bittensor departed"
  [sn112_sale2]="bittensor subnet 112 for sale subnet ownership"
  [sn39_deprecated2]="bittensor subnet 39 deprecated owner abandoned"
  [sn80_roboto2]="OpenRoboto subnet 80 bittensor robotics VLA miners GPU"
  [macro_best2]="best Bittensor subnets to mine September 2026 CPU GPU profitable"
  [macro_dereg2]="Bittensor subnet deregistration 2026 recycled 1 TAO near deregistration"
)
for key in "${!Q[@]}"; do
  if [ -s "$OUT/$key.json" ]; then continue; fi
  z-ai function -n web_search -a "{\"query\": \"${Q[$key]}\", \"num\": 5}" -o "$OUT/$key.json" >/dev/null 2>&1
  echo "$key: $(python3 -c "import json;d=json.load(open('$OUT/$key.json'));print(len(d),'results')" 2>/dev/null || echo FAIL)"
done
echo DONE
