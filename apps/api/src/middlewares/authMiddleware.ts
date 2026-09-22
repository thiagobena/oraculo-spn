import { FastifyRequest, FastifyReply } from 'fastify';

export interface TokenPayload {
  id: string;
  username: string;
  display_name: string;
  role: 'USUARIO' | 'ADMINISTRADOR';
}

declare module 'fastify' {
  interface FastifyRequest {
    userPayload?: TokenPayload;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    request.userPayload = request.user as TokenPayload;
  } catch (err) {
    reply.status(401).send({
      success: false,
      error: 'Sessão inválida ou expirada. Por favor, realize o login novamente.',
    });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  if (reply.sent) return;

  if (!request.userPayload || request.userPayload.role !== 'ADMINISTRADOR') {
    reply.status(403).send({
      success: false,
      error: 'Acesso negado. Esta funcionalidade é restrita a Administradores.',
    });
  }
}
