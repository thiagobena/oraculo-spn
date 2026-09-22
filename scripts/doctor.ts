import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

async function runDoctor() {
  console.log('--------------------------------------------------');
  console.log('  ORÁCULO SPN - System Doctor & Environment Check');
  console.log('--------------------------------------------------');

  let okCount = 0;
  let failCount = 0;

  // Check Node version
  const nodeVer = process.version;
  console.log(`[✓] Node.js Runtime: ${nodeVer}`);
  okCount++;

  // Check Database Connection
  const prisma = new PrismaClient();
  try {
    const startTime = Date.now();
    await prisma.$connect();
    const dbLatency = Date.now() - startTime;
    console.log(`[✓] SQL Server Connection (${process.env.SQL_SERVER_HOST || 'localhost'}): OK (${dbLatency}ms)`);
    okCount++;

    const settingCount = await prisma.appSetting.count();
    console.log(`    - Database: ${process.env.SQL_SERVER_DATABASE || 'oraculo_spn'}`);
    console.log(`    - Tables verified (${settingCount} system settings found)`);
  } catch (err: any) {
    console.log(`[✗] SQL Server Connection FAILED: ${err.message}`);
    failCount++;
  } finally {
    await prisma.$disconnect();
  }

  // Check LM Studio Connectivity
  const lmStudioUrl = process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234';
  const token = process.env.LM_STUDIO_API_TOKEN;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const startTime = Date.now();
    const res = await fetch(`${lmStudioUrl}/v1/models`, { headers });
    const lmLatency = Date.now() - startTime;

    if (res.ok) {
      const data = (await res.json()) as any;
      console.log(`[✓] LM Studio API (${lmStudioUrl}): OK (${lmLatency}ms)`);
      console.log(`    - Models available: ${data.data?.length ?? 0}`);
      if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        data.data.forEach((m: any) => {
          console.log(`      * ${m.id}`);
        });
      }
      okCount++;
    } else {
      console.log(`[!] LM Studio responded with HTTP status ${res.status}`);
      failCount++;
    }
  } catch (err: any) {
    console.log(`[!] LM Studio Connection (${lmStudioUrl}): Offline or not reachable (${err.message})`);
  }

  console.log('--------------------------------------------------');
  console.log(`Doctor Summary: ${okCount} Passed, ${failCount} Warning(s)/Error(s)`);
  console.log('--------------------------------------------------');
}

runDoctor();
