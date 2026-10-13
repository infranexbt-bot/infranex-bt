import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const rows = await p.$queryRawUnsafe<any[]>(
  `SELECT netuid, name, description, "requirementsSource", "recommendedGpu", "minVramGb" FROM SubnetOverride WHERE netuid=82`
);
console.log("SubnetOverride SN82:", JSON.stringify(rows, null, 1));
const pb = await p.$queryRawUnsafe<any[]>(
  `SELECT netuid, subnetName, playbookName FROM SubnetPlaybook WHERE netuid=82`
);
console.log("SubnetPlaybook SN82:", JSON.stringify(pb, null, 1));
const req = await p.$queryRawUnsafe<any[]>(
  `SELECT netuid, repoUrl, "recommendedGpu" FROM SubnetRequirements WHERE netuid=82`
);
console.log("SubnetRequirements SN82:", JSON.stringify(req, null, 1));
await p.$disconnect();
