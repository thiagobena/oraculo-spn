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

  // Cadastrar nova conexão de banco/API/Storage/Web
  fastify.post('/api/settings/databases', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const body = req.body as any;
      if (!body.name) {
        return reply.status(400).send({
          success: false,
          error: 'O nome do conector é obrigatório.',
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
          paramsToTest.category = paramsToTest.category || saved.category;
          paramsToTest.config_json = paramsToTest.config_json || saved.config_json;
        }
      }

      const result = await DatabaseService.testConnection(paramsToTest);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // Introspecção de Esquema (Tabelas e Colunas)
  fastify.post('/api/settings/databases/schema', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { connector_id } = req.body as { connector_id: string };
      if (!connector_id) {
        return reply.status(400).send({ success: false, error: 'connector_id é obrigatório.' });
      }

      const result = await DatabaseService.introspectSchema(connector_id);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // Geração de Consulta via Linguagem Natural (NL2SQL)
  fastify.post('/api/settings/databases/nl2sql', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { connector_id, user_prompt } = req.body as { connector_id: string; user_prompt: string };
      if (!connector_id || !user_prompt) {
        return reply.status(400).send({ success: false, error: 'connector_id e user_prompt são obrigatórios.' });
      }

      const result = await DatabaseService.generateNL2SQL(connector_id, user_prompt);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // Executar consulta SQL direta / Payload
  fastify.post('/api/settings/databases/query', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { connector_id, sql, generate_summary } = req.body as {
        connector_id: string;
        sql: string;
        generate_summary?: boolean;
      };
      if (!connector_id || !sql) {
        return reply.status(400).send({ success: false, error: 'Parâmetros obrigatórios ausentes: connector_id e sql.' });
      }

      const result = await DatabaseService.executeQuery(connector_id, sql, { generateSummary: generate_summary });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // --- ROTAS DE PRESETS DINÂMICOS ---

  // Listar presets de um conector
  fastify.get('/api/settings/databases/:id/presets', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const presets = await DatabaseService.listPresets(id);
      return reply.send({ success: true, presets });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // Criar preset
  fastify.post('/api/settings/databases/:id/presets', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as any;
      if (!body.title || !body.query_payload) {
        return reply.status(400).send({ success: false, error: 'Título e consulta (query_payload) são obrigatórios.' });
      }

      const preset = await DatabaseService.createPreset({
        connector_id: id,
        ...body,
      });
      return reply.send({ success: true, preset });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // Atualizar preset
  fastify.put('/api/settings/databases/presets/:presetId', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { presetId } = req.params as { presetId: string };
      const body = req.body as any;

      const preset = await DatabaseService.updatePreset(presetId, body);
      return reply.send({ success: true, preset });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // Deletar preset
  fastify.delete('/api/settings/databases/presets/:presetId', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { presetId } = req.params as { presetId: string };
      await DatabaseService.deletePreset(presetId);
      return reply.send({ success: true, message: 'Preset removido com sucesso' });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
