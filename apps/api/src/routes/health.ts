import { FastifyInstance } from 'fastify';
import { checkDatabaseConnection } from '../db/prisma.js';
import { LMStudioProvider } from '@oraculo/ai-core';

export function registerHealthRoutes(fastify: FastifyInstance, provider: LMStudioProvider) {
  const handleHealth = async (_req: any, reply: any) => {
    const dbHealth = await checkDatabaseConnection();
    const lmHealth = await provider.healthCheck();

    const isHealthy = dbHealth.is_online && lmHealth.is_online;

    return reply.status(200).send({
      status: isHealthy ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      services: {
        api: { status: 'ONLINE' },
        database: {
          status: dbHealth.is_online ? 'ONLINE' : 'OFFLINE',
          latency_ms: dbHealth.latency_ms,
          error: dbHealth.error,
        },
        lm_studio: {
          status: lmHealth.is_online ? 'ONLINE' : 'OFFLINE',
          latency_ms: lmHealth.latency_ms,
          base_url: lmHealth.base_url,
          error: lmHealth.error,
        },
      },
    });
  };

  fastify.get('/api/health', handleHealth);
  fastify.get('/api/v1/health', handleHealth);
}
