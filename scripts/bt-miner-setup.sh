#!/usr/bin/env bash
# Sandbox prep for live SN89 testnet miner (bittensor SDK + wallet + register).
set -x
cd /home/z/my-project
mkdir -p bt-miner && cd bt-miner
python3 -m venv venv 2>&1
./venv/bin/pip install --upgrade pip 2>&1 | tail -2
./venv/bin/pip install bittensor bittensor-cli 2>&1 | tail -5
echo "PIP_DONE rc=$?"
./venv/bin/btcli --version 2>&1
