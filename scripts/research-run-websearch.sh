#!/bin/bash
# RUN-subnet web verification — one search per subnet needing current info
OUT=/home/z/my-project/scripts/research/websearch
mkdir -p "$OUT"
declare -A Q=(
  [sn05_hone]="Bittensor subnet 5 Hone miner hardware requirements"
  [sn41_almanac]="Bittensor subnet 41 Almanac prediction miners how to mine"
  [sn83_cliqueai]="Bittensor subnet 83 CliqueAI what is it miners"
  [sn09_iota]="Bittensor subnet 9 iota agents miner requirements"
  [sn68_nova]="Bittensor subnet 68 NOVA bittensor what is it miners"
  [sn95_actual]="Bittensor subnet 95 Actual subnet miners"
  [sn120_affine]="Bittensor subnet 120 Affine bittensor miners"
  [sn107_minos]="Bittensor subnet 107 Minos bittensor miners"
  [sn03_teutonic]="Bittensor subnet 3 Teutonic bittensor miners"
  [sn122_cookingtao]="Bittensor subnet 122 CookingTAO bittensor"
  [sn104_taostatus]="Bittensor subnet 104 TAOstatus bittensor miners"
  [sn25_ur]="Bittensor subnet 25 UR bittensor miners"
  [sn93_bitcast]="Bittensor subnet 93 Bitcast miner requirements GPU"
  [sn10_pareton]="Bittensor subnet 10 Pareton bittensor miners"
  [sn97_albedo]="Bittensor subnet 97 Albedo bittensor miners data labeling"
  [sn80_openroboto]="Bittensor subnet 80 OpenRoboto bittensor miners"
  [sn102_connito]="Bittensor subnet 102 ConnitoAI bittensor"
  [sn124_swarm]="Bittensor subnet 124 Swarm bittensor miners"
  [sn123_mantis]="Bittensor subnet 123 MANTIS bittensor prediction miners"
  [sn61_redteam]="Bittensor subnet 61 RedTeam bittensor miners CPU"
  [sn36_epago]="Bittensor subnet 36 Epago bittensor miners"
  [sn16_kenju]="Bittensor subnet 16 kenju bittensor"
  [sn110_green]="Bittensor subnet 110 Green Compute bittensor"
  [sn11_trajrl]="Bittensor subnet 11 TrajectoryRL bittensor miners"
  [sn20_witness]="Bittensor subnet 20 Witness bittensor miners"
  [sn85_vidaio]="Bittensor subnet 85 Vidaio upscaling miner requirements"
  [sn17_404]="Bittensor subnet 17 404 GEN 3D generation miner requirements"
  [sn51_lium]="Bittensor subnet 51 lium GPU rental miner TEE"
  [sn28_saygm]="Bittensor subnet 28 SayGM bittensor miners"
  [sn67_harnyx]="Bittensor subnet 67 Harnyx CPU mining agents"
)
for key in "${!Q[@]}"; do
  if [ -s "$OUT/$key.json" ]; then continue; fi
  z-ai function -n web_search -a "{\"query\": \"${Q[$key]}\", \"num\": 5}" -o "$OUT/$key.json" >/dev/null 2>&1
  echo "$key: $(python3 -c "import json;d=json.load(open('$OUT/$key.json'));print(len(d),'results')" 2>/dev/null || echo FAIL)"
done
echo DONE
