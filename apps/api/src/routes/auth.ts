import { FastifyInstance } from 'fastify';
import { LoginSchema } from '@oraculo/shared';
import { AuthService } from '../services/AuthService.js';
import { LdapService } from '../services/LdapService.js';
import { authenticate } from '../middlewares/authMiddleware.js';

export function registerAuthRoutes(app: FastifyInstance) {
  // Autocomplete / Search Users Endpoint (Busca inteligente a partir do 3º dígito)
  app.get('/api/auth/search-users', async (request, reply) => {
    const { q } = (request.query as { q?: string }) || {};
    if (!q || q.trim().length < 3) {
      return reply.send({ success: true, users: [] });
    }

    try {
      const users = await LdapService.searchUsers(q);
      return reply.send({
        success: true,
        users,
      });
    } catch (err: any) {
      app.log.error(err);
      return reply.send({ success: true, users: [] });
    }
  });

  // Login Endpoint
  app.post('/api/auth/login', async (request, reply) => {
    const parseResult = LoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: parseResult.error.errors[0]?.message || 'Dados de login inválidos.',
      });
    }

    const { username, password } = parseResult.data;

    try {
      const user = await AuthService.login(username, password);

      // Gerar Token JWT com payload contendo id, username e role
      const token = app.jwt.sign(
        {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          role: user.role,
        },
        { expiresIn: '24h' }
      );

      return reply.send({
        success: true,
        token,
        user,
      });
    } catch (err: any) {
      app.log.error(err);
      return reply.status(401).send({
        success: false,
        error: err.message || 'Falha ao autenticar no Active Directory.',
      });
    }
  });

  // Me / Profile Endpoint
  app.get('/api/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const payload = request.userPayload!;
    const user = await AuthService.getUserById(payload.id);

    if (!user || !user.is_active) {
      return reply.status(401).send({
        success: false,
        error: 'Usuário não encontrado ou inativo.',
      });
    }

    return reply.send({
      success: true,
      user,
    });
  });

  // Logout Endpoint
  app.post('/api/auth/logout', async (_request, reply) => {
    return reply.send({
      success: true,
      message: 'Logout realizado com sucesso.',
    });
  });
}

