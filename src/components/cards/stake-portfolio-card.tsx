"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Wallet, TrendingUp, TrendingDown, Info, ExternalLink, RefreshCw } from "lucide-react";
import { useStakePortfolio, type HotkeyPortfolio } from "@/lib/infranex/use-stake-portfolio";
import { cn, formatCurrency, shortAddress } from "@/lib/utils";

// STAKE-PORTFOLIO-1 — read-only view of where mining rewards actually land:
// staked alpha on the hotkey (this card) and free TAO on the coldkey (the
// destination of a btcli unstake). Answers the two operator questions
// without leaving the platform.

function fmtAlpha(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (n >= 1) return n.toFixed(3);
  if (n > 0) return n.toFixed(6);
  return "0";
}

function fmtTao(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (n > 0) return n.toFixed(4);
  return "0";
}

function Drift24h({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground">—</span>;
  const up = pct >= 0;
  return (
    <span className={cn("inline-flex items-center gap-1", up ? "text-success" : "text-destructive")}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

function HotkeySection({ hk, taoPriceUsd }: { hk: HotkeyPortfolio; taoPriceUsd: number }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/30 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{hk.label ?? "Miner hotkey"}</p>
            {hk.linkedDeployments > 0 ? (
              <Badge variant="outline" className="mono text-[10px]">
                {hk.linkedDeployments} deployment{hk.linkedDeployments === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {hk.positions.length === 0 ? (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                no alpha staked yet
              </Badge>
            ) : null}
          </div>
          <p className="mono mt-1 text-xs text-muted-foreground" title={hk.hotkey}>
            hk {shortAddress(hk.hotkey, 10, 8)}
            {hk.coldkey ? (
              <span className="ml-2" title={hk.coldkey}>
                → cold {shortAddress(hk.coldkey, 6, 6)}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex gap-5 text-sm">
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Staked alpha (TAO value)</p>
            <p className="tabular font-medium">
              {fmtTao(hk.stakedTao)}{" "}
              <span className="text-xs font-normal text-muted-foreground">TAO</span>
            </p>
            <p className="tabular text-[10px] text-muted-foreground">
              ≈ {formatCurrency(hk.stakedUsd)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Coldkey free TAO</p>
            <p className="tabular font-medium">
              {hk.coldFreeTao != null ? fmtTao(hk.coldFreeTao) : "—"}
              <span className="text-xs font-normal text-muted-foreground"> TAO</span>
            </p>
            <p className="tabular text-[10px] text-muted-foreground">
              {hk.coldFreeTao != null ? `≈ ${formatCurrency(hk.coldFreeTao * taoPriceUsd)}` : "n/a"}
            </p>
          </div>
        </div>
      </div>

      {hk.positions.length > 0 ? (
        <div className="mt-3">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 text-[11px]">Subnet</TableHead>
                <TableHead className="h-8 text-right text-[11px]">α staked</TableHead>
                <TableHead className="h-8 text-right text-[11px]">α/TAO spot</TableHead>
                <TableHead className="h-8 text-right text-[11px]">TAO value</TableHead>
                <TableHead className="h-8 text-right text-[11px]">USD</TableHead>
                <TableHead className="h-8 text-right text-[11px]">24h</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hk.positions.map((p) => (
                <TableRow key={p.netuid} className="hover:bg-transparent">
                  <TableCell className="py-1.5">
                    <span className="mono text-[11px] text-muted-foreground">α{p.netuid}</span>{" "}
                    <span className="text-sm">{p.subnetName ?? `Subnet ${p.netuid}`}</span>
                  </TableCell>
                  <TableCell className="py-1.5 text-right tabular">{fmtAlpha(p.alpha)}</TableCell>
                  <TableCell className="py-1.5 text-right tabular text-muted-foreground">
                    {p.alphaPriceTao > 0 ? p.alphaPriceTao.toFixed(4) : "—"}
                  </TableCell>
                  <TableCell className="py-1.5 text-right tabular">{fmtTao(p.taoEquivalent)}</TableCell>
                  <TableCell className="py-1.5 text-right tabular text-muted-foreground">
                    {formatCurrency(p.usd)}
                  </TableCell>
                  <TableCell className="py-1.5 text-right tabular text-xs">
                    <Drift24h pct={p.alphaChange24hPct} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Nothing credited to this hotkey yet. Mining rewards accrue automatically as
          staked alpha once validators start paying your UID — check back after the first
          paid epochs.
        </p>
      )}

      {hk.lifetimeEarnedTao > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Platform-measured lifetime earnings for this hotkey:{" "}
          <span className="tabular text-foreground">{hk.lifetimeEarnedTao.toFixed(4)} TAO</span>{" "}
          (≈ {formatCurrency(hk.lifetimeEarnedUsd)}) from the EarningsDaily sampler.
        </p>
      ) : null}
    </div>
  );
}

const PAYOUT_STEPS = [
  {
    title: "1 · Mining rewards land on the hotkey as staked alpha",
    body: "Subnet emission is paid to your miner UID every epoch and credited as the subnet's alpha token, already staked on the hotkey — there is nothing to claim. It shows up in this card, in btcli wallet overview, and on taostats.io's wallet page for your hotkey address.",
  },
  {
    title: "2 · Unstake converts alpha → TAO onto the coldkey",
    body: "Run btcli stake remove (or unstake in a wallet app): the hotkey's alpha sells back into the subnet's liquidity pool at the current rate and the TAO arrives in the coldkey's free balance — the “Coldkey free TAO” figure in this card. Convert on a subnet with a deep pool to limit price impact.",
  },
];

export function StakePortfolioCard() {
  const { data, isLoading, isError, error, refetch, isFetching } = useStakePortfolio();

  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-display flex items-center gap-2 text-xl">
            <Wallet className="h-4 w-4 text-primary" />
            Stake Portfolio
            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
              read-only · live chain
            </Badge>
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Where your mining rewards land: alpha staked on each hotkey, its TAO value at
            the pool rate, and the free TAO on your coldkey.
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-muted-foreground"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading hotkey stakes from Finney…
          </div>
        ) : isError || !data ? (
          <div className="py-6 text-sm text-muted-foreground">
            Could not read the chain right now
            {error instanceof Error ? ` — ${error.message}` : ""}. Retry in a moment.
          </div>
        ) : data.hotkeys.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Wallet className="h-8 w-8 text-muted-foreground/50" />
            <p className="font-medium">No hotkeys to follow yet</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              The portfolio follows the hotkeys registered with the platform — wallet
              profiles and deployed miners. Register a wallet or deploy your first miner
              and this card starts tracking its alpha automatically.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border/40 bg-background/40 p-3">
                <p className="text-[11px] text-muted-foreground">Staked alpha (all hotkeys)</p>
                <p className="tabular mt-1 text-lg font-semibold">
                  {fmtTao(data.totals.stakedTao)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    TAO ≈ {formatCurrency(data.totals.stakedUsd)}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  across {data.totals.subnetsTouched} subnet{data.totals.subnetsTouched === 1 ? "" : "s"}
                </p>
              </div>
              <div className="rounded-lg border border-border/40 bg-background/40 p-3">
                <p className="text-[11px] text-muted-foreground">Free TAO on coldkeys</p>
                <p className="tabular mt-1 text-lg font-semibold">
                  {fmtTao(data.totals.coldFreeTao)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">TAO</span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  spendable now — where unstakes land
                </p>
              </div>
              <div className="rounded-lg border border-border/40 bg-background/40 p-3">
                <p className="text-[11px] text-muted-foreground">Lifetime mined (platform)</p>
                <p className="tabular mt-1 text-lg font-semibold">
                  {data.totals.lifetimeEarnedTao.toFixed(4)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    TAO ≈ {formatCurrency(data.totals.lifetimeEarnedUsd)}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">EarningsDaily rollup</p>
              </div>
            </div>

            {data.hotkeys.map((hk) => (
              <HotkeySection key={hk.hotkey} hk={hk} taoPriceUsd={data.taoPriceUsd} />
            ))}

            {data.invalidHotkeys.length > 0 ? (
              <p className="text-xs text-destructive">
                Skipped {data.invalidHotkeys.length} invalid address
                {data.invalidHotkeys.length === 1 ? "" : "es"}:{" "}
                {data.invalidHotkeys.map((h) => shortAddress(h, 6, 4)).join(", ")}
              </p>
            ) : null}

            <div className="rounded-lg border border-dashed border-border/50 bg-background/30 p-4">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Info className="h-4 w-4 text-primary" />
                How payouts work
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {PAYOUT_STEPS.map((s) => (
                  <div key={s.title}>
                    <p className="text-xs font-medium text-foreground/90">{s.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Verify outside the platform any time:{" "}
                <code className="rounded bg-muted px-1 py-0.5">btcli wallet overview</code>{" "}
                shows hotkey stakes per subnet,{" "}
                <code className="rounded bg-muted px-1 py-0.5">btcli wallet balance</code>{" "}
                shows the coldkey's free TAO. taostats.io's wallet page mirrors both —
                just paste the SS58 address.
                <a
                  className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
                  href="https://taostats.io"
                  target="_blank"
                  rel="noreferrer"
                >
                  taostats.io <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>

            {data.notes.length > 0 ? (
              <ul className="space-y-1">
                {data.notes.map((n, i) => (
                  <li key={i} className="text-[11px] leading-relaxed text-muted-foreground">
                    · {n}
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="text-[11px] text-muted-foreground">
              Chain block {data.blockNumber?.toLocaleString() ?? "—"} · TAO{" "}
              {formatCurrency(data.taoPriceUsd)} · read-only — this card never signs or
              moves funds.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
