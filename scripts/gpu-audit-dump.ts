// GPU-AUDIT step 1 — dump what the app currently DISPLAYS for every subnet:
//  - SubnetRequirements profile (requirements dialog / deploy wizard)
//  - SubnetOverride scraped GPU values
//  - ChainSnapshot github URLs + names (for ground-truth fetches)
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const db = new PrismaClient();

async function main() {
  const snap = await db.chainSnapshot.findFirst({ orderBy: { id: "desc" } });
  const subnets = snap ? (JSON.parse(snap.subnetsJson) as any[]) : [];
  const overrides = await db.subnetOverride.findMany();
  const reqRows = await db.subnetRequirements.findMany();

  const ovrBy = new Map(overrides.map((o) => [o.netuid, o]));
  const reqBy = new Map(reqRows.map((r) => [r.netuid, r]));

  const out: any[] = [];
  for (const s of subnets) {
    const ovr = ovrBy.get(s.netuid);
    const req = reqBy.get(s.netuid);
    const profile = req ? JSON.parse(req.profileJson) : null;
    out.push({
      netuid: s.netuid,
      name: s.name ?? s.subnetName ?? null,
      github: s.identityGithub ?? null,
      display: {
        reqRecommendedGpu: profile?.recommendedGpu ?? null,
        reqMinVramGb: profile?.minVramGb ?? null,
        gpuSource: profile?.gpuSource ?? null,
        confidence: profile?.confidence ?? null,
        reqRepoUrl: profile?.repoUrl ?? null,
        fetchedAt: req?.fetchedAt ?? null,
        ovrRecommendedGpu: ovr?.recommendedGpu ?? null,
        ovrMinVramGb: ovr?.minVramGb ?? null,
        ovrGithubUrl: ovr?.githubUrl ?? null,
      },
    });
  }
  out.sort((a, b) => a.netuid - b.netuid);
  writeFileSync("/home/z/my-project/scripts/gpu-audit/current-display.json", JSON.stringify(out, null, 2));

  // console summary
  let count = 0;
  for (const r of out) {
    const d = r.display;
    if (d.reqRecommendedGpu || d.reqMinVramGb || d.ovrRecommendedGpu || d.ovrMinVramGb) {
      count++;
      console.log(
        `SN${String(r.netuid).padStart(3)} | req: ${(d.reqRecommendedGpu ?? "-").toString().padEnd(16)} vram=${String(d.reqMinVramGb ?? "-").padEnd(4)} src=${String(d.gpuSource ?? "-").padEnd(11)} conf=${String(d.confidence ?? "-").padEnd(6)} | ovr: ${(d.ovrRecommendedGpu ?? "-").toString().padEnd(16)} vram=${String(d.ovrMinVramGb ?? "-")} | ${r.name ?? ""}`
      );
    }
  }
  console.log(`\n${out.length} subnets in snapshot; ${count} have GPU data displayed; ${reqRows.length} requirements profiles cached`);
}

main().finally(() => db.$disconnect());
