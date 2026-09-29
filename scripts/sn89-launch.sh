#!/usr/bin/env bash
# Launch the live SN89 testnet CPU miner (sandbox) — run AFTER:
#   1. test TAO lands in the LabTest coldkey (faucet), and
#   2. you export SN89_FEED_TOKEN (Telegram: DM /token to @Iqsignals2026_bot)
# Usage:  SN89_FEED_TOKEN=<token> bash /home/z/my-project/scripts/sn89-launch.sh
set -uo pipefail
cd /home/z/my-project/bt-miner/InfiniteQuant-Subnet

[ -n "${SN89_FEED_TOKEN:-}" ] || { echo "ERROR: SN89_FEED_TOKEN not set (Telegram /token)"; exit 1; }

export SN89_NETWORK=test
export SN89_NETUID=496
export SN89_FEED_TOKEN

PY=/home/z/my-project/bt-miner/venv/bin/python   # Python 3.10 + SN89 pinned deps

echo "== wallet balance check =="
/home/z/my-project/bt-miner/venv312/bin/btcli wallet balance --wallet LabTest -n test || true

echo "== register hotkey on testnet a496 (0.0005 test TAO; skips if already registered) =="
/home/z/my-project/bt-miner/venv312/bin/btcli subnets register --netuid 496 \
  --wallet LabTest --wallet-hotkey testhot -n test --yes || echo "(register failed — check balance / subnet full 128/128)"

echo "== sanity: one-shot submission =="
timeout 60 "$PY" neurons/miner.py --wallet.name LabTest --wallet.hotkey testhot \
  submit --pair BTCUSD --direction LONG 2>&1 | tail -8

echo "== launching follow mode (continuous) =="
exec "$PY" neurons/miner.py --wallet.name LabTest --wallet.hotkey testhot follow
