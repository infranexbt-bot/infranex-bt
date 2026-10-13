import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const ovr = await p.subnetOverride.findMany({ select: { netuid: true, name: true } , orderBy: { netuid: 'asc' }});
console.log("override count:", ovr.length, "| has 82:", ovr.some(r=>r.netuid===82));
console.log("netuids missing 80-105:", ovr.filter(r=>r.netuid>=80&&r.netuid<=105).map(r=>r.netuid).join(","));
// example CPU-only rows to learn the conventions (SN61 = top CPU subnet)
const cpuEx = await p.subnetOverride.findFirst({ where: { netuid: 61 } });
console.log("SN61 override:", JSON.stringify(cpuEx, null, 1).slice(0, 900));
const pb = await p.subnetPlaybook.findFirst({ where: { netuid: 82 } });
console.log("SN82 playbook:", JSON.stringify(pb, null, 1)?.slice(0, 700));
const pb61 = await p.subnetPlaybook.findFirst({ where: { netuid: 61 } });
console.log("SN61 playbook keys:", pb61 ? Object.keys(pb61).join(",") : "none");
await p.$disconnect();
