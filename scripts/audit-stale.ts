import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const ovr = await p.subnetOverride.findMany({
    select: { netuid: true, name: true, requirementsScrapedAt: true, updatedAt: true },
    orderBy: { requirementsScrapedAt: "asc" },
  });
  const withDates = ovr.filter((o) => o.requirementsScrapedAt);
  const noDates = ovr.length - withDates.length;
  console.log(`overrides=${ovr.length} withScrapeDate=${withDates.length} noDate=${noDates}`);
  if (withDates.length) {
    console.log("OLDEST:", withDates.slice(0, 5).map((o) => `SN${o.netuid} ${o.requirementsScrapedAt?.toISOString().slice(0, 10)}`).join(" | "));
    console.log("NEWEST:", withDates.slice(-3).map((o) => `SN${o.netuid} ${o.requirementsScrapedAt?.toISOString().slice(0, 10)}`).join(" | "));
  }
  const snaps = await p.chainSnapshot.count();
  const lastSnap = await p.chainSnapshot.findFirst({ orderBy: { createdAt: "desc" } });
  console.log(`chainSnapshots=${snaps} latest=${lastSnap?.createdAt?.toISOString() ?? "none"}`);
  const workers = await p.workerStatus.findMany({ take: 10 });
  console.log("workerStatus:", workers.map((w) => `${w.worker}:${w.status}@${w.lastRunAt?.toISOString().slice(5, 16) ?? "?"}`).join(" | ") || "none");
  const upstream = await p.upstreamState.findMany({ take: 20 });
  console.log(`upstreamState rows=${upstream.length}`, upstream.slice(0, 5).map((u: any) => `${u.netuid ?? "?"}:${u.lastCheckedAt?.toISOString().slice(5, 16) ?? "?"}`).join(" | "));
  const today = new Date();
  console.log("NOW:", today.toISOString());
}
main().finally(() => p.$disconnect());
