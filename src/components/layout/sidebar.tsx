"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useNetwork } from "@/hooks/use-network";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  TrendingUp,
  Network,
  Cpu,
  Coins,
  BarChart3,
  Activity,
  X,
  AlertTriangle,
  Rocket,
  Gauge,
  Wand2,
  Gavel,
  Radar,
  ShieldCheck,
  BookOpen,
  ListChecks,
  Layers,
  Server,
  UserCheck,
  Target,
  DollarSign,
  Brain,
  Crosshair,
} from "lucide-react";
import type { ViewKey } from "@/lib/infranex/types";

/**
 * Workflow order — the operator journey through the platform:
 *   Intelligence: analyze the chain → pick what to mine.
 *   Operations:   rent GPU (Catalog) → deploy (Deployments) → run autonomously
 *                 (DevOps Engine) → track fleet (My Miners) → watch costs
 *                 (Monitoring) → tune (Optimization).
 *   Platform:     cross-cutting analytics + system health.
 * Hints renumber sequentially along that journey.
 */
const NAV_GROUPS: { label: string; items: { key: ViewKey; label: string; icon: typeof LayoutDashboard; hint: string }[] }[] = [
  {
    label: "Wealth Engines",
    items: [
      { key: "invest", label: "Invest Engine", icon: Brain, hint: "00c" },
      { key: "earn", label: "Earn Engine", icon: DollarSign, hint: "00b" },
      { key: "capture", label: "Capture Desk", icon: Crosshair, hint: "00d" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, hint: "01" },
      { key: "fit", label: "Miner Fit", icon: UserCheck, hint: "01b" },
      { key: "opportunities", label: "Opportunities", icon: TrendingUp, hint: "02" },
      { key: "subnets", label: "Subnets", icon: Network, hint: "03" },
      { key: "judge", label: "Validator Lab", icon: Gavel, hint: "04" },
      { key: "cpu-guide", label: "CPU Guide", icon: ListChecks, hint: "05" },
      { key: "gpu-landscape", label: "GPU Landscape", icon: Layers, hint: "05b" },
      { key: "miner-playbook", label: "Miner Playbook", icon: Target, hint: "05c" },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "gpus", label: "GPU Catalog", icon: Cpu, hint: "06" },
      { key: "cpus", label: "CPU Catalog", icon: Server, hint: "06b" },
      { key: "deployments", label: "Deployments", icon: Rocket, hint: "07" },
      { key: "devops", label: "DevOps Engine", icon: Radar, hint: "08" },
      { key: "miners", label: "My Miners", icon: Coins, hint: "09" },
      { key: "monitoring", label: "Monitoring", icon: Gauge, hint: "10" },
      { key: "optimization", label: "Optimization", icon: Wand2, hint: "11" },
    ],
  },
  {
    label: "Platform",
    items: [
      { key: "analytics", label: "Analytics", icon: BarChart3, hint: "12" },
      { key: "system", label: "System & Errors", icon: AlertTriangle, hint: "13" },
      { key: "runbook", label: "Runbook", icon: BookOpen, hint: "14" },
    ],
  },
];

interface SidebarProps {
  current: ViewKey;
  onNavigate: (v: ViewKey) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

/** ADMINPANEL-1 — the Access Control entry exists only for role === "admin". */
function adminNavGroups(isAdmin: boolean) {
  if (!isAdmin) return [];
  return [
    {
      label: "Administration",
      items: [
        { key: "admin" as ViewKey, label: "Access Control", icon: ShieldCheck, hint: "15" },
      ],
    },
  ];
}

export function Sidebar({
  current,
  onNavigate,
  mobileOpen,
  onMobileOpenChange,
}: SidebarProps) {
  // Same queryKey the header uses — one request, shared cache.
  const { data: session } = useQuery<{ user: { role?: string } }>({
    queryKey: ["auth-session"],
    queryFn: async () => {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (!res.ok) throw new Error("not signed in");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const isAdmin = session?.user?.role === "admin";
  const navGroups = [...NAV_GROUPS, ...adminNavGroups(isAdmin)];

  const handleNav = (v: ViewKey) => {
    onNavigate(v);
    onMobileOpenChange(false);
  };

  const NavList = (
    <nav className="flex flex-col gap-5" aria-label="Primary">
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="text-eyebrow px-3 pb-2 text-muted-foreground/60">
            {group.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = current === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => handleNav(item.key)}
                  className={cn("sidebar-link group", active && "active")}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
                      active ? "text-primary" : "text-muted-foreground/70"
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-left">{item.label}</span>
                  <span className="mono text-[10px] tabular text-muted-foreground/50 transition-colors group-hover:text-muted-foreground">
                    {item.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop — SIDEBAR-SCROLL-1: native scroll region so every nav option
          stays reachable on short viewports (18 entries + footer card exceed
          100vh). min-h-0 constrains the flex item; overscroll-contain stops the
          wheel from chaining to the page once the list ends. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-hidden border-r bg-sidebar lg:flex">
        <SidebarBrand />
        <div className="custom-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="px-3 py-5">
            {NavList}
            <div className="my-5 px-1">
              <div className="editorial-rule" />
            </div>
            <SidebarFooter />
          </div>
        </div>
      </aside>

      {/* Mobile */}
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="flex w-72 flex-col border-r bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <SheetDescription className="sr-only">
            Primary navigation for the Infranex BT dashboard
          </SheetDescription>
          <div className="flex items-center justify-between pr-4">
            <SidebarBrand />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onMobileOpenChange(false)}
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {/* SIDEBAR-SCROLL-1 — same native scroll contract as desktop; the
              Sheet body is now a flex column so flex-1 actually constrains it. */}
          <div className="custom-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="px-3 py-5">
              {NavList}
              <div className="my-5 px-1">
                <div className="editorial-rule" />
              </div>
              <SidebarFooter />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function SidebarBrand() {
  return (
    <div className="flex h-16 items-center gap-3 border-b px-5">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-primary/30 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.25)]">
        <Activity className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary glow-soft" aria-hidden="true" />
      </div>
      <div className="leading-none">
        <p className="text-display text-[15px] font-bold tracking-tight">
          Infranex
          <span className="text-gradient"> BT</span>
        </p>
        <p className="mono mt-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          subnet intelligence
        </p>
      </div>
    </div>
  );
}

function SidebarFooter() {
  const { data } = useNetwork();
  const isLive = data?.source === "live";
  const block = data?.blockNumber ?? 0;
  const totalSubnets = data?.totalSubnets ?? 0;
  return (
    <div className="mt-auto px-1 pt-2 pb-4">
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card/50 p-3.5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.07] via-transparent to-transparent" aria-hidden="true" />
        <div className="relative flex items-center gap-2">
          <span
            className={
              isLive
                ? "pulse-dot text-success"
                : "h-2 w-2 rounded-full bg-warning"
            }
          />
          <span className="text-eyebrow text-foreground/90">
            {isLive ? "Chain synced" : "Syncing…"}
          </span>
        </div>
        <p className="relative mt-2 text-xs text-muted-foreground">
          Finney · block{" "}
          <span className="mono tabular text-foreground/90">
            {block > 0 ? block.toLocaleString() : "—"}
          </span>
        </p>
        <div className="relative mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular">{totalSubnets > 0 ? `${totalSubnets} subnets` : "—"}</span>
          <span className="mono tabular font-medium text-success">
            {data?.taoPriceUsd ? `$${data.taoPriceUsd.toFixed(2)}` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
