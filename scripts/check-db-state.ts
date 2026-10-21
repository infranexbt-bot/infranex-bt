import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const main = async () => {
  const [users, snap, plays, ovs] = await Promise.all([
    db.appUser.count(),
    db.chainSnapshot.count(),
    db.subnetPlaybook.count(),
    db.subnetOverride.count(),
  ]);
  console.log(`AppUser=${users} ChainSnapshot=${snap} SubnetPlaybook=${plays} SubnetOverride=${ovs}`);
};
main().finally(() => db.$disconnect());
