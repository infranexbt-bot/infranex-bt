#!/usr/bin/env bash
# ============================================================================
# LIUM PROVIDER BOOTSTRAP — GPU host script
# Generated 2026-10-24 by the Infranex Setup Guide (Section 05e)
# Rail: Path A · USDT (portal account)
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
# 1 · NVIDIA driver (install if missing, then reboot + re-run)
# ----------------------------------------------------------------------
phase "1 · NVIDIA driver"
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
  ok "nvidia-smi already works — skipping driver install"
else
  warn "No working driver — installing nvidia-driver-570"
  sudo apt update && sudo apt install -y nvidia-driver-570
  warn "REBOOT now, then re-run this script to continue:  sudo reboot"
  exit 0
fi
nvidia-smi

# Mixed-GPU guard — one model per node or validation fails.
N_MODELS="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | sort -u | wc -l | tr -d ' ')"
if [ "$N_MODELS" -gt 1 ]; then warn "$N_MODELS different GPU models on this box — a mixed node will NOT validate."; fi

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
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow 8080/tcp >/dev/null
  sudo ufw allow 2200/tcp >/dev/null
  sudo ufw allow 20000:20100/tcp >/dev/null
  ok "ufw: opened 8080, 2200 and renting ports 20000-20100"
else
  warn "ufw not active — nothing to open here."
fi

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
# 7 · Node install
# ----------------------------------------------------------------------
phase "7 · Node install"
# Generic install from the node quickstart — registers the node when you are
# signed in to the portal in the same machine's browser flow, otherwise add the
# node in the portal afterwards (guide, Phase 4).
curl -fsSL https://lium.io/mine.sh | bash -s -- --register

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
