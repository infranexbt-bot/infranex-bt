"use client";

import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StandaloneShell } from "@/components/layout/standalone-shell";
import { DashboardView } from "@/components/views/dashboard-view";
import { FitView } from "@/components/views/fit-view";
import { OpportunitiesView } from "@/components/views/opportunities-view";
import { SubnetsView } from "@/components/views/subnets-view";
import { JudgeView } from "@/components/views/judge-view";
import { CpuGuideView } from "@/components/views/cpu-guide-view";
import { GpuLandscapeView } from "@/components/views/gpu-landscape-view";
import { MinerPlaybookView } from "@/components/views/miner-playbook-view";
import { SmartFrameworkView } from "@/components/views/smart-framework-view";
import { HostEarnView } from "@/components/views/host-earn-view";
import { LiumSetupView } from "@/components/views/lium-setup-view";
import { GpusView } from "@/components/views/gpus-view";
import { CpusView } from "@/components/views/cpus-view";
import { MinersView } from "@/components/views/miners-view";
import { DeploymentsView } from "@/components/views/deployments-view";
import { DevopsView } from "@/components/views/devops-view";
import { MonitoringView } from "@/components/views/monitoring-view";
import { OptimizationView } from "@/components/views/optimization-view";
import { AnalyticsView } from "@/components/views/analytics-view";
import { SystemView } from "@/components/views/system-view";
import { RunbookView } from "@/components/views/runbook-view";
import { AdminView } from "@/components/views/admin-view";
import { OpportunityDetailDialog } from "@/components/cards/opportunity-detail";
import { setDeployPreselect } from "@/components/deployments/deploy-preselect";
import { POPOUT_MODE_PARAM } from "@/lib/popout";
import type { Opportunity, ViewKey } from "@/lib/infranex/types";

const VIEW_META: Record<
  ViewKey,
  { title: string; eyebrow: string }
> = {
  dashboard: { title: "Network Intelligence", eyebrow: "Section · 01 · Dashboard" },
  fit: { title: "Miner Fit", eyebrow: "Section · 01b · Personal advisor" },
  opportunities: { title: "Opportunities", eyebrow: "Section · 02 · Scoring" },
  subnets: { title: "Subnets", eyebrow: "Section · 03 · Chain explorer" },
  judge: { title: "Validator Lab", eyebrow: "Section · 04 · Validator intelligence" },
  "cpu-guide": { title: "CPU Guide", eyebrow: "Section · 05 · Harnyx SN67 mining path" },
  "gpu-landscape": { title: "GPU Landscape", eyebrow: "Section · 05b · GPU class requirements" },
  "miner-playbook": { title: "Miner Playbook", eyebrow: "Section · 05c · How to win each subnet" },
  "smart-framework": { title: "SMART Framework", eyebrow: "Section · 05f · Operator goal engine" },
  "host-earn": { title: "Host & Earn", eyebrow: "Section · 05d · SN51 lium.io provider path" },
  "lium-setup": { title: "Setup Guide", eyebrow: "Section · 05e · GPU → SN51 provider onboarding" },
  gpus: { title: "GPU Catalog", eyebrow: "Section · 06 · Infrastructure" },
  cpus: { title: "CPU Catalog", eyebrow: "Section · 06b · CPU infrastructure" },
  miners: { title: "My Miners", eyebrow: "Section · 09 · Portfolio" },
  deployments: { title: "Deployments", eyebrow: "Section · 07 · Deployment engine" },
  devops: { title: "DevOps Engine", eyebrow: "Section · 08 · Live operations" },
  monitoring: { title: "Monitoring", eyebrow: "Section · 10 · Monitoring engine" },
  optimization: { title: "Optimization", eyebrow: "Section · 11 · Optimization engine" },
  analytics: { title: "Analytics", eyebrow: "Section · 12 · Trends" },
  system: { title: "System & Errors", eyebrow: "Section · 13 · Diagnostics" },
  runbook: { title: "Runbook", eyebrow: "Section · 14 · Operator reference" },
  admin: { title: "Access Control", eyebrow: "Section · 15 · Administration" },
};

// POPOUT-1 — runtime guard for the ?view= deep link. VIEW_META is a
// Record<ViewKey, …>, so its keys are exactly the legal view ids.
const VIEW_KEYS = Object.keys(VIEW_META) as ViewKey[];

function readViewParam(): ViewKey | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("view");
  return raw && VIEW_KEYS.includes(raw as ViewKey) ? (raw as ViewKey) : null;
}

// POPOUT-1 — standalone flag: ?mode=full next to a valid ?view= means this
// window was opened via "Open in new window" and must show ONLY the page
// content (no sidebar/menus). The main app never carries mode=full, so its
// own /?view= deep links keep the full shell.
function readPopoutMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get("mode") === POPOUT_MODE_PARAM
  );
}

export default function Home() {
  const [view, setView] = useState<ViewKey>("dashboard");
  const [popout, setPopout] = useState(false);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // POPOUT-1 — deep-link boot: /?view=opportunities&mode=full (built by the
  // sidebar's "open in new window" action and the header pop-out button)
  // lands directly on that page in standalone mode — only the page content,
  // no sidebar. Plain /?view= (main-app deep link) keeps the full shell. The
  // server renders the dashboard and this effect swaps before first data
  // paint, so there is no hydration mismatch; unknown or missing params
  // simply keep the dashboard.
  // Microtask deferral mirrors Header's AUTH-1 pattern — the
  // react-hooks/set-state-in-effect rule forbids synchronous setState here.
  useEffect(() => {
    void Promise.resolve().then(() => {
      const fromUrl = readViewParam();
      if (fromUrl) {
        setView(fromUrl);
        setPopout(readPopoutMode());
      }
    });
  }, []);

  // Keep the URL glued to the active view (and the popout flag) so every
  // page is bookmarkable, reload-safe and copyable into a new window.
  // replaceState (not push) — view switches are navigation within one
  // screen, not history spam.
  const syncedOnce = useRef(false);
  useEffect(() => {
    // Skip the mount pass: it would momentarily overwrite a ?view= deep link
    // with ?view=dashboard before the boot effect above swaps the view.
    if (!syncedOnce.current) {
      syncedOnce.current = true;
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    if (popout) url.searchParams.set("mode", POPOUT_MODE_PARAM);
    else url.searchParams.delete("mode");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [view, popout]);

  // FLOW-1 — ONE deploy flow: the inline 4-step stepper on the Deployments
  // page. Every entry point (opportunity "Start mining", GPU catalog
  // "Provision") lands on Deployments and preseeds the stepper with its
  // context, so the whole platform follows one linear flow:
  //   choose subnet → pick GPU → rent & auto-install → register & connect.
  const handleStartMining = (o: Opportunity) => {
    setView("deployments");
    setDeployPreselect({ netuid: o.netuid });
  };

  const handleSelect = (o: Opportunity) => {
    setSelected(o);
    setDialogOpen(true);
  };

  const meta = VIEW_META[view];

  // POPOUT-1 — the view stage is identical in both shells; only the chrome
  // differs. Standalone mode (popout) wraps it in StandaloneShell — page
  // content only, no sidebar/menus; the main window keeps DashboardLayout.
  const viewStage = (
    <>
      {view === "dashboard" && (
        <DashboardView
          onSelectOpportunity={handleSelect}
          onStartMining={handleStartMining}
          onNavigate={setView}
        />
      )}
      { view === "fit" && (
        <FitView onSelectOpportunity={handleSelect} onStartMining={handleStartMining} />
      )}
      {view === "opportunities" && (
        <OpportunitiesView
          onSelectOpportunity={handleSelect}
          onStartMining={handleStartMining}
        />
      )}
      {view === "subnets" && <SubnetsView />}
      {view === "judge" && <JudgeView />}
      {view === "cpu-guide" && <CpuGuideView onNavigate={setView} />}
      {view === "gpu-landscape" && <GpuLandscapeView />}
      {view === "miner-playbook" && <MinerPlaybookView />}
      {view === "smart-framework" && <SmartFrameworkView />}
      {view === "host-earn" && <HostEarnView onNavigate={setView} />}
      {view === "lium-setup" && <LiumSetupView onNavigate={setView} />}
      {view === "gpus" && (
        <GpusView
          onProvision={(offerId) => {
            setView("deployments");
            setDeployPreselect({ offerId });
          }}
        />
      )}
      {view === "cpus" && <CpusView onNavigate={setView} />}
      {view === "miners" && <MinersView onNavigate={setView} />}
      {view === "deployments" && <DeploymentsView />}
      {view === "devops" && <DevopsView onNavigate={setView} />}
      {view === "monitoring" && <MonitoringView onNavigate={setView} />}
      {view === "optimization" && <OptimizationView onNavigate={setView} />}
      {view === "analytics" && <AnalyticsView />}
      {view === "system" && <SystemView onNavigate={setView} />}
      {view === "runbook" && <RunbookView onNavigate={setView} />}
      {view === "admin" && <AdminView />}

      <OpportunityDetailDialog
        opportunity={selected}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onProvision={() => {
          if (!selected) return;
          setDialogOpen(false);
          setView("deployments");
          setDeployPreselect({ netuid: selected.netuid });
        }}
      />
    </>
  );

  if (popout) {
    return (
      <StandaloneShell title={meta.title} eyebrow={meta.eyebrow}>
        {viewStage}
      </StandaloneShell>
    );
  }

  return (
    <DashboardLayout
      current={view}
      onNavigate={setView}
      title={meta.title}
      eyebrow={meta.eyebrow}
    >
      {viewStage}
    </DashboardLayout>
  );
}
