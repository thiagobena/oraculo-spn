import { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { requireAdmin } from '../middlewares/authMiddleware.js';
import { UpdateUserRoleSchema } from '@oraculo/shared';

export function registerUsersRoutes(app: FastifyInstance) {
  // List Users (Admin only)
  app.get('/api/users', { preHandler: [requireAdmin] }, async (_request, reply) => {
    try {
      const users = await prisma.user.findMany({
        orderBy: { created_at: 'desc' },
      });

      return reply.send({
        success: true,
        users,
      });
    } catch (err: any) {
      app.log.error(err);
      return reply.status(500).send({
        success: false,
        error: 'Erro ao listar usuários registrados.',
      });
    }
  });

  // Update User Role & Status (Admin only)
  app.patch('/api/users/:id/role', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = UpdateUserRoleSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: parseResult.error.errors[0]?.message || 'Dados inválidos para alteração de papel.',
      });
    }

    const { role, is_active } = parseResult.data;

    try {
      const existingUser = await prisma.user.findUnique({ where: { id } });
      if (!existingUser) {
        return reply.status(404).send({
          success: false,
          error: 'Usuário não encontrado.',
        });
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: {
          role,
          ...(is_active !== undefined ? { is_active } : {}),
        },
      });

      return reply.send({
        success: true,
        user: updatedUser,
        message: `Permissão do usuário ${updatedUser.username} alterada para ${updatedUser.role}.`,
      });
    } catch (err: any) {
      app.log.error(err);
      return reply.status(500).send({
        success: false,
        error: 'Erro ao atualizar permissão do usuário.',
      });
    }
  });

  // Toggle Active Status (Admin only)
  app.patch('/api/users/:id/status', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { is_active } = (request.body as { is_active: boolean }) || {};

    if (typeof is_active !== 'boolean') {
      return reply.status(400).send({
        success: false,
        error: 'Status is_active deve ser um booleano.',
      });
    }

    try {
      const updatedUser = await prisma.user.update({
        where: { id },
        data: { is_active },
      });

      return reply.send({
        success: true,
        user: updatedUser,
        message: `Status do usuário ${updatedUser.username} alterado para ${is_active ? 'Ativo' : 'Inativo'}.`,
      });
    } catch (err: any) {
      app.log.error(err);
      return reply.status(500).send({
        success: false,
        error: 'Erro ao alterar status do usuário.',
      });
    }
  });
}
