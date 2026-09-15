import { getChainApi, fetchLiveSnapshot } from "./chain";
import { SS58_RE } from "./runway";

// ---------------------------------------------------------------------------
// STAKE-PORTFOLIO-1 — read-only on-chain stake portfolio.
//
// Answers two operator questions with live Finney data and zero secrets:
//
//   Q1  "My GPU miner started — where do the earned alpha tokens show up?"
//        → Mining rewards are credited to the HOTKEY as staked alpha on the
//          subnet being mined. This module reads SubtensorModule.
//          TotalHotkeyAlpha(hotkey, netuid) directly — the same numbers
//          `btcli wallet overview` / taostats show, without leaving the
//          platform.
//
//   Q2  "How does alpha become spendable TAO?"
//        → Unstaking (btcli stake remove / unstake) sells the hotkey's alpha
//          back into the subnet's liquidity pool at the pool price and
//          credits TAO to the COLDKEY's free balance. This module reports
//          the spot rate (subnet moving price) and the coldkey free balance
//          so the operator can watch both ends of that conversion.
//
// READ-ONLY by design: every query is a storage read; nothing is signed,
// submitted, or stored. Wallet secrets never enter the platform (see
// WALLET-ECON-1 in api/wallets).
//
// Units: the chain stores stake in rao (1e9 = 1 whole token) for both TAO
// and alpha; this module returns HUMAN units. Alpha→TAO conversion uses the
// subnet's moving price — the pool SPOT rate. An actual unstake realizes
// slightly less (pool impact + fee); the UI labels this estimate honestly.
// ---------------------------------------------------------------------------

const RAO = 1e9;

export interface StakePosition {
  netuid: number;
  subnetName: string | null;
  /** Alpha held by the hotkey on this subnet (human units). */
  alpha: number;
  /** Pool spot rate: TAO received per 1 alpha if unstaked now (moving price). */
  alphaPriceTao: number;
  taoEquivalent: number;
  usd: number;
  /** Pool price 24h drift, % — same signal as the Opportunities view. */
  alphaChange24hPct: number | null;
}

export interface HotkeyPortfolio {
  hotkey: string;
  /** Coldkey that owns the hotkey (from SubtensorModule.Owner) — unstake
   *  payouts land in THIS account's free balance. */
  coldkey: string | null;
  /** Wallet profile label when the hotkey is registered in the platform. */
  label: string | null;
  /** Subnet alpha positions, largest TAO value first. */
  positions: StakePosition[];
  /** Σ position taoEquivalent — what the miner's rewards are worth now. */
  stakedTao: number;
  stakedUsd: number;
  /** Spendable TAO already sitting on the coldkey (post-unstake destination). */
  coldFreeTao: number | null;
  coldReservedTao: number | null;
  /** Platform-measured lifetime earnings (EarningsDaily rollup) for this hotkey. */
  lifetimeEarnedTao: number;
  lifetimeEarnedUsd: number;
  /** Deployments bound to this hotkey in the platform. */
  linkedDeployments: number;
}

export interface StakePortfolioReport {
  blockNumber: number | null;
  fetchedAt: string;
  taoPriceUsd: number;
  hotkeys: HotkeyPortfolio[];
  totals: {
    stakedTao: number;
    stakedUsd: number;
    coldFreeTao: number;
    lifetimeEarnedTao: number;
    lifetimeEarnedUsd: number;
    /** Distinct subnets the portfolio holds alpha on. */
    subnetsTouched: number;
  };
  /** Hotkeys skipped because they are not valid SS58 strings. */
  invalidHotkeys: string[];
  notes: string[];
  source: "live" | "partial" | "error";
  error?: string;
}

// --- Pure aggregation (unit-testable without any network) -------------------

export interface RawPosition {
  netuid: number;
  /** Raw on-chain alpha amount (rao, string-able). */
  rawAlpha: string;
  /** Pool spot rate in TAO per alpha (human units). */
  alphaPriceTao: number;
  alphaChange24hPct: number | null;
  subnetName: string | null;
}

function round(n: number, places = 6): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** Build one hotkey's portfolio from raw chain inputs. Pure. */
export function buildHotkeyPortfolio(input: {
  hotkey: string;
  coldkey: string | null;
  rawPositions: RawPosition[];
  taoPriceUsd: number;
  coldFreeTao?: number | null;
  coldReservedTao?: number | null;
  label?: string | null;
  lifetimeEarnedTao?: number;
  lifetimeEarnedUsd?: number;
  linkedDeployments?: number;
}): HotkeyPortfolio {
  const positions: StakePosition[] = input.rawPositions
    .map((p) => {
      const alpha = round(Number(String(p.rawAlpha).replace(/[^0-9.-]/g, "")) / RAO);
      const price = Number.isFinite(p.alphaPriceTao) ? p.alphaPriceTao : 0;
      const taoEquivalent = round(alpha * price);
      return {
        netuid: p.netuid,
        subnetName: p.subnetName,
        alpha,
        alphaPriceTao: price,
        taoEquivalent,
        usd: round(taoEquivalent * (input.taoPriceUsd || 0), 4),
        alphaChange24hPct: p.alphaChange24hPct,
      };
    })
    // Zero-alpha rows are noise for a mining hotkey — a position only exists
    // once the chain has credited something (or a stake was placed).
    .filter((p) => p.alpha > 0)
    .sort((a, b) => b.taoEquivalent - a.taoEquivalent);

  const stakedTao = round(positions.reduce((a, p) => a + p.taoEquivalent, 0));
  return {
    hotkey: input.hotkey,
    coldkey: input.coldkey,
    label: input.label ?? null,
    positions,
    stakedTao,
    stakedUsd: round(stakedTao * (input.taoPriceUsd || 0), 4),
    coldFreeTao: input.coldFreeTao ?? null,
    coldReservedTao: input.coldReservedTao ?? null,
    lifetimeEarnedTao: round(input.lifetimeEarnedTao ?? 0),
    lifetimeEarnedUsd: round(input.lifetimeEarnedUsd ?? 0, 4),
    linkedDeployments: input.linkedDeployments ?? 0,
  };
}

// --- Chain reader ------------------------------------------------------------

interface ChainAlphaRow {
  hotkey: string;
  netuid: number;
  rawAlpha: string;
}

async function multiMap(map: unknown, keys: unknown[]): Promise<unknown[]> {
  const m = map as { multi?: (k: unknown[]) => Promise<unknown[]> } | undefined;
  if (!m?.multi) return keys.map(() => null);
  try {
    return (await m.multi(keys)) as unknown[];
  } catch {
    return keys.map(() => null);
  }
}

/** Read the raw value of a scalar/optional storage entry as a string. */
function rawString(v: unknown): string {
  if (v == null) return "0";
  const anyV = v as { value?: unknown; inner?: unknown; toString?: () => string; isEmpty?: boolean; isSome?: boolean };
  if (typeof anyV.isSome === "boolean" && !anyV.isSome) return "0";
  const val = anyV.value ?? anyV.inner ?? v;
  return String(val ?? "0");
}

/**
 * Fetch live stake portfolios for the given hotkeys. All reads are
 * unauthenticated chain storage queries — no signing, no secrets.
 */
export async function fetchStakePortfolio(
  hotkeysInput: string[],
  opts?: { metadata?: Map<string, { label?: string | null; lifetimeEarnedTao?: number; lifetimeEarnedUsd?: number; linkedDeployments?: number }> }
): Promise<StakePortfolioReport> {
  const invalid = hotkeysInput.filter((h) => !SS58_RE.test(h));
  const hotkeys = [...new Set(hotkeysInput.filter((h) => SS58_RE.test(h)))];

  const empty: StakePortfolioReport = {
    blockNumber: null,
    fetchedAt: new Date().toISOString(),
    taoPriceUsd: 0,
    hotkeys: [],
    totals: { stakedTao: 0, stakedUsd: 0, coldFreeTao: 0, lifetimeEarnedTao: 0, lifetimeEarnedUsd: 0, subnetsTouched: 0 },
    invalidHotkeys: invalid,
    notes: [],
    source: hotkeys.length === 0 ? "error" : "error",
  };
  if (hotkeys.length === 0) {
    empty.error = "No valid SS58 hotkeys supplied.";
    return empty;
  }

  const notes: string[] = [];
  try {
    // Snapshot supplies: netuid list, subnet names, pool spot prices, 24h
    // drift and the TAO USD price — 60s-cached by chain.ts, so this adds no
    // extra chain load.
    const snap = await fetchLiveSnapshot();
    const subnetById = new Map(
      snap.subnets.map((s) => [s.netuid, s])
    );
    const totalSubnets = Math.max(snap.totalSubnets, ...snap.subnets.map((s) => s.netuid + 1));
    const netuids = Array.from({ length: Math.min(totalSubnets, 300) }, (_, i) => i);

    const api = await getChainApi();
    const header = await api.rpc.chain.getHeader();
    const blockNumber = header.number.toNumber();

    // 1. Per-hotkey alpha across ALL subnets — TotalHotkeyAlpha is a
    //    double map (hotkey, netuid) → u64(rao). One .multi per chunk.
    const alphaRows: ChainAlphaRow[] = [];
    const chunk = 50;
    for (const hk of hotkeys) {
      for (let i = 0; i < netuids.length; i += chunk) {
        const keys = netuids.slice(i, i + chunk).map((n) => [hk, n]);
        const rows = await multiMap(api.query.subtensorModule.totalHotkeyAlpha, keys);
        rows.forEach((r, j) => {
          const raw = rawString(r);
          if (raw && raw !== "0") {
            alphaRows.push({ hotkey: hk, netuid: keys[j][1] as number, rawAlpha: raw });
          }
        });
      }
    }

    // 2. Hotkey → coldkey owner.
    const ownerArr = await multiMap(api.query.subtensorModule.owner, hotkeys);
    const ownerByHotkey = new Map<string, string | null>();
    ownerArr.forEach((o, j) => {
      const s = o ? String((o as { value?: unknown; inner?: unknown }).value ?? (o as unknown) ?? "") : "";
      const cold = s.startsWith("5") && SS58_RE.test(s) ? s : null;
      ownerByHotkey.set(hotkeys[j], cold);
    });

    // 3. Coldkey free/reserved balances (unstake payouts land here).
    const coldkeys = [...new Set([...ownerByHotkey.values()].filter((c): c is string => !!c))];
    const balanceByCold = new Map<string, { free: number; reserved: number }>();
    if (coldkeys.length > 0) {
      const accs = await multiMap(api.query.system.account, coldkeys);
      accs.forEach((a, j) => {
        const data = (a as { data?: { free?: unknown; reserved?: unknown } } | null)?.data;
        const toHuman = (v: unknown) => {
          const s = String(v ?? "0").replace(/[^0-9]/g, "");
          const n = Number(s) / RAO;
          return Number.isFinite(n) ? n : 0;
        };
        balanceByCold.set(coldkeys[j], { free: toHuman(data?.free), reserved: toHuman(data?.reserved) });
      });
    }

    // 4. Assemble.
    const taoPriceUsd = snap.taoPriceUsd || 0;
    const hotkeyPortfolios = hotkeys.map((hk) => {
      const meta = opts?.metadata?.get(hk) ?? {};
      const cold = ownerByHotkey.get(hk) ?? null;
      const bal = cold ? balanceByCold.get(cold) : undefined;
      const rows = alphaRows.filter((r) => r.hotkey === hk);
      const portfolio = buildHotkeyPortfolio({
        hotkey: hk,
        coldkey: cold,
        rawPositions: rows.map((r) => {
          const s = subnetById.get(r.netuid);
          return {
            netuid: r.netuid,
            rawAlpha: r.rawAlpha,
            alphaPriceTao: s?.movingPrice ?? 0,
            alphaChange24hPct: s?.alphaPriceChange24h ?? null,
            subnetName: s?.name ?? `Subnet ${r.netuid}`,
          };
        }),
        taoPriceUsd,
        coldFreeTao: bal?.free ?? null,
        coldReservedTao: bal?.reserved ?? null,
        label: meta.label ?? null,
        lifetimeEarnedTao: meta.lifetimeEarnedTao ?? 0,
        lifetimeEarnedUsd: meta.lifetimeEarnedUsd ?? 0,
        linkedDeployments: meta.linkedDeployments ?? 0,
      });
      return portfolio;
    });

    const totals = {
      stakedTao: round(hotkeyPortfolios.reduce((a, h) => a + h.stakedTao, 0)),
      stakedUsd: round(hotkeyPortfolios.reduce((a, h) => a + h.stakedUsd, 0), 4),
      coldFreeTao: round(hotkeyPortfolios.reduce((a, h) => a + (h.coldFreeTao ?? 0), 0)),
      lifetimeEarnedTao: round(hotkeyPortfolios.reduce((a, h) => a + h.lifetimeEarnedTao, 0)),
      lifetimeEarnedUsd: round(hotkeyPortfolios.reduce((a, h) => a + h.lifetimeEarnedUsd, 0), 4),
      subnetsTouched: new Set(
        hotkeyPortfolios.flatMap((h) => h.positions.map((p) => p.netuid))
      ).size,
    };

    notes.push(
      "Alpha shown is staked on the hotkey — mining rewards accrue here automatically; nothing to claim."
    );
    notes.push(
      "TAO equivalents use each subnet's pool spot price. A real unstake (btcli stake remove) realizes the rate at execution minus pool impact — thin pools move the price."
    );
    if (snap.source !== "live") {
      notes.push(`Snapshot source is "${snap.source}" — price data may be slightly stale.`);
    }
    if (invalid.length > 0) {
      notes.push(`${invalid.length} supplied address${invalid.length === 1 ? " was" : "es were"} not valid SS58 hotkeys and ${invalid.length === 1 ? "was" : "were"} skipped.`);
    }

    return {
      blockNumber,
      fetchedAt: new Date().toISOString(),
      taoPriceUsd,
      hotkeys: hotkeyPortfolios,
      totals,
      invalidHotkeys: invalid,
      notes,
      source: snap.source === "live" ? "live" : "partial",
    };
  } catch (e) {
    return {
      ...empty,
      fetchedAt: new Date().toISOString(),
      source: "error",
      error: e instanceof Error ? e.message : "Chain read failed.",
    };
  }
}
