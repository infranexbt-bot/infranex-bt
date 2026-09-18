// List tables and row counts via raw SQL
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

(async () => {
  try {
    const tables = await db.$queryRaw`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`;
    console.log('TABLES:', JSON.stringify(tables.map(t => t.name)));
    for (const t of tables) {
      if (t.name.startsWith('_prisma') || t.name.startsWith('sqlite')) continue;
      try {
        const cnt = await db.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "${t.name}"`);
        console.log(`${t.name}: ${cnt[0].c}`);
      } catch (e) {
        console.log(`${t.name}: ERR`);
      }
    }
  } catch (e) {
    console.log('ERR:', e.message);
  }
  await db.$disconnect();
})();
