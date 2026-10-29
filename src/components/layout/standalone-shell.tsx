"use client";

// POPOUT-1 — StandaloneShell: the full-page chrome for popped-out windows.
//
// When a menu page is opened via "Open in new window" (URL carries
// ?view=<key>&mode=full), the operator wants ONLY that page on screen —
// no sidebar, no nav menus (feedback 2026-10-30: "display only the
// opportunity page"). This shell renders a slim top bar — brand mark, the
// page's eyebrow/title, and an "Open in dashboard" escape hatch — above the
// view content at full window width. In-popout navigation still works: the
// view components receive the same onNavigate handler, so cross-page links
// switch pages inside this window (the URL keeps mode=full, see page.tsx).

import { Activity, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface StandaloneShellProps {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}

export function StandaloneShell({ title, eyebrow, children }: StandaloneShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* Ambient background — same grid + aurora glow as the dashboard so the
          popout feels like the same product, just focused. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute inset-0 grid-pattern gradient-mask-b opacity-60" />
        <div className="absolute -top-40 left-1/4 h-96 w-[560px] rounded-full bg-primary/[0.07] blur-[120px]" />
        <div className="absolute -top-24 right-0 h-80 w-96 rounded-full bg-chart-4/[0.05] blur-[110px]" />
      </div>

      <header className="sticky top-0 z-30 h-14 shrink-0 border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-full w-full max-w-[1600px] items-center gap-3 px-4 lg:px-6">
          {/* Plain anchors on purpose — the full dashboard must boot as a
              FRESH document so the popout state flag resets; a client-side
              Link would keep this window's React state (and its standalone
              mode) alive. */}
          <a
            href="/"
            className="flex items-center gap-2.5 rounded-lg px-1 py-1 transition-opacity hover:opacity-80"
            title="Open the full Infranex BT dashboard"
          >
            <span className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-primary/30 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent">
              <Activity className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            </span>
            <span className="text-display text-sm font-bold tracking-tight">
              Infranex<span className="text-gradient"> BT</span>
            </span>
          </a>

          <Separator orientation="vertical" className="h-6" />

          <div className="min-w-0">
            <p className="text-eyebrow truncate text-muted-foreground/80">{eyebrow}</p>
            <h2 className="text-display truncate text-base font-bold leading-tight">
              {title}
            </h2>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <a href="/" title="Open the complete dashboard with all menus">
                <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
                Full dashboard
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1600px] flex-1 p-4 lg:p-6" role="main">
        {children}
      </main>
    </div>
  );
}
