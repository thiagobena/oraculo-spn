import { FastifyInstance } from 'fastify';
import { CreateAssistantSchema, UpdateAssistantSchema } from '@oraculo/shared';
import { prisma } from '../db/prisma.js';

export function registerAssistantsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/assistants', async (_req, reply) => {
    const assistants = await prisma.assistant.findMany({
      orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
    });
    return reply.send({ success: true, assistants });
  });

  fastify.post('/api/assistants', async (req, reply) => {
    const parseResult = CreateAssistantSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ success: false, errors: parseResult.error.format() });
    }

    const assistant = await prisma.assistant.create({
      data: parseResult.data,
    });

    return reply.send({ success: true, assistant });
  });

  fastify.get('/api/assistants/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const assistant = await prisma.assistant.findUnique({ where: { id } });
    if (!assistant) {
      return reply.status(404).send({ success: false, error: 'Assistente não encontrado' });
    }
    return reply.send({ success: true, assistant });
  });

  fastify.patch('/api/assistants/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parseResult = UpdateAssistantSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ success: false, errors: parseResult.error.format() });
    }

    const assistant = await prisma.assistant.update({
      where: { id },
      data: parseResult.data,
    });

    return reply.send({ success: true, assistant });
  });

  fastify.delete('/api/assistants/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.assistant.delete({ where: { id } });
    return reply.send({ success: true, message: 'Assistente removido' });
  });
}
