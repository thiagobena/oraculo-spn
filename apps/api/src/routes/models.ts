import { FastifyInstance } from 'fastify';
import { LMStudioProvider } from '@oraculo/ai-core';
import { prisma } from '../db/prisma.js';

export function registerModelsRoutes(fastify: FastifyInstance, provider: LMStudioProvider) {
  fastify.get('/api/models', async (_req, reply) => {
    try {
      const models = await provider.listModels();

      const generations = await prisma.generation.findMany({
        where: { error: null },
        take: 300,
        orderBy: { started_at: 'desc' },
      });

      const statsMap = new Map<string, { durationSum: number; tpsSum: number; count: number }>();
      for (const g of generations) {
        if (!g.model) continue;
        const current = statsMap.get(g.model) || { durationSum: 0, tpsSum: 0, count: 0 };
        if (g.duration_ms) current.durationSum += g.duration_ms;
        if (g.tokens_per_second) current.tpsSum += g.tokens_per_second;
        current.count += 1;
        statsMap.set(g.model, current);
      }

      const enrichedModels = models.map((m) => {
        const stats = statsMap.get(m.key);
        if (stats && stats.count > 0) {
          return {
            ...m,
            avg_duration_ms: Math.round(stats.durationSum / stats.count),
            avg_tokens_per_second: parseFloat((stats.tpsSum / stats.count).toFixed(1)),
          };
        }
        return m;
      });

      return reply.send({
        success: true,
        count: enrichedModels.length,
        models: enrichedModels,
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: error.message || 'Falha ao obter lista de modelos do LM Studio',
      });
    }
  });

  fastify.get('/api/models/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    const model = await provider.getModel(decodeURIComponent(key));
    if (!model) {
      return reply.status(404).send({ success: false, error: 'Modelo não encontrado' });
    }
    return reply.send({ success: true, model });
  });
}
