// MINER-FIT — the personal advisor engine. Takes the live opportunities list
// plus a 4-question profile (skill / budget / hardware / time) and returns an
// honest shortlist: who fits, who is a stretch, and who is excluded — always
// with plain-English reasons. Pure functions, client-safe.
import type { Opportunity } from "./types";

export type TechLevel = "none" | "basic" | "coder";
export type BudgetTier = "lt100" | "500" | "2000plus";
export type HardwareOwned = "none" | "cpu-vps" | "gpu-24gb" | "gpu-80gb" | "gpu-140gb";
export type HoursPerWeek = "0" | "2-4" | "10";

export interface MinerFitProfile {
  techLevel: TechLevel;
  budget: BudgetTier;
  hardware: HardwareOwned;
  hoursPerWeek: HoursPerWeek;
}

export type FitVerdict = "fit" | "stretch" | "excluded";

export interface MinerFitResult {
  netuid: number;
  subnetName: string;
  subnetSymbol: string;
  appScore: number;
  fitScore: number; // 0-99, re-ranked for THIS profile
  verdict: FitVerdict;
  reasons: string[];
  blockers: string[];
  /** "What it takes" card — four plain-English lines. */
  needs: { hardware: string; capital: string; skill: string; time: string };
  monthlyNetUsd: number | null;
  entryChancePct: number | null;
  demandBand: string | null;
  riskLevel: string;
}

export interface MinerFitReport {
  profile: MinerFitProfile;
  fits: MinerFitResult[];
  stretch: MinerFitResult[];
  excludedSamples: MinerFitResult[];
  excludedCount: number;
  scanned: number;
  /** The zero-skill baseline every pick must beat. */
  stakingNote: string;
}

const BUDGET_CAP_USD: Record<BudgetTier, number> = {
  lt100: 100,
  "500": 500,
  "2000plus": Infinity,
};

const HARDWARE_MAX_VRAM: Record<HardwareOwned, number> = {
  none: 0,
  "cpu-vps": 0,
  "gpu-24gb": 24,
  "gpu-80gb": 80,
  "gpu-140gb": Infinity,
};

/** Skill-bound work = challenge/agent style. Capacity style = run-and-forget. */
function workClass(workType: string | undefined, name: string): "skill" | "capacity" | "mixed" {
  const t = `${workType ?? ""} ${name}`.toLowerCase();
  if (/challenge|agent|engineering|security|verif|coding|research|science|frontier/.test(t)) return "skill";
  if (/compute sharing|hosting|render|capacity|mining pool|storage/.test(t)) return "capacity";
  return "mixed";
}

function hardwareLine(o: Opportunity): string {
  if ((o.minVramGb ?? 0) <= 0) return "Any CPU VPS (2 cores / 8 GB is enough)";
  if ((o.minVramGb ?? 0) <= 24) return `GPU with ≥${o.minVramGb} GB VRAM (RTX 4090 class)`;
  if ((o.minVramGb ?? 0) <= 80) return `GPU with ≥${o.minVramGb} GB VRAM (A100 / H100 class)`;
  return `Multi-GPU rig, ≥${o.minVramGb} GB VRAM total (farm territory)`;
}

function capitalLine(o: Opportunity, taoPriceUsd?: number): string {
  const tao = taoPriceUsd ?? 300; // TAO/USD — registration burn & stakes are TAO-denominated
  const reg = Math.max(0.1, o.burnCostTao ?? 0.1);
  const regUsd = Math.round(reg * tao);
  const stakeUsd = Math.round((o.requiredStake ?? 0) * tao);
  const monthly =
    Math.round((o.gpuCostMonthlyUsd ?? 0) + (o.infraCostMonthlyUsd ?? 0));
  return `~0.1 TAO to register (≈$${regUsd}) · typical miner stakes ${Math.round(
    o.requiredStake ?? 0
  )} TAO (≈$${stakeUsd.toLocaleString()}, start smaller is OK) · running cost ≈$${monthly}/mo`;
}

function skillLine(o: Opportunity, cls: "skill" | "capacity" | "mixed"): string {
  if (cls === "capacity")
    return "Basic copy-paste — install once, keep it running";
  if (cls === "skill")
    return "Real coding / research skill — the bottom half of miners earn $0";
  return "Copy-paste to start, some tuning to earn well";
}

function timeLine(o: Opportunity, cls: "skill" | "capacity" | "mixed"): string {
  if (cls === "capacity") return "1–2 h/week after setup (mostly watching)";
  if (cls === "skill") return "5–15 h/week while climbing, 2–4 h/week to hold rank";
  return "2–4 h/week to stay competitive";
}

function demandLabel(band: string | null): string | null {
  if (band === "real-demand") return "real customer demand behind rewards (green)";
  if (band === "mixed") return "partly emission-funded demand (amber)";
  if (band === "emission-funded") return "rewards mostly emission-funded (red) — income can decay";
  return null;
}

export function computeMinerFit(
  opportunities: Opportunity[],
  profile: MinerFitProfile,
  taoPriceUsd?: number
): MinerFitReport {
  const results: MinerFitResult[] = [];

  for (const o of opportunities) {
    if (o.status !== "active") continue;
    const reasons: string[] = [];
    const blockers: string[] = [];
    const cls = workClass(o.workType, o.subnetName);

    // ---- Hardware gate -------------------------------------------------
    const maxVram = HARDWARE_MAX_VRAM[profile.hardware];
    const needVram = o.minVramGb ?? 0;
    if (needVram > maxVram) {
      blockers.push(
        needVram > 24
          ? `Needs ≥${needVram} GB VRAM — more than a single 4090`
          : `Needs a GPU with ≥${needVram} GB VRAM`
      );
    } else if (needVram <= 0) {
      reasons.push("CPU-only work — runs on a small VPS, no GPU needed");
    } else {
      reasons.push(`Your ${profile.hardware === "gpu-24gb" ? "4090-class" : "GPU"} rig meets the ${needVram} GB requirement`);
    }
    if (profile.hardware === "none" && needVram <= 0) {
      blockers.push("You own no hardware yet — budget ~$50/mo for a CPU VPS");
    }

    // ---- Skill gate ----------------------------------------------------
    if (cls === "skill" && profile.techLevel !== "coder") {
      blockers.push(
        profile.techLevel === "none"
          ? "Skill-bound subnet — someone on your side must be able to code"
          : "Challenging work — needs real coding effort, not just copy-paste"
      );
    } else if (cls === "capacity") {
      reasons.push("Capacity-sharing work — the most hands-off style of mining");
    } else if (cls === "mixed" && profile.techLevel === "none") {
      blockers.push("Needs some technical hands-on — not fully passive");
    }

    // ---- Monthly operating budget gate ----------------------------------
    const monthlyCost = Math.round(
      (o.gpuCostMonthlyUsd ?? 0) + (o.infraCostMonthlyUsd ?? 0)
    );
    const cap = BUDGET_CAP_USD[profile.budget];
    if (monthlyCost > cap) {
      blockers.push(`Running costs ≈$${monthlyCost}/mo — over your $${cap === Infinity ? "no-limit" : cap}/mo budget`);
    } else if (monthlyCost <= 100) {
      reasons.push(`Cheap to run — ≈$${monthlyCost}/mo all-in`);
    }

    // ---- Time gate ------------------------------------------------------
    if (profile.hoursPerWeek === "0" && cls === "skill") {
      blockers.push("This is a weekly-work job, not a passive one");
    }
    if (profile.hoursPerWeek === "0" && o.demandBand === "emission-funded") {
      blockers.push("Passive + emission-funded demand = income decays unattended");
    }

    // ---- Quality gates (app-computed) -----------------------------------
    if (o.meetsMinimum === false || o.verdict === "AVOID") {
      blockers.push("Profit engine: does not clear the minimum profit target");
    }

    // Crowded door — must be judged BEFORE the verdict, not after.
    const entryEarly = (o.earnChance?.pct ?? null) as number | null;
    if (entryEarly != null && entryEarly < 3) {
      blockers.push(`Crowded — only ${entryEarly}% entry chance, subnet full of pros`);
    }

    // ---- Fit score (re-ranked for THIS profile) --------------------------
    const entry = (o.earnChance?.pct ?? null) as number | null;
    let fit = (o.score ?? 50) * 0.55;
    fit += Math.min(28, (entry ?? 0) * 2.2); // entry odds matter most for a newcomer
    if (o.demandBand === "real-demand") fit += 9;
    else if (o.demandBand === "emission-funded") fit -= 12;
    if (o.riskLevel === "low") fit += 4;
    else if (o.riskLevel === "high") fit -= 6;
    if ((o.netMonthlyUsd ?? 0) >= 1000) fit += 5;
    const fitScore = Math.max(5, Math.min(99, Math.round(fit)));

    // ---- Verdict ---------------------------------------------------------
    const hardBlock = blockers.some(
      (b) =>
        /VRAM|GPU with|budget|code|passive|decays|profit target|no hardware/.test(b)
    );
    const softOnly = blockers.length > 0 && !hardBlock;
    const verdict: FitVerdict =
      blockers.length === 0 ? "fit" : softOnly ? "stretch" : "excluded";

    const dl = demandLabel(o.demandBand ?? null);
    if (dl) reasons.push(dl);
    if ((entry ?? 0) >= 10) reasons.push(`Open door — ${entry}% entry chance for a newcomer`);
    if ((o.netMonthlyUsd ?? 0) > 0)
      reasons.push(`Net ≈$${Math.round(o.netMonthlyUsd!).toLocaleString()}/mo modeled for a mid-pack miner`);

    results.push({
      netuid: o.netuid,
      subnetName: o.subnetName,
      subnetSymbol: o.subnetSymbol,
      appScore: o.score,
      fitScore,
      verdict,
      reasons: reasons.slice(0, 4),
      blockers: blockers.slice(0, 3),
      needs: {
        hardware: hardwareLine(o),
        capital: capitalLine(o, taoPriceUsd),
        skill: skillLine(o, cls),
        time: timeLine(o, cls),
      },
      monthlyNetUsd: o.netMonthlyUsd ?? null,
      entryChancePct: entry,
      demandBand: o.demandBand ?? null,
      riskLevel: o.riskLevel,
    });
  }

  const fits = results
    .filter((r) => r.verdict === "fit")
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, 5);
  const stretch = results
    .filter((r) => r.verdict === "stretch")
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, 4);
  const excludedAll = results
    .filter((r) => r.verdict === "excluded")
    .sort((a, b) => b.appScore - a.appScore);

  const budgetUsd = profile.budget === "lt100" ? 100 : profile.budget === "500" ? 500 : 2000;
  const stakingNote = `Zero-skill baseline: $${budgetUsd.toLocaleString()} simply staked at ~10–14%/yr ≈ $${Math.round(
    (budgetUsd * 0.12) / 12
  )}/mo. Every mining pick above must beat that — otherwise staking wins.`;

  return {
    profile,
    fits,
    stretch,
    excludedSamples: excludedAll.slice(0, 4),
    excludedCount: excludedAll.length,
    scanned: results.length,
    stakingNote,
  };
}

export const MINER_FIT_STORAGE_KEY = "infranex-miner-fit-profile";
