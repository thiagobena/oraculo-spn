import fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyWebsocket from '@fastify/websocket';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import { LMStudioProvider } from '@oraculo/ai-core';
import { prisma } from './db/prisma.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerModelsRoutes } from './routes/models.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerConversationsRoutes } from './routes/conversations.js';
import { registerAssistantsRoutes } from './routes/assistants.js';
import { registerFilesRoutes } from './routes/files.js';
import { registerTelemetryRoutes } from './routes/telemetry.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerDatabaseRoutes } from './routes/databases.js';
import { reportRoutes } from './routes/reports.js';
import { messagingRoutes } from './routes/messaging.js';
import { SchedulerService } from './services/SchedulerService.js';

import fastifyJwt from '@fastify/jwt';
import { registerAuthRoutes } from './routes/auth.js';
import { registerUsersRoutes } from './routes/users.js';

process.env.TZ = 'America/Sao_Paulo';

dotenv.config({ path: '../../.env' });
dotenv.config();

const PORT = parseInt(process.env.APP_PORT || '3333', 10);
const LM_STUDIO_URL = process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234';
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || true;
const JWT_SECRET = process.env.JWT_SECRET || 'oraculo-spn-jwt-secret-key-2026-production';

const app = fastify({
  logger: {
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
    },
  },
});

// Global Error Handler - Prevents internal error leakage
app.setErrorHandler((error: any, request, reply) => {
  app.log.error(error);
  if (reply.sent) return;

  const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
  reply.status(statusCode).send({
    success: false,
    error: statusCode === 500 ? 'Erro interno no servidor de IA' : error.message,
    code: error.code || 'INTERNAL_ERROR',
  });
});

async function main() {
  await app.register(fastifyJwt, {
    secret: JWT_SECRET,
  });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false, // Disabilitado para websockets/streaming local
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(fastifyCors, {
    origin: ALLOWED_ORIGIN,
    credentials: true,
  });

  await app.register(fastifyRateLimit, {
    max: 120,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      error: 'Limite de requisições excedido. Por favor, aguarde antes de tentar novamente.',
    }),
  });

  await app.register(fastifyWebsocket);

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
    },
  });

  const lmStudioProvider = new LMStudioProvider({
    baseUrl: LM_STUDIO_URL,
    apiToken: process.env.LM_STUDIO_API_TOKEN,
  });

  registerAuthRoutes(app);
  registerUsersRoutes(app);
  registerHealthRoutes(app, lmStudioProvider);
  registerModelsRoutes(app, lmStudioProvider);
  registerChatRoutes(app, lmStudioProvider);
  registerConversationsRoutes(app);
  registerAssistantsRoutes(app);
  registerFilesRoutes(app);
  registerTelemetryRoutes(app, lmStudioProvider);
  registerAuditRoutes(app);
  registerSettingsRoutes(app, lmStudioProvider);
  registerDatabaseRoutes(app);
  await app.register(reportRoutes, { prefix: '/api/reports' });
  await app.register(messagingRoutes, { prefix: '/api/messaging' });

  // Iniciar Agendador de Relatórios & Notificações Automáticas
  SchedulerService.init();



  // Graceful Shutdown Cleanup
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Encerramento solicitado (${signal}). Encerrando servidor e conexões...`);
    try {
      await app.close();
      await prisma.$disconnect();
      console.log('✅ Conexões e banco de dados desconectados com sucesso.');
      process.exit(0);
    } catch (err) {
      console.error('Erro durante graceful shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 API Oráculo SPN rodando na porta ${PORT}`);
    console.log(`🤖 Conectado ao LM Studio em: ${LM_STUDIO_URL}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

