#!/usr/bin/env bash
# ============================================================================
# LIUM PROVIDER BOOTSTRAP — GPU host script
# Generated 2026-10-24 by the Infranex Setup Guide (Section 05e)
# Rail: Path B · alpha (hotkey)
# HGX board: Fabric Manager will be enabled
# ufw untouched (you manage the firewall yourself)
# Install: portal-issued command you pasted
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
# 0 · Preflight
# ----------------------------------------------------------------------
phase "0 · Preflight"
if [ "$(id -u)" -eq 0 ]; then die "Run as a normal user with sudo rights — not root."; fi
command -v sudo >/dev/null 2>&1 || die "sudo not found."
# shellcheck disable=SC1091
. /etc/os-release
if [ "$ID" != "ubuntu" ]; then warn "This is $ID, not Ubuntu — the guide targets Ubuntu 24.04/22.04+HWE. Continuing anyway."; fi
KVER="$(uname -r | cut -d. -f1,2)"
if [ "$(printf '%s\n' "5.19" "$KVER" | sort -V | head -1)" != "5.19" ]; then
  die "Kernel $KVER < 5.19 — Sysbox requirement. Ubuntu 22.04: sudo apt install -y linux-generic-hwe-22.04, reboot, re-run."
fi
ok "Ubuntu $VERSION_ID · kernel $KVER"

# ----------------------------------------------------------------------
# 1 · NVIDIA driver (config: already installed — verify only)
# ----------------------------------------------------------------------
phase "1 · NVIDIA driver"
nvidia-smi >/dev/null 2>&1 || die "nvidia-smi failed — install the driver first (guide, Phase 1): sudo apt update && sudo apt install -y nvidia-driver-570"
ok "Driver works:"
nvidia-smi

# Mixed-GPU guard — one model per node or validation fails.
N_MODELS="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | sort -u | wc -l | tr -d ' ')"
if [ "$N_MODELS" -gt 1 ]; then warn "$N_MODELS different GPU models on this box — a mixed node will NOT validate."; fi

# HGX H100/H200 only — Fabric Manager must run before listing:
if systemctl is-active --quiet nvidia-fabricmanager; then
  ok "Fabric Manager already running"
else
  sudo systemctl enable --now nvidia-fabricmanager
  ok "Fabric Manager enabled"
fi

# ----------------------------------------------------------------------
# 2 · Docker Engine
# ----------------------------------------------------------------------
phase "2 · Docker Engine"
if command -v docker >/dev/null 2>&1 && docker --version >/dev/null 2>&1; then
  ok "Docker already installed: $(docker --version)"
else
  # Official Docker Engine install (docs.docker.com/engine/install/ubuntu)
  curl -fsSL https://get.docker.com | sudo sh
  sudo systemctl enable --now docker
  ok "Docker installed"
fi
if sudo docker run --rm hello-world >/dev/null 2>&1; then
  ok "Docker can run containers"
else
  die "Docker cannot run a test container — fix Docker before continuing."
fi

# ----------------------------------------------------------------------
# 3 · Sysbox + NVIDIA Container Toolkit (one command, official script)
# ----------------------------------------------------------------------
phase "3 · Sysbox + NVIDIA Container Toolkit"
if sudo docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q sysbox-runc; then
  ok "Sysbox runtime already present"
else
  curl -fsSL https://raw.githubusercontent.com/Datura-ai/lium-io/main/neurons/executor/nvidia_docker_sysbox_setup.sh | sudo bash
  ok "Sysbox + NVIDIA toolkit installed"
fi
# The exact check the platform runs — GPU inside a Sysbox container:
echo -e "$DIM  (first run pulls the executor image — a few GB, be patient)$NC"
if sudo docker run --rm --runtime=sysbox-runc --gpus all daturaai/compute-subnet-executor:latest nvidia-smi; then
  ok "GPU visible inside Sysbox — the same way renters' pods will see it"
else
  die "GPU check inside Sysbox failed — a node without this is never listed."
fi

# ----------------------------------------------------------------------
# 4 · Firewall & ports
# ----------------------------------------------------------------------
phase "4 · Firewall & ports"
warn "Config: firewall left to you — ensure 8080 + 2200 + ≥3 renting ports (20000+) are reachable."

# Reachability is judged from OUTSIDE. Cloud security groups cannot be
# changed from this machine — run from another box or an online port checker:
echo -e "$DIM  nc -vz -w 5 <node-ip> 8080      # node service$NC"
echo -e "$DIM  nc -vz -w 5 <node-ip> 2200      # node ssh$NC"
echo -e "$DIM  + at least 3 ports of the renting range (default 20000+)$NC"
echo -e "$DIM  INSUFFICIENT_PORTS in the logs = renting ports not exposed$NC"

# ----------------------------------------------------------------------
# 5 · RAM & disk vs the idle-pay bar
# ----------------------------------------------------------------------
phase "5 · RAM & disk"
RAM_GB="$(free -g | awk '/^Mem:/{print $2}')"
VRAM_MIB="$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | awk '{s+=$1} END{print s+0}')"
DISK_GB="$(df -BG --output=avail / | tail -1 | tr -dc '0-9')"
NEED_GB=$(( VRAM_MIB * 3 / 2 / 1024 ))
ok "RAM ${RAM_GB} GB (min 8) · disk free ${DISK_GB} GB (min 150)"
ok "Total VRAM ${VRAM_MIB} MiB → idle-pay disk bar: ≥ ${NEED_GB} GB (1.5 × VRAM)"
if [ "$RAM_GB" -lt 8 ]; then warn "RAM below the 8 GB minimum."; fi
if [ "$DISK_GB" -lt 150 ]; then warn "Disk below the 150 GB minimum (140 GB free before the first install)."; fi
if [ "$DISK_GB" -lt "$NEED_GB" ]; then warn "Below the idle-pay disk bar — idle hours would pay nothing. Move Docker storage: docs.lium.io/providers/nodes/docker-storage"; fi

# ----------------------------------------------------------------------
# 6 · Wallet reminder — NOT on this machine (Path B)
# ----------------------------------------------------------------------
phase "6 · Wallet — on YOUR workstation, never here"
cat <<'EOF'
  Coldkeys never live on a rented host — renters get container root inside
  Sysbox. On your personal workstation run the companion script the Setup
  Guide generates (lium-workstation-setup.sh), or by hand:

    pip install bittensor
    btcli wallet new_coldkey --wallet.name <wallet>
    btcli wallet new_hotkey  --wallet.name <wallet> --wallet.hotkey <hotkey>
    btcli subnet register --netuid 51 --wallet.name <wallet> --wallet.hotkey <hotkey>

  Then import the HOTKEY (never the coldkey) into Polkadot{.js} or the
  Bittensor Wallet extension for the portal's signature login.
EOF

# ----------------------------------------------------------------------
# 7 · Node install
# ----------------------------------------------------------------------
phase "7 · Node install"
# Portal-issued command (from the Add Node dialog) — encodes your account:
PORTAL_CMD='curl -fsSL https://lium.io/mine.sh | bash -s -- --register --token ABC'\''123'
echo -e "$DIM  $PORTAL_CMD$NC"
eval "$PORTAL_CMD"

# ----------------------------------------------------------------------
# Done — the parts only a human can do
# ----------------------------------------------------------------------
phase "Done — what only you can do next"
cat <<'EOF'
  ▸ Portal     sign in/up at provider.lium.io — watch VALIDATION PENDING → AVAILABLE (~5 min)
  ▸ Price      ≤ the model's soft limit keeps idle pay (Host & Earn table has the numbers)
  ▸ Tier       Secure only if the machine is rock-stable — a dropped rental owes 48h of rent
  ▸ Discord    connect in Profile — unlocks idle pay on both rails
  ▸ Stuck?     from another machine:  nc -vz -w 5 <node-ip> 8080 && nc -vz -w 5 <node-ip> 2200
  ▸ Updates    docker compose pull && docker compose up -d
EOF

ok "Bootstrap finished — the guide (Section 05e) covers the rest step by step."
