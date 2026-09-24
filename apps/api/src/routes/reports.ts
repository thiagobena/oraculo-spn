import { FastifyInstance } from 'fastify';
import { SchedulerService } from '../services/SchedulerService.js';

export async function reportRoutes(app: FastifyInstance) {
  // 1. Obter status e lista de agendamentos
  app.get('/schedules', async (request, reply) => {
    try {
      const jobs = SchedulerService.getJobs();
      return reply.send({ success: true, jobs });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 2. Atualizar configuração de um agendamento
  app.patch('/schedules/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;
      const updated = SchedulerService.updateJob(id, body);
      return reply.send({ success: true, job: updated });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 3. Disparo Manual / Imediato de um Relatório Executivo
  app.post('/trigger', async (request, reply) => {
    try {
      const { type = 'morning_digest', webhook_url } = request.body as any;
      const result = await SchedulerService.triggerReport(type, webhook_url);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 4. Gerar prévia do Resumo Executivo em Markdown
  app.get('/preview', async (request, reply) => {
    try {
      const { type = 'morning_digest' } = request.query as any;
      const report = await SchedulerService.generateReport(type);
      return reply.send({ success: true, report });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
