import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export async function checkDatabaseConnection(): Promise<{ is_online: boolean; latency_ms: number | null; error?: string }> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      is_online: true,
      latency_ms: Date.now() - start,
    };
  } catch (err: any) {
    return {
      is_online: false,
      latency_ms: null,
      error: err.message || 'Falha de conexão com SQL Server',
    };
  }
}
