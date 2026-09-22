import { PrismaClient } from '@prisma/client';

console.log('Testing SQL Server Database Connection via Prisma...');

const prisma = new PrismaClient();

async function testDB() {
  try {
    await prisma.$connect();
    console.log('[✓] Successfully connected to SQL Server Database!');

    const settings = await prisma.appSetting.findMany();
    console.log(`[✓] AppSetting table readable (${settings.length} items found).`);

    const assistants = await prisma.assistant.findMany();
    console.log(`[✓] Assistant table readable (${assistants.length} items found).`);
  } catch (err: any) {
    console.error('[✗] Database connection error:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testDB();
