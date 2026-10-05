// GPU-options scan: which subnets suit a GPU owner (4090 / A100)?
// Ranks by net monthly USD, shows hardware class, entry odds, demand band.
import { readFileSync } from "node:fs";

async function main() {
  const users = JSON.parse(readFileSync("/home/z/my-project/scripts/users.local.json", "utf8"));
  const admin = users.find((u: any) => u.role === "admin" && u.code);
  const base = "http://localhost:3000";
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: admin.userId, code: admin.code }),
  });
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c: string) => c.split(";")[0]).join("; ");
  const res = await fetch(`${base}/api/network`, { headers: { cookie } });
  const data = await res.json();
  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const rows: any[] = mergeOpportunities(data);
  console.log("TAO $" + data.taoPriceUsd, "| block", data.blockNumber);

  // GPU-relevant subnets: needs VRAM or recommended GPU is a real GPU
  const isCpuOnly = (r: any) =>
    r.minVramGb === 0 || /cpu/i.test(r.recommendedGpu ?? "");
  const gpu = rows.filter((r) => !isCpuOnly(r) && r.status === "active");
  gpu.sort((a, b) => (b.netMonthlyUsd ?? 0) - (a.netMonthlyUsd ?? 0));

  const band = (b: string | null) =>
    b === "real-demand" ? "GREEN" : b === "mixed" ? "amber" : b === "emission-funded" ? "RED" : "—";

  console.log(`\nGPU subnets: ${gpu.length} of ${rows.length} (others are CPU-only)\n`);
  console.log("net | name | net$/mo | gpu$/mo | VRAM | demand | earn-chance | work type");
  for (const r of gpu.slice(0, 18)) {
    const ec = r.earnChance?.pct != null ? `${r.earnChance.pct}%` : "—";
    console.log(
      `SN${String(r.netuid).padStart(3)} | ${(r.subnetName ?? "").slice(0, 14).padEnd(14)} | ` +
      `${String(Math.round(r.netMonthlyUsd ?? 0)).padStart(6)} | ${String(Math.round(r.gpuCostMonthlyUsd ?? 0)).padStart(5)} | ` +
      `${String(r.minVramGb ?? "?").padStart(3)}GB | ${String(band(r.demandBand)).padEnd(5)} | ${ec.padStart(4)} | ${r.workType ?? ""}`
    );
  }

  // Best "capacity style" candidates: container/hardware sharing work
  const cap = gpu.filter((r) =>
    /hosting|inference|compute|training|capacity|render/i.test(r.workType ?? "") ||
    /container|gpu/i.test(r.costClass ?? "")
  );
  console.log(`\nCapacity-style (hardware sharing, most hands-off): ${cap.length}`);
  for (const r of cap.slice(0, 8)) {
    console.log(
      `SN${r.netuid} ${r.subnetName}: net $${Math.round(r.netMonthlyUsd ?? 0)}/mo, ` +
      `min ${r.minVramGb}GB, score ${r.score}, earnChance ${r.earnChance?.pct ?? "?"}%`
    );
  }

  // 4090-class (24GB) vs A100-class (80GB) fit
  const v24 = gpu.filter((r) => (r.minVramGb ?? 0) <= 24);
  const v80 = gpu.filter((r) => (r.minVramGb ?? 0) > 24);
  console.log(`\nFits 24GB (4090): ${v24.length} subnets | needs >24GB (A100 class): ${v80.length}`);
  const best24 = v24.slice(0, 5).map((r) => `SN${r.netuid} ${r.subnetName} $${Math.round(r.netMonthlyUsd ?? 0)}/mo`);
  console.log("best 24GB:", best24.join(" · "));
}
main().catch((e) => { console.error(e); process.exit(1); });
