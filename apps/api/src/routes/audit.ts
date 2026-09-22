import { FastifyInstance } from 'fastify';
import { AuditService } from '../services/AuditService.js';

export function registerAuditRoutes(fastify: FastifyInstance) {
  fastify.get('/api/audit', async (req, reply) => {
    const { page, limit } = req.query as { page?: string; limit?: string };
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '20', 10);

    const result = await AuditService.listLogs(limitNum, pageNum);
    return reply.send({ success: true, ...result });
  });
}
