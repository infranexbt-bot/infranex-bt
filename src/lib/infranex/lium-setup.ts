// ---------------------------------------------------------------------------
// LIUM SETUP GUIDE LIB — the complete SN51 provider onboarding path.
//
// Companion to lium-earnings.ts (the money module). This file is the HOW:
// every step from an owned GPU to a listed, earning node on lium.io —
// host preparation, wallet (coldkey/hotkey) creation, Subnet 51
// registration, the Lium portal, the node install command, pricing,
// idle-pay eligibility and day-2 operations.
//
// SOURCE CONTRACT — commands and rules are transcribed from the official
// docs (docs.lium.io providers quickstart + node quickstart, fetched
// 2026-10-25) and github.com/Datura-ai/lium-io. Where Lium changes its
// flow, the DOCS links below win over this file. Never invent commands.
// ---------------------------------------------------------------------------

export const LIUM_SETUP_MEASURED_AT = "2026-10-25";

export const SETUP_LINKS = {
  providerQuickstart: "https://docs.lium.io/providers/quickstart",
  nodeQuickstart: "https://docs.lium.io/providers/nodes/quickstart",
  sysbox: "https://docs.lium.io/providers/nodes/sysbox",
  discord: "https://docs.lium.io/providers/portal/discord",
  managingNodes: "https://docs.lium.io/providers/portal/managing-nodes",
  dockerStorage: "https://docs.lium.io/providers/nodes/docker-storage",
  gpuSplitting: "https://docs.lium.io/providers/nodes/gpu-splitting",
  cvm: "https://docs.lium.io/providers/nodes/cvm",
  penalties: "https://docs.lium.io/rewards/penalties",
  payouts: "https://docs.lium.io/rewards/payouts",
  troubleshooting: "https://docs.lium.io/providers/troubleshooting",
  portal: "https://provider.lium.io",
  portalSignup: "https://provider.lium.io/signup",
  signatureLogin: "https://provider.lium.io/signature-login",
  rewardsCalculator: "https://provider.lium.io/rewards-calculator",
  rentOut: "https://lium.io/rent-out-your-gpu",
  github: "https://github.com/Datura-ai/lium-io",
  bittensorWallets: "https://docs.bittensor.com/getting-started/wallets",
  registrationFee: "https://taomarketcap.com/subnets/51/registration",
  support: "https://docs.lium.io/intro",
} as const;

// --- Payout rails (Path A vs Path B) ----------------------------------------

export type PayoutPath = "usdt" | "alpha";

export interface PathCard {
  key: PayoutPath;
  title: string;
  tagline: string;
  perks: string[];
  needs: string[];
}

export const PAYOUT_PATHS: PathCard[] = [
  {
    key: "usdt",
    title: "Path A · Portal account",
    tagline: "Email or Google sign-up — paid in USDT on Ethereum",
    perks: [
      "Zero crypto setup — no wallet, no registration fee",
      "Rental fees paid daily (T+2 at 17:00 UTC) in USDT",
      "Min payout $5 · ~5% conversion fee on the payout",
      "Fastest path from bare GPU to first dollars",
    ],
    needs: [
      "provider.lium.io signup",
      "Payout address in Settings → Payout",
      "Discord connected for idle pay",
    ],
  },
  {
    key: "alpha",
    title: "Path B · Your own hotkey",
    tagline: "Registered SN51 hotkey — paid in SN51 alpha, no conversion fee",
    perks: [
      "Full emission — no ~5% conversion fee",
      "Rental fees land on your coldkey daily; incentive hits your hotkey every tempo",
      "Idle pay from the unrented pool (same eligibility rules)",
      "Your hotkey is a real on-chain identity you keep",
    ],
    needs: [
      "btcli wallet: coldkey + hotkey",
      "Subnet 51 registration fee in TAO (recycle cost — check the live fee)",
      "Signature login + Discord connected",
      "Central Miner Server ON in Profile Settings",
    ],
  },
];

// --- Hard requirements (node quickstart, 2026-10-25) -------------------------

export const REQUIREMENTS: { label: string; value: string; note?: string }[] = [
  {
    label: "OS",
    value: "Ubuntu 24.04 (or 22.04 + HWE kernel)",
    note: "Sysbox needs kernel 5.19+",
  },
  {
    label: "GPU",
    value: "NVIDIA on the supported list, one model per node",
    note: "30/40/50-series up to H100/H200/B200/B300",
  },
  { label: "Driver", value: "nvidia-smi works", note: "HGX needs Fabric Manager running" },
  { label: "Runtime", value: "Docker Engine + Sysbox + NVIDIA Container Toolkit" },
  { label: "Network", value: "Public IP · ≥100 Mbit/s download", note: "measured by the validator" },
  { label: "Ports", value: "8080 + 2200 open, ≥3 renting ports reachable" },
  { label: "Hardware", value: "≥8 GB RAM · ≥150 GB disk", note: "140 GB free before first install" },
  {
    label: "Idle pay",
    value: "Disk ≥ 1.5× total GPU VRAM",
    note: "on the same node",
  },
];

// --- Phase model --------------------------------------------------------------

export type StepApplies = "both" | "usdt" | "alpha";

export interface SetupStep {
  id: string;
  title: string;
  /** Which payout path this step belongs to. */
  applies: StepApplies;
  /** Why this step exists — 2-4 sentences. */
  why: string;
  /** Exact commands, transcribed from the official docs. */
  commands?: string[];
  /** What you should see when it worked. */
  verify?: string[];
  /** The mistake that costs money or time. */
  gotcha?: string;
  /** Links shown with the step. */
  links?: { label: string; href: string }[];
}

export interface SetupPhase {
  id: string;
  n: number;
  title: string;
  outcome: string;
  steps: SetupStep[];
}

// --- The guide ----------------------------------------------------------------

export const SETUP_PHASES: SetupPhase[] = [
  {
    id: "phase-0",
    n: 0,
    title: "Decide the payout rail before you touch hardware",
    outcome: "You know which path you're on — it decides the wallet work and the fees you pay.",
    steps: [
      {
        id: "p0-s1",
        title: "Path A vs Path B — pick from money first",
        applies: "both",
        why: "Both paths rent the same GPUs at the same prices and share the 95%/5% rental split. They differ in what you're paid and what setup you owe: Path A pays USDT on Ethereum through a portal account (email/Google, ~5% conversion fee, $5 minimum). Path B pays SN51 alpha straight to a Bittensor hotkey you register yourself — no conversion fee, but you pay the Subnet 51 registration fee and carry alpha price risk. The Host & Earn module prices both rails; switch here and the numbers there follow.",
        links: [
          { label: "Provider quickstart (both paths)", href: SETUP_LINKS.providerQuickstart },
          { label: "Rewards calculator", href: SETUP_LINKS.rewardsCalculator },
        ],
        gotcha:
          "Path B requires a registration fee burned to TAO recycle — check the live cost before committing; it moves with seat demand.",
      },
      {
        id: "p0-s2",
        title: "Re-read the economics with your real numbers",
        applies: "both",
        why: "The earnings table in Host & Earn is trailing-30-day actuals measured on lium.io — observations, not guarantees. Before installing anything, load your GPU row, set your electricity rate and capex, and stress the demand slider. If the card barely clears electricity at 70% demand, it will barely clear it on Lium either.",
        links: [{ label: "Open the Host & Earn calculator", href: SETUP_LINKS.rentOut }],
      },
    ],
  },
  {
    id: "phase-1",
    n: 1,
    title: "Prepare the GPU host (OS → driver → Docker → Sysbox)",
    outcome: "A machine where nvidia-smi works, Docker runs, and a Sysbox container can reach the GPU.",
    steps: [
      {
        id: "p1-s1",
        title: "Check the OS and kernel",
        applies: "both",
        why: "Validators only list nodes that run Sysbox, and Sysbox needs a kernel of 5.19 or newer. Ubuntu 24.04 ships one by default; Ubuntu 22.04 needs the HWE kernel. One model of GPU per node — a mixed box will not validate.",
        commands: ["lsb_release -a", "uname -r", "lspci | grep -i nvidia"],
        verify: [
          "Ubuntu 24.04 (or 22.04 with HWE), kernel 5.19+",
          "All GPUs on the box are the same model",
        ],
        gotcha:
          "A node with mixed GPU models (e.g. a 4090 next to a 3090) fails validation — one model per node.",
      },
      {
        id: "p1-s2",
        title: "Install the NVIDIA driver and verify nvidia-smi",
        applies: "both",
        why: "The node agent and the validator both read the driver directly. Ubuntu's packaged driver is the simplest reliable path; pick the current production branch for your generation (570-series covers Blackwell and earlier). HGX H100/H200 boards additionally need NVIDIA Fabric Manager running before you add the node.",
        commands: [
          "sudo apt update && sudo apt install -y nvidia-driver-570",
          "sudo reboot   # if the driver was just installed",
          "nvidia-smi",
          "# HGX H100/H200 only:",
          "sudo systemctl enable --now nvidia-fabricmanager",
        ],
        verify: [
          "nvidia-smi prints your GPU name, driver version and CUDA version",
          "No 'NVIDIA-SMI has failed' error",
        ],
        gotcha:
          "Server-grade boards that need Fabric Manager will validate once and drop later if the service is not enabled — set it before listing.",
      },
      {
        id: "p1-s3",
        title: "Install Docker Engine",
        applies: "both",
        why: "Rentals run as containers on your node, so Docker must be installed, running and reachable without errors before anything else touches it. Lium's own setup script (next step) adds the NVIDIA Container Toolkit and Sysbox on top of a working Docker.",
        commands: [
          "# Official Docker Engine install (docs.docker.com/engine/install/ubuntu)",
          "curl -fsSL https://get.docker.com | sudo sh",
          "sudo systemctl enable --now docker",
          "docker --version",
        ],
        verify: ["docker --version prints a version", "sudo docker run --rm hello-world succeeds"],
      },
      {
        id: "p1-s4",
        title: "Install Sysbox + NVIDIA Container Toolkit (one command)",
        applies: "both",
        why: "Sysbox is the secure container runtime Lium requires — every validator check expects a Sysbox-isolated runtime. Lium ships a single script that installs the NVIDIA Container Toolkit and Sysbox together on a working Docker host. Run exactly this from the official lium-io repo; do not hand-roll versions.",
        commands: [
          "curl -fsSL https://raw.githubusercontent.com/Datura-ai/lium-io/main/neurons/executor/nvidia_docker_sysbox_setup.sh | sudo bash",
        ],
        links: [{ label: "Sysbox reference", href: SETUP_LINKS.sysbox }],
        gotcha:
          "If this script fails, fix Docker first and re-run it — a node without Sysbox is never listed.",
      },
      {
        id: "p1-s5",
        title: "Prove the GPU works inside a Sysbox container",
        applies: "both",
        why: "This is the exact check the platform runs. If this command prints your GPU inside the container, your node will see hardware the same way renters' pods will. If it fails here, it fails validation — fix it before touching the portal.",
        commands: [
          "docker run --rm --runtime=sysbox-runc --gpus all daturaai/compute-subnet-executor:latest nvidia-smi",
        ],
        verify: ["nvidia-smi output printed from inside the container"],
      },
      {
        id: "p1-s6",
        title: "Open the network: ports, public IP, bandwidth",
        applies: "both",
        why: "The validator connects to your node service on 8080 and its SSH on 2200, and measures your download speed (≥100 Mbit/s required). Renters also need at least 3 ports of your renting range reachable from the internet (20000 and up by default) or the node fails with INSUFFICIENT_PORTS. Cloud machines: open these in the security group, not just ufw.",
        commands: [
          "# from ANOTHER machine (not the node):",
          "nc -vz -w 5 <node-ip> 8080",
          "nc -vz -w 5 <node-ip> 2200",
          "curl -s https://speed.cloudflare.com/__down?bytes=100000000 > /dev/null   # rough downlink check",
        ],
        verify: [
          "Both nc checks report succeeded (open)",
          "Download measures comfortably above 100 Mbit/s",
          "Public IP reaches the node from outside your LAN",
        ],
        gotcha:
          "Behind NAT? Map the public port to the internal one in the node .env (SSH_PUBLIC_PORT / RENTING_PORT_MAPPINGS). Set one, never both of the renting variants.",
      },
      {
        id: "p1-s7",
        title: "Check RAM and disk against the idle-pay bar",
        applies: "both",
        why: "Minimums are 8 GB RAM and 150 GB disk (140 GB free before the first install — images take ~100 GB). The idle-pay bar is stricter: total disk must be at least 1.5× your total GPU VRAM. A 5090 (32 GB) needs ≥48 GB — trivial; an 8× H200 node (1,128 GB VRAM) needs ≥1.7 TB or the idle stream pays nothing.",
        commands: ["free -h", "df -h /", "nvidia-smi --query-gpu=memory.total --format=csv"],
        verify: ["Disk ≥ 1.5 × total VRAM if you want idle pay"],
        links: [{ label: "Docker storage on a big disk", href: SETUP_LINKS.dockerStorage }],
      },
    ],
  },
  {
    id: "phase-2",
    n: 2,
    title: "Wallet: coldkey, hotkey, Subnet 51 registration",
    outcome: "A funded coldkey off-server, a registered hotkey with a UID on SN51, and that hotkey in a browser extension.",
    steps: [
      {
        id: "p2-s1",
        title: "Install the Bittensor CLI (btcli)",
        applies: "alpha",
        why: "btcli creates and registers wallets. Install it on your own workstation, NOT on the GPU server — the coldkey that holds your funds must never live on a machine that renters can reach.",
        commands: [
          "pip install bittensor",
          "btcli --version",
        ],
        links: [{ label: "Bittensor wallet docs", href: SETUP_LINKS.bittensorWallets }],
        gotcha:
          "Coldkey on the GPU host is the classic self-inflicted wound: renters get container root inside Sysbox. Generate keys on a separate machine and keep the mnemonic offline.",
      },
      {
        id: "p2-s2",
        title: "Create the coldkey and the hotkey",
        applies: "alpha",
        why: "The coldkey holds TAO and signs registration transactions; the hotkey is the public work identity the node uses and where incentive lands. Names are arbitrary — pick something you'll recognize in a wallet list a year from now. Back up both mnemonics on paper, offline.",
        commands: [
          "btcli wallet new_coldkey --wallet.name lium-provider",
          "btcli wallet new_hotkey --wallet.name lium-provider --wallet.hotkey gpu-node-1",
          "btcli wallet overview --wallet.name lium-provider   # shows both addresses",
        ],
        verify: [
          "overview lists the coldkey with its balance and the hotkey address",
          "Both mnemonics written down offline",
        ],
      },
      {
        id: "p2-s3",
        title: "Fund the coldkey with TAO (registration fee + headroom)",
        applies: "alpha",
        why: "Registering a hotkey on Subnet 51 costs a recycle fee that floats with demand — it is burned, not paid to anyone. Check the live number, send the TAO to your coldkey, and keep a little headroom for fees. This is the only money step on Path B before earnings start.",
        commands: [
          "# send TAO to your coldkey address from your exchange/wallet, then:",
          "btcli wallet balance --wallet.name lium-provider",
        ],
        verify: ["Balance on the coldkey covers the live registration fee + fees"],
        links: [{ label: "Live SN51 registration fee", href: SETUP_LINKS.registrationFee }],
        gotcha:
          "The fee is dynamic. Check it at registration time — a screenshot from last week tells you nothing.",
      },
      {
        id: "p2-s4",
        title: "Register the hotkey on Subnet 51",
        applies: "alpha",
        why: "This single transaction puts your hotkey on SN51's metagraph with a UID. From then on validators can see your node and pay incentive to this hotkey. Registration is open on SN51 (no validator gate on the register call itself).",
        commands: [
          "btcli subnet register --netuid 51 --wallet.name lium-provider --wallet.hotkey gpu-node-1",
          "btcli wallet overview --wallet.name lium-provider   # UID column now set",
        ],
        verify: ["Transaction confirms; overview shows a UID on netuid 51"],
      },
      {
        id: "p2-s5",
        title: "Put the hotkey in a browser extension",
        applies: "alpha",
        why: "The Provider Portal signs you in by asking the extension to sign a challenge with your hotkey — no password, no key file upload. Polkadot{.js} and the Bittensor Wallet extension both work. Import the hotkey (not the coldkey) into the extension.",
        commands: [
          "# Import the HOTKEY into the extension using its JSON/mnemonic",
          "# Polkadot{.js}: https://chromewebstore.google.com/detail/polkadot%7Bjs%7D-extension/mopnmbcafieddcagagdcbnhejhlodfdd",
          "# Bittensor Wallet: https://chromewebstore.google.com/detail/bittensor-wallet/bdgmdoedahdcjmpmifafdhnffjinddgc",
        ],
        verify: ["Extension shows the hotkey's ss58 address, matching btcli overview"],
        links: [{ label: "Signature login page", href: SETUP_LINKS.signatureLogin }],
        gotcha:
          "Import the hotkey only. The extension never needs your coldkey mnemonic — don't paste it.",
      },
    ],
  },
  {
    id: "phase-3",
    n: 3,
    title: "Lium account & portal setup",
    outcome: "A signed-in portal: payout configured, Discord connected, Central Miner Server ON (Path B).",
    steps: [
      {
        id: "p3-s1",
        title: "Sign up / sign in to the Provider Portal",
        applies: "both",
        why: "Path A: sign up with email or Google at provider.lium.io/signup — this account is what gets listed and paid in USDT. Path B: sign in with the hotkey via signature login instead. The portal is where you add nodes, set prices and watch earnings either way.",
        commands: [
          "# Path A — browser: https://provider.lium.io/signup",
          "# Path B — browser: https://provider.lium.io/signature-login  (approve the signature in the extension)",
        ],
        verify: ["You are signed in and see the dashboard with Add Node available"],
        links: [
          { label: "Provider Portal", href: SETUP_LINKS.portal },
          { label: "Sign up (Path A)", href: SETUP_LINKS.portalSignup },
        ],
      },
      {
        id: "p3-s2",
        title: "Configure the payout side (rail-specific)",
        applies: "both",
        why: "Path A: add your payout address under Settings → Payout — rental earnings are paid in USDT there daily (T+2, 17:00 UTC, min $5). Path B: rental fees are paid on-chain to your coldkey and incentive to your hotkey per tempo — nothing to configure except keeping the coldkey address safe.",
        verify: [
          "Path A: payout address saved",
          "Path B: coldkey address recorded; extension shows the hotkey",
        ],
        links: [{ label: "Payouts schedule & delays", href: SETUP_LINKS.payouts }],
      },
      {
        id: "p3-s3",
        title: "Profile Settings: Central Miner Server ON (Path B)",
        applies: "alpha",
        why: "Central Miner Server is Lium's hosted coordinator that gets your node checked by the validator and listed. Leave it ON unless you deliberately run your own coordinator (an advanced setup with its own open port). With it off, no node is checked and nothing gets listed.",
        verify: ["Profile Settings → Central Miner Server → ON"],
        gotcha:
          "Self-hosting a coordinator also needs its own EXTERNAL_PORT (default 8000) open to the validator — only do this on purpose.",
      },
      {
        id: "p3-s4",
        title: "Connect Discord (both paths)",
        applies: "both",
        why: "Discord is the identity link that unlocks idle pay and the community support channel — without it, no subnet incentive and no idle-pool income, on either rail. The portal offers the connection on sign-in; it takes under a minute.",
        verify: ["Profile shows Discord connected"],
        links: [
          { label: "Connect Discord guide", href: SETUP_LINKS.discord },
          { label: "Official support & scam prevention", href: SETUP_LINKS.support },
        ],
        gotcha:
          "Only trust the official Lium Discord. Impersonators DM 'support' first — real support runs through #tickets.",
      },
    ],
  },
  {
    id: "phase-4",
    n: 4,
    title: "Install the node and get listed",
    outcome: "The one-command agent is running and the node shows AVAILABLE in the portal.",
    steps: [
      {
        id: "p4-s1",
        title: "Run the one-command install on the GPU host",
        applies: "both",
        why: "mine.sh installs, configures and self-checks the node agent, and with --register it adds the node to your signed-in portal session automatically. Run it exactly as printed by the portal's Add Node dialog — it already encodes your account and host context. When it finishes it prints the GPU type, IP, port and GPU count; note them.",
        commands: [
          "# signed in to the portal (recommended — auto-registers the node):",
          "curl -fsSL https://lium.io/mine.sh | bash -s -- --register",
          "# starting BEFORE signing in (links the host, register in portal after):",
          "curl -fsSL https://lium.io/mine.sh | bash -s -- -k",
        ],
        verify: ["Install completes and prints GPU type, IP, port and GPU count"],
        links: [{ label: "Node quickstart", href: SETUP_LINKS.nodeQuickstart }],
        gotcha:
          "Run this on the GPU host as a user with Docker rights. If you used -k, you still must add the node in the portal (next step).",
      },
      {
        id: "p4-s2",
        title: "Add the node in the portal (manual path / -k installs)",
        applies: "both",
        why: "If you installed with -k, or prefer manual control: portal → Add Node → enter GPU type, GPU count, the host's public IP, port 8080 and your price per GPU-hour. The node then appears as VALIDATION PENDING and flips to AVAILABLE once a validator check passes — usually about 5 minutes.",
        commands: [
          "# Portal → Add Node →",
          "#   GPU type: e.g. RTX 4090   GPU count: e.g. 1",
          "#   IP: <node public ip>     Port: 8080",
          "#   Price: USD per GPU-hour (see Phase 5)",
        ],
        verify: ["Node row shows AVAILABLE (after a short VALIDATION PENDING)"],
        links: [{ label: "Managing nodes & prices", href: SETUP_LINKS.managingNodes }],
      },
      {
        id: "p4-s3",
        title: "If it stays pending: debug the ports from outside",
        applies: "both",
        why: "A node stuck in VALIDATION PENDING is almost always a reachability problem: 8080 or 2200 closed from the internet, or fewer than 3 renting ports exposed (INSUFFICIENT_PORTS). Test from a different machine, fix the firewall/security group, and the next 15-minute validator pass picks it up.",
        commands: [
          "nc -vz -w 5 <node-ip> 2200",
          "nc -vz -w 5 <node-ip> 8080",
          "# both must succeed; then open ≥3 ports of the renting range (20000+)",
        ],
        verify: ["Node leaves PENDING within ~15 minutes of the port fix"],
        links: [{ label: "Troubleshooting checks", href: SETUP_LINKS.troubleshooting }],
      },
    ],
  },
  {
    id: "phase-5",
    n: 5,
    title: "Price it right — and keep the idle pay",
    outcome: "A price at or under the soft limit and every idle-pay condition green.",
    steps: [
      {
        id: "p5-s1",
        title: "Set the price at/below the soft limit (or take the market-ask trade)",
        applies: "both",
        why: "Idle hours only pay if your price is at or under the model's soft limit. Priced above it, you earn more per rented hour but the idle stream goes to zero — exactly the Market-ask toggle in the Host & Earn calculator. Start at the soft limit, watch your utilization for a couple of weeks, then decide.",
        commands: [
          "# Portal → your node → Update price (USD per GPU-hour)",
          "# soft-limit reference per model: Host & Earn table / rewards calculator",
        ],
        verify: ["Price saved and shown on the node row"],
        links: [
          { label: "Rewards calculator", href: SETUP_LINKS.rewardsCalculator },
          { label: "Managing node prices", href: SETUP_LINKS.managingNodes },
        ],
      },
      {
        id: "p5-s2",
        title: "Run the idle-pay eligibility checklist",
        applies: "both",
        why: "Idle pay is conditional, and every condition is checkable before you wait for the first payout: Discord connected, price ≤ soft limit, disk ≥ 1.5× total VRAM, 1 or 8 GPUs per node (or GPU splitting enabled), node passing the 15-minute validator checks, Secure tier, and node software up to date. Big 8-GPU H200/B200/B300/GB300 nodes additionally need GPU splitting, profiling or a confidential VM for idle pay.",
        verify: [
          "Discord connected (Profile)",
          "Price ≤ soft limit for the model",
          "Disk ≥ 1.5× total VRAM",
          "1 or 8 GPUs per node, or GPU splitting on",
          "Node passing 15-min validator checks (AVAILABLE)",
          "Secure tier (Spot nodes are excluded from idle pay)",
          "8-GPU H200/B200/B300/GB300: splitting, profiling or CVM configured",
        ],
        links: [
          { label: "GPU splitting", href: SETUP_LINKS.gpuSplitting },
          { label: "Confidential VM", href: SETUP_LINKS.cvm },
        ],
      },
      {
        id: "p5-s3",
        title: "Choose the tier honestly: Secure vs Spot",
        applies: "both",
        why: "A Secure node that drops a rental owes 48 hours of that rental's price — however short the rental was — and ALL of your rental-fee payouts go to the debt until it's paid. On an 8× H100 at $2.00/GPU-hour that is roughly $730 for one dropped rental. A machine you cannot keep stable (reboots, shared hardware, experimental drivers) belongs on Spot, which is cheaper for renters and reclaimable by you — and excluded from idle pay.",
        verify: ["Tier chosen deliberately per node in the portal"],
        links: [{ label: "Penalties — read this first", href: SETUP_LINKS.penalties }],
        gotcha:
          "Never list an unstable machine as Secure. The debt eats every future payout until cleared.",
      },
    ],
  },
  {
    id: "phase-6",
    n: 6,
    title: "Operate: updates, payouts, and the long game",
    outcome: "A node that stays listed, stays eligible, and pays out on schedule.",
    steps: [
      {
        id: "p6-s1",
        title: "Keep the node software current",
        applies: "both",
        why: "Outdated node software forfeits subnet incentive even when everything else is perfect. Updates ship through Docker Compose — pull and restart in one line. Schedule it; validators re-check every 15 minutes and will notice an out-of-date agent.",
        commands: ["docker compose pull", "docker compose up -d"],
        verify: ["Agent version current; node still AVAILABLE after restart"],
      },
      {
        id: "p6-s2",
        title: "Know your payout rhythm",
        applies: "both",
        why: "Rental fees settle daily at 17:00 UTC for the day two days earlier (T+2). Path A receives USDT (min $5, ~5% conversion fee). Path B receives rental fees on the coldkey daily and incentive on the hotkey each tempo. Idle pay rides the same rails when every Phase 5 condition holds.",
        verify: ["First payout observed within a few days of steady rentals"],
        links: [{ label: "Payouts schedule", href: SETUP_LINKS.payouts }],
      },
      {
        id: "p6-s3",
        title: "Level-ups when the basics work",
        applies: "both",
        why: "Once the first node is stable and earning: Docker storage on XFS caps each pod to the disk it rents (protects you from abusive renters); GPU splitting lets one big node serve several small renters; a confidential VM unlocks TEE-demand tiers; profiling exposes richer GPU metrics renters filter by. Each is optional and documented — add them when the economics justify them.",
        links: [
          { label: "Docker storage (XFS)", href: SETUP_LINKS.dockerStorage },
          { label: "GPU splitting", href: SETUP_LINKS.gpuSplitting },
          { label: "Confidential VM", href: SETUP_LINKS.cvm },
          { label: "GPU profiling", href: SETUP_LINKS.nodeQuickstart },
        ],
      },
      {
        id: "p6-s4",
        title: "Watch it like an operator",
        applies: "both",
        why: "The validator's 15-minute checks are your SLA: a node that flaps drops listings, idle pay and risks the Secure-node debt. Check the portal's reliability/uptime figures weekly, keep the driver and agent current, and treat any VALIDATION PENDING re-appearance as an incident, not noise.",
        verify: ["Weekly habit: reliability %, uptime, updates, payout ledger"],
      },
    ],
  },
];

// --- Progress persistence -----------------------------------------------------

const STORAGE_KEY = "lium-setup-progress-v1";

/** Load completed step ids from localStorage (client only). */
export function loadProgress(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Persist completed step ids (client only). */
export function saveProgress(done: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
  } catch {
    /* private mode — progress stays in-memory */
  }
}
