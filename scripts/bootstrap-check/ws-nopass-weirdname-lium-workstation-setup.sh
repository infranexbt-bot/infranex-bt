#!/usr/bin/env bash
# ============================================================================
# LIUM WORKSTATION SCRIPT — Path B wallet + SN51 registration
# Generated 2026-10-24 by the Infranex Setup Guide (Section 05e)
# Wallet: myprovider · Hotkey: gpunode1
# Run on your PERSONAL machine — never on the GPU host.
# Human gates kept human: you confirm the registration burn before it happens.
#
# Idempotent: finished phases are detected and skipped — safe to re-run.
# Source contract: docs.lium.io commands transcribed 2026-10-25 +
# github.com/Datura-ai/lium-io · btcli flags verified vs bittensor-cli 9.23.2.
# If Lium changes its flow, the linked docs win over this script.
# ============================================================================
set -euo pipefail

BOLD="\033[1m"; GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"; DIM="\033[2m"; NC="\033[0m"
phase() { echo -e "\n$BOLD$GREEN== $1 ==$NC"; }
ok()    { echo -e "$GREEN ✓ $1$NC"; }
warn()  { echo -e "$YELLOW ! $1$NC"; }
die()   { echo -e "$RED ✗ $1$NC" >&2; exit 1; }

# ----------------------------------------------------------------------
# 0 · Guard — refuse to run on a GPU host
# ----------------------------------------------------------------------
phase "0 · Guard"
if command -v nvidia-smi >/dev/null 2>&1; then
  warn "nvidia-smi exists here — this looks like a GPU machine."
  echo -e "$DIM  Coldkeys must never live on a renter-reachable host.$NC"
  read -r -p "Continue on this machine anyway? [y/N] " ans || exit 1
  if [ "$ans" != "y" ]; then exit 1; fi
fi
ok "Running on a non-GPU machine (or you insisted)."

# ----------------------------------------------------------------------
# 1 · btcli in an isolated venv (Ubuntu 24.04 blocks system-wide pip)
# ----------------------------------------------------------------------
phase "1 · btcli"
command -v python3 >/dev/null 2>&1 || die "python3 required — install it first."
if ! python3 -m venv --help >/dev/null 2>&1; then
  warn "python3-venv missing — installing"
  sudo apt update && sudo apt install -y python3-venv
fi
VENV="$HOME/.venvs/lium"
if [ -x "$VENV/bin/btcli" ]; then
  ok "btcli already installed in $VENV"
else
  echo -e "$DIM  installing bittensor into $VENV (a few minutes)$NC"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --upgrade pip >/dev/null
  "$VENV/bin/pip" install bittensor
  ok "bittensor installed"
fi
BTCLI="$VENV/bin/btcli"
"$BTCLI" --version || die "btcli failed to run — check the pip output above."
warn "For manual use later:  source $VENV/bin/activate"

# ----------------------------------------------------------------------
# 2 · Coldkey + hotkey
# ----------------------------------------------------------------------
phase "2 · Coldkey + hotkey"
CK="$HOME/.bittensor/wallets/myprovider/coldkey"
HK="$HOME/.bittensor/wallets/myprovider/hotkeys/gpunode1"
if [ -f "$CK" ]; then
  ok "Coldkey exists — skipping creation"
else
  # --no-use-password: unencrypted key for unattended runs — only sane on an encrypted disk
  "$BTCLI" wallet new_coldkey --wallet.name myprovider --no-use-password
fi
if [ -f "$HK" ]; then
  ok "Hotkey exists — skipping creation"
else
  "$BTCLI" wallet new_hotkey --wallet.name myprovider --wallet.hotkey gpunode1
fi
warn "Write BOTH mnemonics on paper, offline. No mnemonic = no funds, no recovery."

# ----------------------------------------------------------------------
# 3 · Addresses & balance
# ----------------------------------------------------------------------
phase "3 · Addresses & balance"
"$BTCLI" wallet overview --wallet.name myprovider
echo -e "$DIM  funding tip: send TAO to the COLDKEY address above (registration fee + headroom)$NC"
if ! "$BTCLI" wallet balance --wallet.name myprovider; then
  warn "Balance check failed (offline?) — check before registering."
fi

# ----------------------------------------------------------------------
# 4 · Subnet 51 registration — HUMAN GATE (burns TAO)
# ----------------------------------------------------------------------
phase "4 · SN51 registration"
cat <<'EOF'
  Registering burns a recycle fee that floats with seat demand — check the
  live fee first:  https://taomarketcap.com/subnets/51/registration
  The fee is burned, not paid to anyone. Keep headroom for transaction fees.
EOF
read -r -p "Register gpunode1 on Subnet 51 now? [y/N] " ans || ans=""
if [ "$ans" = "y" ]; then
  "$BTCLI" subnet register --netuid 51 --wallet.name myprovider --wallet.hotkey gpunode1 -y
  "$BTCLI" wallet overview --wallet.name myprovider
  ok "Registered — the UID column above is your seat on SN51"
else
  warn "Skipped. When ready, run:"
  echo "  $BTCLI subnet register --netuid 51 --wallet.name myprovider --wallet.hotkey gpunode1 -y"
fi

# ----------------------------------------------------------------------
# Done — the parts only a human can do
# ----------------------------------------------------------------------
phase "Done — what only you can do"
cat <<'EOF'
  ▸ Extension   import the HOTKEY (never the coldkey) into Polkadot{.js} or the
                Bittensor Wallet extension — the portal signs you in with it
                Polkadot{.js}:  https://chromewebstore.google.com/detail/polkadot%7Bjs%7D-extension/mopnmbcafieddcagagdcbnhejhlodfdd
                Bittensor:      https://chromewebstore.google.com/detail/bittensor-wallet/bdgmdoedahdcjmpmifafdhnffjinddgc
  ▸ Portal      signature login at provider.lium.io/signature-login · approve in the extension
  ▸ Profile     Central Miner Server ON · Discord connected (unlocks idle pay)
  ▸ Host        then run lium-gpu-host-setup.sh on the GPU machine
EOF

ok "Workstation side finished."
