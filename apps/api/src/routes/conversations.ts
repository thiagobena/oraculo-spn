import { FastifyInstance } from 'fastify';
import { CreateConversationSchema, UpdateConversationSchema, FolderSchema } from '@oraculo/shared';
import { ConversationService } from '../services/ConversationService.js';
import { prisma } from '../db/prisma.js';
import { AuditService } from '../services/AuditService.js';

export function registerConversationsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/conversations', async (req, reply) => {
    const { client_id, folder_id, search } = req.query as {
      client_id?: string;
      folder_id?: string;
      search?: string;
    };
    const conversations = await ConversationService.listConversations(client_id, folder_id, search);
    return reply.send({ success: true, conversations });
  });

  fastify.post('/api/conversations', async (req, reply) => {
    const parseResult = CreateConversationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ success: false, errors: parseResult.error.format() });
    }

    const conversation = await ConversationService.createConversation(parseResult.data);

    AuditService.log({
      clientId: parseResult.data.client_id,
      clientName: parseResult.data.client_name,
      action: 'conversation.created',
      conversationId: conversation.id,
    });

    return reply.send({ success: true, conversation });
  });

  fastify.get('/api/conversations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const conversation = await ConversationService.getConversation(id);
    if (!conversation) {
      return reply.status(404).send({ success: false, error: 'Conversa não encontrada' });
    }
    return reply.send({ success: true, conversation });
  });

  fastify.patch('/api/conversations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parseResult = UpdateConversationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ success: false, errors: parseResult.error.format() });
    }

    const conversation = await ConversationService.updateConversation(id, parseResult.data);
    return reply.send({ success: true, conversation });
  });

  fastify.delete('/api/conversations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { client_id, client_name } = req.query as { client_id?: string; client_name?: string };

    await ConversationService.deleteConversation(id);

    if (client_id && client_name) {
      AuditService.log({
        clientId: client_id,
        clientName: client_name,
        action: 'conversation.deleted',
        conversationId: id,
      });
    }

    return reply.send({ success: true, message: 'Conversa excluída com sucesso' });
  });

  fastify.get('/api/folders', async (req, reply) => {
    const { client_id } = req.query as { client_id?: string };
    const folders = await prisma.conversationFolder.findMany({
      where: client_id ? { created_by_client: client_id } : undefined,
      orderBy: { position: 'asc' },
    });
    return reply.send({ success: true, folders });
  });

  fastify.post('/api/folders', async (req, reply) => {
    const parseResult = FolderSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ success: false, errors: parseResult.error.format() });
    }

    const folder = await prisma.conversationFolder.create({
      data: {
        name: parseResult.data.name,
        color: parseResult.data.color,
        icon: parseResult.data.icon,
        position: parseResult.data.position,
        created_by_client: parseResult.data.client_id,
      },
    });

    return reply.send({ success: true, folder });
  });
}
