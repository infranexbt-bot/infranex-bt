"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { DashboardView } from "@/components/views/dashboard-view";
import { OpportunitiesView } from "@/components/views/opportunities-view";
import { SubnetsView } from "@/components/views/subnets-view";
import { JudgeView } from "@/components/views/judge-view";
import { CpuGuideView } from "@/components/views/cpu-guide-view";
import { GpusView } from "@/components/views/gpus-view";
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
import type { Opportunity, ViewKey } from "@/lib/infranex/types";

const VIEW_META: Record<
  ViewKey,
  { title: string; eyebrow: string }
> = {
  dashboard: { title: "Network Intelligence", eyebrow: "Section · 01 · Dashboard" },
  opportunities: { title: "Opportunities", eyebrow: "Section · 02 · Scoring" },
  subnets: { title: "Subnets", eyebrow: "Section · 03 · Chain explorer" },
  judge: { title: "Judge Lab", eyebrow: "Section · 04 · Judge intelligence" },
  "cpu-guide": { title: "CPU Guide", eyebrow: "Section · 05 · Harnyx SN67 mining path" },
  gpus: { title: "GPU Catalog", eyebrow: "Section · 06 · Infrastructure" },
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

export default function Home() {
  const [view, setView] = useState<ViewKey>("dashboard");
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  return (
    <DashboardLayout
      current={view}
      onNavigate={setView}
      title={meta.title}
      eyebrow={meta.eyebrow}
    >
      {view === "dashboard" && (
        <DashboardView
          onSelectOpportunity={handleSelect}
          onStartMining={handleStartMining}
          onNavigate={setView}
        />
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
      {view === "gpus" && (
        <GpusView
          onProvision={(offerId) => {
            setView("deployments");
            setDeployPreselect({ offerId });
          }}
        />
      )}
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
      />
    </DashboardLayout>
  );
}
