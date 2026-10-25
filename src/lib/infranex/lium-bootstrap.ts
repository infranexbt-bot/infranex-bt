// ---------------------------------------------------------------------------
// LIUM BOOTSTRAP LIB — turns the Setup Guide (lium-setup.ts) into runnable
// idempotent bash scripts, generated client-side from a small config.
//
// Two scripts, because the guide's #1 security rule demands it:
//   1. HOST script        — runs on the GPU host: OS/driver/Docker/Sysbox prep,
//                           hardware checks, firewall, node install (mine.sh).
//   2. WORKSTATION script — Path B only, runs on the personal machine where
//                           btcli creates the coldkey/hotkey and registers SN51.
//                           Coldkeys never live on a renter-reachable host.
//
// Design rules:
//   · Idempotent — every phase detects "already done" and skips; safe to re-run
//     after the driver reboot mid-way through.
//   · Human gates stay human — funding, registration burn and portal identity
//     require an explicit y/Enter; the script never moves money on its own.
//   · Source contract — lium commands are the same verbatim transcriptions as
//     lium-setup.ts (docs.lium.io 2026-10-25, github.com/Datura-ai/lium-io).
//     btcli flags verified against bittensor-cli 9.23.2 source:
//       wallet new_coldkey  → --no-use-password (opt OUT of the password prompt)
//       wallet new_hotkey   → no password by default
//       subnet register     → -y / --no-prompt skips interactive confirmations
//       --wallet.name / --wallet.hotkey / --wallet.path all accepted
// ---------------------------------------------------------------------------

import type { PayoutPath } from "@/lib/infranex/lium-setup";

export const HOST_FILENAME = "lium-gpu-host-setup.sh";
export const WORKSTATION_FILENAME = "lium-workstation-setup.sh";

/** Literal backslash-033 that bash `echo -e` turns into ESC — concatenated into
 *  strings so tooling never has to carry a raw escape sequence. */
const E = "\\033";

const MEASURED_AT = "2026-10-25";

export interface HostScriptConfig {
  path: PayoutPath;
  /** nvidia-smi already works — skip the driver install block. */
  driverInstalled: boolean;
  /** HGX board (H100/H200 SXM) — enable Fabric Manager. */
  hgxBoard: boolean;
  /** Open ufw for 8080, 2200 and the default renting range (cloud groups stay manual). */
  openUfw: boolean;
  /** The exact command the portal's Add Node dialog prints (optional; falls back to the docs command). */
  portalCommand: string;
}

export interface WorkstationScriptConfig {
  walletName: string;
  hotkeyName: string;
  /** Keep the coldkey password-protected (interactive prompt) instead of --no-use-password. */
  protectColdkey: boolean;
}

// --- helpers ------------------------------------------------------------------

export function sanitizeName(raw: string, fallback: string): string {
  const clean = raw.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return clean.length > 0 ? clean : fallback;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function shellQuoteLine(cmd: string): string {
  return cmd.replace(/'/g, "'\\''");
}

function header(title: string, extra: string[]): string[] {
  return [
    "#!/usr/bin/env bash",
    "# ============================================================================",
    `# ${title}`,
    `# Generated ${today()} by the Infranex Setup Guide (Section 05e)`,
    ...extra.map((l) => `# ${l}`),
    "#",
    "# Idempotent: finished phases are detected and skipped — safe to re-run.",
    `# Source contract: docs.lium.io commands transcribed ${MEASURED_AT} +`,
    "# github.com/Datura-ai/lium-io · btcli flags verified vs bittensor-cli 9.23.2.",
    "# If Lium changes its flow, the linked docs win over this script.",
    "# ============================================================================",
    "set -euo pipefail",
    "",
    'BOLD="' + E + '[1m"; GREEN="' + E + '[32m"; YELLOW="' + E + '[33m"; RED="' + E + '[31m"; DIM="' + E + '[2m"; NC="' + E + '[0m"',
    'phase() { echo -e "\\n$BOLD$GREEN== $1 ==$NC"; }',
    'ok()    { echo -e "$GREEN ✓ $1$NC"; }',
    'warn()  { echo -e "$YELLOW ! $1$NC"; }',
    'die()   { echo -e "$RED ✗ $1$NC" >&2; exit 1; }',
    "",
  ];
}

// --- HOST script ---------------------------------------------------------------

export function buildHostScript(cfg: HostScriptConfig): string {
  const rail =
    cfg.path === "alpha" ? "Path B · alpha (hotkey)" : "Path A · USDT (portal account)";

  // Portal command: accept anything that looks like the mine.sh flow; else docs default.
  const portalRaw = cfg.portalCommand.trim();
  const portalValid = portalRaw.length > 0 && /mine\.sh/.test(portalRaw);
  const installCmd = portalValid
    ? portalRaw
    : "curl -fsSL https://lium.io/mine.sh | bash -s -- --register";

  const L: string[] = [
    ...header("LIUM PROVIDER BOOTSTRAP — GPU host script", [
      `Rail: ${rail}`,
      cfg.hgxBoard ? "HGX board: Fabric Manager will be enabled" : undefined,
      cfg.openUfw ? undefined : "ufw untouched (you manage the firewall yourself)",
      portalValid ? "Install: portal-issued command you pasted" : undefined,
    ].filter(Boolean) as string[]),

    "# ----------------------------------------------------------------------",
    "# 0 · Preflight",
    "# ----------------------------------------------------------------------",
    'phase "0 · Preflight"',
    'if [ "$(id -u)" -eq 0 ]; then die "Run as a normal user with sudo rights — not root."; fi',
    'command -v sudo >/dev/null 2>&1 || die "sudo not found."',
    '# shellcheck disable=SC1091',
    ". /etc/os-release",
    'if [ "$ID" != "ubuntu" ]; then warn "This is $ID, not Ubuntu — the guide targets Ubuntu 24.04/22.04+HWE. Continuing anyway."; fi',
    'KVER="$(uname -r | cut -d. -f1,2)"',
    'if [ "$(printf \'%s\\n\' "5.19" "$KVER" | sort -V | head -1)" != "5.19" ]; then',
    '  die "Kernel $KVER < 5.19 — Sysbox requirement. Ubuntu 22.04: sudo apt install -y linux-generic-hwe-22.04, reboot, re-run."',
    "fi",
    'ok "Ubuntu $VERSION_ID · kernel $KVER"',
    "",
  ];

  // ---- driver ----
  if (cfg.driverInstalled) {
    L.push(
      "# ----------------------------------------------------------------------",
      "# 1 · NVIDIA driver (config: already installed — verify only)",
      "# ----------------------------------------------------------------------",
      'phase "1 · NVIDIA driver"',
      'nvidia-smi >/dev/null 2>&1 || die "nvidia-smi failed — install the driver first (guide, Phase 1): sudo apt update && sudo apt install -y nvidia-driver-570"',
      'ok "Driver works:"',
      "nvidia-smi",
      ""
    );
  } else {
    L.push(
      "# ----------------------------------------------------------------------",
      "# 1 · NVIDIA driver (install if missing, then reboot + re-run)",
      "# ----------------------------------------------------------------------",
      'phase "1 · NVIDIA driver"',
      "if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then",
      '  ok "nvidia-smi already works — skipping driver install"',
      "else",
      '  warn "No working driver — installing nvidia-driver-570"',
      "  sudo apt update && sudo apt install -y nvidia-driver-570",
      '  warn "REBOOT now, then re-run this script to continue:  sudo reboot"',
      "  exit 0",
      "fi",
      "nvidia-smi",
      ""
    );
  }

  L.push(
    "# Mixed-GPU guard — one model per node or validation fails.",
    'N_MODELS="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | sort -u | wc -l | tr -d \' \')"',
    'if [ "$N_MODELS" -gt 1 ]; then warn "$N_MODELS different GPU models on this box — a mixed node will NOT validate."; fi',
    ""
  );

  if (cfg.hgxBoard) {
    L.push(
      "# HGX H100/H200 only — Fabric Manager must run before listing:",
      'if systemctl is-active --quiet nvidia-fabricmanager; then',
      '  ok "Fabric Manager already running"',
      "else",
      "  sudo systemctl enable --now nvidia-fabricmanager",
      '  ok "Fabric Manager enabled"',
      "fi",
      ""
    );
  }

  L.push(
    "# ----------------------------------------------------------------------",
    "# 2 · Docker Engine",
    "# ----------------------------------------------------------------------",
    'phase "2 · Docker Engine"',
    "if command -v docker >/dev/null 2>&1 && docker --version >/dev/null 2>&1; then",
    '  ok "Docker already installed: $(docker --version)"',
    "else",
    "  # Official Docker Engine install (docs.docker.com/engine/install/ubuntu)",
    "  curl -fsSL https://get.docker.com | sudo sh",
    "  sudo systemctl enable --now docker",
    '  ok "Docker installed"',
    "fi",
    "if sudo docker run --rm hello-world >/dev/null 2>&1; then",
    '  ok "Docker can run containers"',
    "else",
    '  die "Docker cannot run a test container — fix Docker before continuing."',
    "fi",
    "",
    "# ----------------------------------------------------------------------",
    "# 3 · Sysbox + NVIDIA Container Toolkit (one command, official script)",
    "# ----------------------------------------------------------------------",
    'phase "3 · Sysbox + NVIDIA Container Toolkit"',
    "if sudo docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q sysbox-runc; then",
    '  ok "Sysbox runtime already present"',
    "else",
    "  curl -fsSL https://raw.githubusercontent.com/Datura-ai/lium-io/main/neurons/executor/nvidia_docker_sysbox_setup.sh | sudo bash",
    '  ok "Sysbox + NVIDIA toolkit installed"',
    "fi",
    "# The exact check the platform runs — GPU inside a Sysbox container:",
    "echo -e \"$DIM  (first run pulls the executor image — a few GB, be patient)$NC\"",
    "if sudo docker run --rm --runtime=sysbox-runc --gpus all daturaai/compute-subnet-executor:latest nvidia-smi; then",
    '  ok "GPU visible inside Sysbox — the same way renters\' pods will see it"',
    "else",
    '  die "GPU check inside Sysbox failed — a node without this is never listed."',
    "fi",
    ""
  );

  L.push(
    "# ----------------------------------------------------------------------",
    "# 4 · Firewall & ports",
    "# ----------------------------------------------------------------------",
    'phase "4 · Firewall & ports"'
  );

  if (cfg.openUfw) {
    L.push(
      'if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then',
      "  sudo ufw allow 8080/tcp >/dev/null",
      "  sudo ufw allow 2200/tcp >/dev/null",
      "  sudo ufw allow 20000:20100/tcp >/dev/null",
      '  ok "ufw: opened 8080, 2200 and renting ports 20000-20100"',
      "else",
      '  warn "ufw not active — nothing to open here."',
      "fi"
    );
  } else {
    L.push('warn "Config: firewall left to you — ensure 8080 + 2200 + ≥3 renting ports (20000+) are reachable."');
  }
  L.push(
    "",
    "# Reachability is judged from OUTSIDE. Cloud security groups cannot be",
    "# changed from this machine — run from another box or an online port checker:",
    'echo -e "$DIM  nc -vz -w 5 <node-ip> 8080      # node service$NC"',
    'echo -e "$DIM  nc -vz -w 5 <node-ip> 2200      # node ssh$NC"',
    'echo -e "$DIM  + at least 3 ports of the renting range (default 20000+)$NC"',
    'echo -e "$DIM  INSUFFICIENT_PORTS in the logs = renting ports not exposed$NC"',
    "",
    "# ----------------------------------------------------------------------",
    "# 5 · RAM & disk vs the idle-pay bar",
    "# ----------------------------------------------------------------------",
    'phase "5 · RAM & disk"',
    'RAM_GB="$(free -g | awk \'/^Mem:/{print $2}\')"',
    'VRAM_MIB="$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | awk \'{s+=$1} END{print s+0}\')"',
    'DISK_GB="$(df -BG --output=avail / | tail -1 | tr -dc \'0-9\')"',
    "NEED_GB=$(( VRAM_MIB * 3 / 2 / 1024 ))",
    'ok "RAM ${RAM_GB} GB (min 8) · disk free ${DISK_GB} GB (min 150)"',
    'ok "Total VRAM ${VRAM_MIB} MiB → idle-pay disk bar: ≥ ${NEED_GB} GB (1.5 × VRAM)"',
    'if [ "$RAM_GB" -lt 8 ]; then warn "RAM below the 8 GB minimum."; fi',
    'if [ "$DISK_GB" -lt 150 ]; then warn "Disk below the 150 GB minimum (140 GB free before the first install)."; fi',
    'if [ "$DISK_GB" -lt "$NEED_GB" ]; then warn "Below the idle-pay disk bar — idle hours would pay nothing. Move Docker storage: docs.lium.io/providers/nodes/docker-storage"; fi',
    ""
  );

  if (cfg.path === "alpha") {
    L.push(
      "# ----------------------------------------------------------------------",
      "# 6 · Wallet reminder — NOT on this machine (Path B)",
      "# ----------------------------------------------------------------------",
      'phase "6 · Wallet — on YOUR workstation, never here"',
      "cat <<'EOF'",
      "  Coldkeys never live on a rented host — renters get container root inside",
      "  Sysbox. On your personal workstation run the companion script the Setup",
      "  Guide generates (lium-workstation-setup.sh), or by hand:",
      "",
      "    pip install bittensor",
      "    btcli wallet new_coldkey --wallet.name <wallet>",
      "    btcli wallet new_hotkey  --wallet.name <wallet> --wallet.hotkey <hotkey>",
      "    btcli subnet register --netuid 51 --wallet.name <wallet> --wallet.hotkey <hotkey>",
      "",
      "  Then import the HOTKEY (never the coldkey) into Polkadot{.js} or the",
      "  Bittensor Wallet extension for the portal's signature login.",
      "EOF",
      ""
    );
  }

  L.push(
    "# ----------------------------------------------------------------------",
    "# 7 · Node install",
    "# ----------------------------------------------------------------------",
    'phase "7 · Node install"'
  );
  if (portalValid) {
    L.push(
      "# Portal-issued command (from the Add Node dialog) — encodes your account:",
      `PORTAL_CMD='${shellQuoteLine(installCmd)}'`,
      'echo -e "$DIM  $PORTAL_CMD$NC"',
      'eval "$PORTAL_CMD"'
    );
  } else {
    L.push(
      "# Generic install from the node quickstart — registers the node when you are",
      "# signed in to the portal in the same machine's browser flow, otherwise add the",
      "# node in the portal afterwards (guide, Phase 4).",
      installCmd
    );
  }
  L.push(
    "",
    "# ----------------------------------------------------------------------",
    "# Done — the parts only a human can do",
    "# ----------------------------------------------------------------------",
    'phase "Done — what only you can do next"',
    "cat <<'EOF'",
    "  ▸ Portal     sign in/up at provider.lium.io — watch VALIDATION PENDING → AVAILABLE (~5 min)",
    "  ▸ Price      ≤ the model's soft limit keeps idle pay (Host & Earn table has the numbers)",
    "  ▸ Tier       Secure only if the machine is rock-stable — a dropped rental owes 48h of rent",
    "  ▸ Discord    connect in Profile — unlocks idle pay on both rails",
    "  ▸ Stuck?     from another machine:  nc -vz -w 5 <node-ip> 8080 && nc -vz -w 5 <node-ip> 2200",
    "  ▸ Updates    docker compose pull && docker compose up -d",
    "EOF",
    "",
    'ok "Bootstrap finished — the guide (Section 05e) covers the rest step by step."',
    ""
  );

  return L.join("\n");
}

// --- WORKSTATION script (Path B only) -------------------------------------------

export function buildWorkstationScript(cfg: WorkstationScriptConfig): string {
  const wallet = sanitizeName(cfg.walletName, "lium-provider");
  const hotkey = sanitizeName(cfg.hotkeyName, "gpu-node-1");

  const L: string[] = [
    ...header("LIUM WORKSTATION SCRIPT — Path B wallet + SN51 registration", [
      `Wallet: ${wallet} · Hotkey: ${hotkey}`,
      "Run on your PERSONAL machine — never on the GPU host.",
      "Human gates kept human: you confirm the registration burn before it happens.",
    ]),

    "# ----------------------------------------------------------------------",
    "# 0 · Guard — refuse to run on a GPU host",
    "# ----------------------------------------------------------------------",
    'phase "0 · Guard"',
    "if command -v nvidia-smi >/dev/null 2>&1; then",
    '  warn "nvidia-smi exists here — this looks like a GPU machine."',
    '  echo -e "$DIM  Coldkeys must never live on a renter-reachable host.$NC"',
    '  read -r -p "Continue on this machine anyway? [y/N] " ans || exit 1',
    '  if [ "$ans" != "y" ]; then exit 1; fi',
    "fi",
    'ok "Running on a non-GPU machine (or you insisted)."',
    "",
    "# ----------------------------------------------------------------------",
    "# 1 · btcli in an isolated venv (Ubuntu 24.04 blocks system-wide pip)",
    "# ----------------------------------------------------------------------",
    'phase "1 · btcli"',
    'command -v python3 >/dev/null 2>&1 || die "python3 required — install it first."',
    "if ! python3 -m venv --help >/dev/null 2>&1; then",
    '  warn "python3-venv missing — installing"',
    "  sudo apt update && sudo apt install -y python3-venv",
    "fi",
    'VENV="$HOME/.venvs/lium"',
    'if [ -x "$VENV/bin/btcli" ]; then',
    '  ok "btcli already installed in $VENV"',
    "else",
    '  echo -e "$DIM  installing bittensor into $VENV (a few minutes)$NC"',
    "  python3 -m venv \"$VENV\"",
    '  "$VENV/bin/pip" install --upgrade pip >/dev/null',
    '  "$VENV/bin/pip" install bittensor',
    '  ok "bittensor installed"',
    "fi",
    'BTCLI="$VENV/bin/btcli"',
    '"$BTCLI" --version || die "btcli failed to run — check the pip output above."',
    'warn "For manual use later:  source $VENV/bin/activate"',
    "",
    "# ----------------------------------------------------------------------",
    "# 2 · Coldkey + hotkey",
    "# ----------------------------------------------------------------------",
    'phase "2 · Coldkey + hotkey"',
    `CK="$HOME/.bittensor/wallets/${wallet}/coldkey"`,
    `HK="$HOME/.bittensor/wallets/${wallet}/hotkeys/${hotkey}"`,
    "if [ -f \"$CK\" ]; then",
    '  ok "Coldkey exists — skipping creation"',
    "else",
    ...(cfg.protectColdkey
      ? [`  "$BTCLI" wallet new_coldkey --wallet.name ${wallet}`]
      : [
          "  # --no-use-password: unencrypted key for unattended runs — only sane on an encrypted disk",
          `  "$BTCLI" wallet new_coldkey --wallet.name ${wallet} --no-use-password`,
        ]),
    "fi",
    "if [ -f \"$HK\" ]; then",
    '  ok "Hotkey exists — skipping creation"',
    "else",
    `  "$BTCLI" wallet new_hotkey --wallet.name ${wallet} --wallet.hotkey ${hotkey}`,
    "fi",
    'warn "Write BOTH mnemonics on paper, offline. No mnemonic = no funds, no recovery."',
    "",
    "# ----------------------------------------------------------------------",
    "# 3 · Addresses & balance",
    "# ----------------------------------------------------------------------",
    'phase "3 · Addresses & balance"',
    `"$BTCLI" wallet overview --wallet.name ${wallet}`,
    'echo -e "$DIM  funding tip: send TAO to the COLDKEY address above (registration fee + headroom)$NC"',
    'if ! "$BTCLI" wallet balance --wallet.name ' +
      wallet +
      "; then",
    '  warn "Balance check failed (offline?) — check before registering."',
    "fi",
    "",
    "# ----------------------------------------------------------------------",
    "# 4 · Subnet 51 registration — HUMAN GATE (burns TAO)",
    "# ----------------------------------------------------------------------",
    'phase "4 · SN51 registration"',
    "cat <<'EOF'",
    "  Registering burns a recycle fee that floats with seat demand — check the",
    "  live fee first:  https://taomarketcap.com/subnets/51/registration",
    "  The fee is burned, not paid to anyone. Keep headroom for transaction fees.",
    "EOF",
    `read -r -p "Register ${hotkey} on Subnet 51 now? [y/N] " ans || ans=""`,
    'if [ "$ans" = "y" ]; then',
    `  "$BTCLI" subnet register --netuid 51 --wallet.name ${wallet} --wallet.hotkey ${hotkey} -y`,
    `  "$BTCLI" wallet overview --wallet.name ${wallet}`,
    '  ok "Registered — the UID column above is your seat on SN51"',
    "else",
    '  warn "Skipped. When ready, run:"',
    `  echo "  $BTCLI subnet register --netuid 51 --wallet.name ${wallet} --wallet.hotkey ${hotkey} -y"`,
    "fi",
    "",
    "# ----------------------------------------------------------------------",
    "# Done — the parts only a human can do",
    "# ----------------------------------------------------------------------",
    'phase "Done — what only you can do"',
    "cat <<'EOF'",
    "  ▸ Extension   import the HOTKEY (never the coldkey) into Polkadot{.js} or the",
    "                Bittensor Wallet extension — the portal signs you in with it",
    "                Polkadot{.js}:  https://chromewebstore.google.com/detail/polkadot%7Bjs%7D-extension/mopnmbcafieddcagagdcbnhejhlodfdd",
    "                Bittensor:      https://chromewebstore.google.com/detail/bittensor-wallet/bdgmdoedahdcjmpmifafdhnffjinddgc",
    "  ▸ Portal      signature login at provider.lium.io/signature-login · approve in the extension",
    "  ▸ Profile     Central Miner Server ON · Discord connected (unlocks idle pay)",
    "  ▸ Host        then run lium-gpu-host-setup.sh on the GPU machine",
    "EOF",
    "",
    'ok "Workstation side finished."',
    ""
  ];

  return L.join("\n");
}
