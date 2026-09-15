import type { Subnet, GPUOffer } from "../types";

/**
 * Deployment config builder.
 *
 * Takes a Bittensor subnet + a GPU offer and produces the full deployment
 * configuration: docker image, miner command, ports, env vars, cost
 * projection. This is the exact config you'd run on a real GPU server.
 */

export interface DeploymentConfig {
  subnet: {
    netuid: number;
    name: string;
    symbol: string;
    category: string;
    minVramGb: number;
    recommendedGpu: string;
  };
  gpu: {
    model: string;
    vramGb: number;
    provider: string;
    hourlyPrice: number;
    monthlyPrice: number;
    region: string;
    /** TIER4 — provider-native offer id (e.g. "vast-12345") when the offer
     *  came from a live provider pull; providers that rent BY OFFER (Vast)
     *  require it. Curated catalog offers may omit it. */
    offerId?: string;
  };
  docker: {
    imageName: string;
    /** OVERLAY-2 — how the pod image was chosen: derived from the subnet's
     *  parsed requirements, or the category fallback when no profile exists. */
    imageSource: "subnet-requirements" | "category-fallback";
    /** Base image parsed from the subnet repo's own Dockerfile (informational
     *  here — the real miner image is built in-pod from the cloned repo). */
    repoDockerfileBase: string | null;
    runtime: "nvidia";
    ports: string[];
    volumes: { path: string; sizeGb: number }[];
    envVars: { name: string; value: string; secret: boolean }[];
    command: string;
    minMemoryGb: number;
    minVcpuCount: number;
    diskGb: number;
  };
  miner: {
    network: "finney" | "test";
    netuid: number;
    walletName: string;
    hotkeyName: string;
    axonPort: number;
    prometheusPort: number;
    subtensorNetwork: string;
    extraArgs: string[];
  };
  cost: {
    hourlyUsd: number;
    monthlyUsd: number;
    estimatedMonthlyRevenueUsd: number;
    estimatedRoiPercent: number;
  };
  requirements: {
    minVramGb: number;
    pythonVersion: string;
    cudaVersion: string;
    dockerRequired: boolean;
    nvidiaRuntimeRequired: boolean;
  };
}

// Map subnet categories to miner commands + default runtime versions.
// NOTE: these are command/arg FALLBACKS only — the pod's docker image is no
// longer a category placeholder (the old "bittensor/subnet:latest"-style
// entries mostly don't exist on Docker Hub and would fail the pull).
const SUBNET_TEMPLATES: Record<
  string,
  { image: string; command: string; extraArgs: string[]; python: string; cuda: string }
> = {
  Inference: {
    image: "bittensor/subnet:latest",
    command: "python neurons/miner.py --no_auto_weights_update",
    extraArgs: ["--neuron.device", "cuda", "--neuron.num_workers", "1"],
    python: "3.10",
    cuda: "12.1",
  },
  Vision: {
    image: "bittensor/vision-subnet:latest",
    command: "python neurons/miner.py --neuron.model_name diffusion",
    extraArgs: ["--neuron.device", "cuda", "--neuron.batch_size", "4"],
    python: "3.10",
    cuda: "12.1",
  },
  Training: {
    image: "bittensor/training-subnet:latest",
    command: "python neurons/miner.py --neuron.compile",
    extraArgs: ["--neuron.device", "cuda", "--neuron.world_size", "1"],
    python: "3.10",
    cuda: "12.2",
  },
  Data: {
    image: "bittensor/data-subnet:latest",
    command: "python neurons/miner.py",
    extraArgs: ["--neuron.device", "cuda"],
    python: "3.10",
    cuda: "12.1",
  },
  default: {
    image: "bittensor/bittensor:latest",
    command: "python neurons/miner.py",
    extraArgs: ["--neuron.device", "cuda"],
    python: "3.10",
    cuda: "12.1",
  },
};

const CATEGORY_REVENUE_ESTIMATE: Record<string, number> = {
  Training: 3200,
  Vision: 2800,
  Multimodal: 3400,
  Inference: 1800,
  Data: 1200,
  Audio: 1400,
  Compute: 900,
  Science: 1600,
  Security: 1500,
  DeFi: 1100,
};

// ---------------------------------------------------------------------------
// OVERLAY-2 — requirement-derived pod image.
//
// RunPod's current deploy API carries NO runtime command override, so the pod
// image must keep itself alive (and run sshd) while the real-setup runner
// installs the subnet over SSH. A repo Dockerfile's FROM line is only a BASE
// image (usually exits immediately, no sshd) — deploying it directly would
// kill the pod before setup starts.
//
// So the pod image is selected from the official runpod/pytorch family
// (keep-alive, sshd-ready, CUDA devel toolchain) matched to the subnet's
// parsed minimum CUDA. The subnet's own Dockerfile still rules the actual
// miner image: the installer builds it in-pod (install step 5) from the
// cloned repo, and its base is surfaced in config.docker.repoDockerfileBase.
// ---------------------------------------------------------------------------

const RUNPOD_PYTORCH_IMAGES: Record<string, string> = {
  "11": "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04",
  "12": "runpod/pytorch:2.2.1-py3.10-cuda12.1.0-devel-ubuntu22.04",
};
const DEFAULT_POD_IMAGE = RUNPOD_PYTORCH_IMAGES["12"];

/** Pod image matched to the subnet's minimum CUDA requirement. */
export function resolvePodImage(cudaMinVersion?: string | null): string {
  const major = cudaMinVersion?.trim().split(".")[0];
  return (major && RUNPOD_PYTORCH_IMAGES[major]) || DEFAULT_POD_IMAGE;
}

/** The slice of the requirements profile that shapes the deployment config. */
export interface SubnetProfileHint {
  dockerImage?: string | null; // base image parsed from the repo's Dockerfile
  dockerRequired?: boolean;
  pythonVersion?: string | null;
  cudaMinVersion?: string | null;
  entrypoint?: string | null;
}

export function buildDeploymentConfig(
  subnet: Subnet,
  offer: GPUOffer,
  options?: {
    hotkey?: string;
    walletName?: string;
    network?: "finney" | "test";
    profileHint?: SubnetProfileHint | null;
  }
): DeploymentConfig {
  const template = SUBNET_TEMPLATES[subnet.category] ?? SUBNET_TEMPLATES.default;
  const hint = options?.profileHint ?? null;
  const podImage = resolvePodImage(hint?.cudaMinVersion);
  const minerEntry = hint?.entrypoint ?? "neurons/miner.py";
  const network = options?.network ?? "finney";
  const walletName = options?.walletName ?? "infranex";
  const hotkeyName = "default";
  const axonPort = 8091;
  const prometheusPort = 8092;

  const hotkey = options?.hotkey ?? "";

  const envVars = [
    { name: "BT_NETWORK", value: network, secret: false },
    { name: "BT_NETUID", value: String(subnet.netuid), secret: false },
    { name: "BT_WALLET_NAME", value: walletName, secret: false },
    { name: "BT_HOTKEY_NAME", value: hotkeyName, secret: false },
    ...(hotkey
      ? [{ name: "BT_HOTKEY_SS58", value: hotkey, secret: true }]
      : []),
    { name: "NVIDIA_VISIBLE_DEVICES", value: "all", secret: false },
    { name: "PYTHONUNBUFFERED", value: "1", secret: false },
  ];

  const command = `python ${minerEntry} \
--subtensor.network ${network} \
--netuid ${subnet.netuid} \
--wallet.name ${walletName} \
--wallet.hotkey ${hotkeyName} \
--axon.port ${axonPort} \
--logging.debug \
${template.extraArgs.join(" \\\n  ")}`;

  const monthlyUsd = offer.monthlyPrice || Math.round(offer.hourlyPrice * 730);
  const estimatedRevenue =
    CATEGORY_REVENUE_ESTIMATE[subnet.category] ?? 1500;
  const roi =
    monthlyUsd > 0
      ? Math.round(((estimatedRevenue - monthlyUsd) / monthlyUsd) * 100)
      : 0;

  return {
    subnet: {
      netuid: subnet.netuid,
      name: subnet.name,
      symbol: subnet.symbol,
      category: subnet.category,
      minVramGb: subnet.minVramGb,
      recommendedGpu: subnet.recommendedGpu,
    },
    gpu: {
      model: offer.model,
      vramGb: offer.vramGb,
      provider: offer.provider,
      hourlyPrice: offer.hourlyPrice,
      monthlyPrice: monthlyUsd,
      region: offer.region,
      offerId: offer.id,
    },
    docker: {
      imageName: podImage,
      imageSource: hint ? "subnet-requirements" : "category-fallback",
      repoDockerfileBase: hint?.dockerImage ?? null,
      runtime: "nvidia",
      ports: [`${axonPort}/http`, `${prometheusPort}/http`],
      volumes: [{ path: "/workspace", sizeGb: 100 }],
      envVars,
      command,
      minMemoryGb: Math.max(64, offer.vramGb),
      minVcpuCount: Math.max(8, Math.ceil(offer.vramGb / 8)),
      diskGb: 200,
    },
    miner: {
      network,
      netuid: subnet.netuid,
      walletName,
      hotkeyName,
      axonPort,
      prometheusPort,
      subtensorNetwork: network,
      extraArgs: template.extraArgs,
    },
    cost: {
      hourlyUsd: offer.hourlyPrice,
      monthlyUsd,
      estimatedMonthlyRevenueUsd: estimatedRevenue,
      estimatedRoiPercent: roi,
    },
    requirements: {
      minVramGb: subnet.minVramGb,
      pythonVersion: hint?.pythonVersion ?? template.python,
      cudaVersion: hint?.cudaMinVersion ?? template.cuda,
      dockerRequired: hint?.dockerRequired ?? true,
      nvidiaRuntimeRequired: true,
    },
  };
}

/** Serialize for SQLite storage. */
export function serializeConfig(cfg: DeploymentConfig): string {
  return JSON.stringify(cfg);
}

/** Deserialize from SQLite. */
export function deserializeConfig(s: string): DeploymentConfig | null {
  try {
    return JSON.parse(s) as DeploymentConfig;
  } catch {
    return null;
  }
}
