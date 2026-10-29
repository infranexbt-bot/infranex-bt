"use client";

// POPOUT-2 — content-only chrome for popped-out pages.
//
// A popout window (/?view=<key>) shows ONE thing: the page itself. No
// sidebar, no nav groups, no footer — that is the whole point of popping a
// page out (e.g. Opportunities docked on a second monitor). This shell wraps
// the view in the bare minimum that keeps it recognizable and escape-able:
//
//   [ brand mark | eyebrow + page title .................. [Open full app] ]
//   [                      the view at full width                        ]
//
// "Open full app" is a same-tab client navigation to "/" — the full dashboard
// takes over the window (session cookie is shared, so no re-auth). The slim
// header reuses the dashboard's exact type scale and the same ambient
// background so the popout feels like the same product, just undressed.

import { Activity, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StandaloneShellProps {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}

export function StandaloneShell({ title, eyebrow, children }: StandaloneShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* Same ambient layer as DashboardLayout — grid + aurora glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute inset-0 grid-pattern gradient-mask-b opacity-60" />
        <div className="absolute -top-40 left-1/4 h-96 w-[560px] rounded-full bg-primary/[0.07] blur-[120px]" />
        <div className="absolute -top-24 right-0 h-80 w-96 rounded-full bg-chart-4/[0.05] blur-[110px]" />
      </div>

      <header
        className="sticky top-0 z-30 h-14 border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60"
        aria-label="Standalone page header"
      >
        <div className="flex h-full items-center justify-between gap-3 px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.25)]"
              aria-hidden="true"
            >
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-eyebrow truncate text-muted-foreground/80">{eyebrow}</p>
              <h1 className="text-display truncate text-base font-bold leading-tight">
                {title}
              </h1>
            </div>
          </div>

          {/* POPOUT-2 — a PLAIN anchor, deliberately not <Link>: this must be a
              full document load. Client-side nav would reuse the mounted Home
              instance, whose boot effect already consumed the original ?view=
              params — the page would keep rendering standalone under a "/"
              URL. A hard load re-runs the boot logic against the clean URL and
              restores the full dashboard with all menus. */}
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <a href="/" aria-label="Open the full dashboard with all menus">
              <LayoutDashboard className="mr-2 h-4 w-4" aria-hidden="true" />
              Open full app
            </a>
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1400px] flex-1 p-4 lg:p-8" role="main">
        {children}
      </main>
    </div>
  );
}
