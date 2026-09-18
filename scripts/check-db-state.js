// Quick DB state check after environment restore
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

(async () => {
  try {
    const users = await db.appUser.count();
    console.log('AppUsers:', users);
    const usersList = await db.appUser.findMany({ select: { userId: true, role: true } });
    console.log('Users:', JSON.stringify(usersList));
  } catch (e) {
    console.log('appUser ERR:', e.message);
  }
  try {
    const keys = await db.providerKey.findMany({ select: { provider: true, label: true, keyType: true } });
    console.log('ProviderKeys:', JSON.stringify(keys));
  } catch (e) {
    console.log('providerKey ERR:', e.message);
  }
  try {
    const hosts = await db.gpuHost ? await db.gpuHost.count() : null;
    console.log('GpuHosts:', hosts);
  } catch (e) {
    console.log('gpuHost ERR:', e.message);
  }
  await db.$disconnect();
})();
