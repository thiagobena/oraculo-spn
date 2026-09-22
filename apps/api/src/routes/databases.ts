import { FastifyInstance } from 'fastify';
import { requireAdmin } from '../middlewares/authMiddleware.js';
import { DatabaseService, DatabaseTestParams } from '../services/DatabaseService.js';

export function registerDatabaseRoutes(fastify: FastifyInstance) {
  // Listar todas as conexões cadastradas
  fastify.get('/api/settings/databases', { preHandler: [requireAdmin] }, async (_req, reply) => {
    try {
      const connectors = await DatabaseService.listConnectors();
      return reply.send({ success: true, connectors });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // Cadastrar nova conexão de banco de dados
  fastify.post('/api/settings/databases', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const body = req.body as any;
      if (!body.name || !body.host || !body.database || !body.username) {
        return reply.status(400).send({
          success: false,
          error: 'Campos obrigatórios ausentes: nome, host, banco de dados e usuário.',
        });
      }

      const connector = await DatabaseService.createConnector(body);
      return reply.send({ success: true, connector });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // Atualizar conexão existente
  fastify.put('/api/settings/databases/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as any;

      const updated = await DatabaseService.updateConnector(id, body);
      return reply.send({ success: true, connector: updated });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // Excluir conexão
  fastify.delete('/api/settings/databases/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      await DatabaseService.deleteConnector(id);
      return reply.send({ success: true, message: 'Conector removido com sucesso' });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // Testar conexão em tempo real
  fastify.post('/api/settings/databases/test', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const body = req.body as (DatabaseTestParams & { id?: string });

      let paramsToTest: DatabaseTestParams = { ...body };

      // Se o usuário passou um ID e a senha veio mascarada/vazia, buscar a senha salva no banco
      if (body.id && (!body.password || body.password === '••••••••')) {
        const saved = await DatabaseService.getConnectorById(body.id);
        if (saved) {
          paramsToTest.password = saved.password;
          paramsToTest.host = paramsToTest.host || saved.host;
          paramsToTest.port = paramsToTest.port || saved.port;
          paramsToTest.database = paramsToTest.database || saved.database;
          paramsToTest.username = paramsToTest.username || saved.username;
          paramsToTest.db_type = paramsToTest.db_type || saved.db_type;
        }
      }

      const result = await DatabaseService.testConnection(paramsToTest);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // Executar consulta SQL direta (SELECT)
  fastify.post('/api/settings/databases/query', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { connector_id, sql } = req.body as { connector_id: string; sql: string };
      if (!connector_id || !sql) {
        return reply.status(400).send({ success: false, error: 'Parâmetros obrigatorios ausentes: connector_id e sql.' });
      }

      const result = await DatabaseService.executeQuery(connector_id, sql);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}

