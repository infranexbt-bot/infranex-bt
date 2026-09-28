#!/usr/bin/env bash
# Stage-based, resumable setup for the live SN89 testnet miner.
# Each stage writes a marker file; re-running skips completed stages.
set -uo pipefail
cd /home/z/my-project/bt-miner
mkdir -p .stages
stage() { [ -f ".stages/$1" ]; }

# ---- Stage 1: venv + bittensor SDK ----
if ! stage sdk; then
  rm -rf venv
  python3 -m venv venv || exit 1
  ./venv/bin/pip install --no-cache-dir --upgrade pip || exit 1
  ./venv/bin/pip install --no-cache-dir bittensor bittensor-cli || exit 1
  ./venv/bin/btcli --version || exit 1
  touch .stages/sdk && echo "[ok] sdk installed"
else echo "[skip] sdk"; fi

# ---- Stage 2: wallet (test hotkey) ----
if ! stage wallet; then
  ./venv/bin/btcli wallet create --wallet.name LabTest --hotkey testhot --no_prompt || exit 1
  touch .stages/wallet && echo "[ok] wallet created"
else echo "[skip] wallet"; fi

# ---- Stage 3: faucet free test TAO (retry a few times for cooldowns) ----
if ! stage faucet; then
  for i in 1 2 3 4 5; do
    echo "[faucet] attempt $i"
    if ./venv/bin/btcli wallet faucet --wallet.name LabTest --network test; then
      touch .stages/faucet && echo "[ok] faucet" && break
    fi
    sleep 20
  done
  stage faucet || { echo "[fail] faucet — needs manual retry later"; exit 2; }
else echo "[skip] faucet"; fi

./venv/bin/btcli wallet overview --wallet.name LabTest --network test || true

# ---- Stage 4: register hotkey on testnet netuid 496 (SN89) — FREE ----
if ! stage register; then
  ./venv/bin/btcli subnets register --netuid 496 --wallet.name LabTest --hotkey testhot --network test || exit 1
  touch .stages/register && echo "[ok] registered on testnet a496"
else echo "[skip] register"; fi

# ---- Stage 5: clone SN89 repo + miner deps ----
if ! stage repo; then
  [ -d InfiniteQuant-Subnet ] || git clone --depth 1 https://github.com/DeltaCompute24/InfiniteQuant-Subnet || exit 1
  ./venv/bin/pip install --no-cache-dir -r InfiniteQuant-Subnet/requirements.txt || exit 1
  touch .stages/repo && echo "[ok] SN89 repo + deps"
else echo "[skip] repo"; fi

echo "SETUP_COMPLETE"
