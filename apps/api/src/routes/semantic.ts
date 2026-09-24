import { FastifyInstance } from 'fastify';
import { requireAdmin } from '../middlewares/authMiddleware.js';
import { prisma } from '../db/prisma.js';
import { SchemaSyncService } from '../services/semantic/SchemaSyncService.js';
import { RelationshipGraphService } from '../services/semantic/RelationshipGraphService.js';
import { DiagnosticService } from '../services/semantic/DiagnosticService.js';
import { SemanticDataEngine } from '../services/semantic/SemanticDataEngine.js';

export function registerSemanticRoutes(fastify: FastifyInstance) {
  // 1. Sincronização Automática de Schema
  fastify.post('/api/semantic/sync', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { dataSourceId } = req.body as { dataSourceId: string };
      if (!dataSourceId) {
        return reply.status(400).send({ success: false, error: 'dataSourceId é obrigatório.' });
      }
      const result = await SchemaSyncService.syncSchema(dataSourceId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 2. Grafo Semântico para React Flow / Mapa Visual
  fastify.get('/api/semantic/graph', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { dataSourceId } = req.query as { dataSourceId?: string };
      const graph = await RelationshipGraphService.getGraph(dataSourceId);
      return reply.send({ success: true, ...graph });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 2.1 Vizinhança de uma Tabela (1 a 3 saltos)
  fastify.get('/api/semantic/neighborhood/:tableId', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { tableId } = req.params as { tableId: string };
      const { hops } = req.query as { hops?: string };
      const graph = await RelationshipGraphService.getNeighborhood(tableId, hops ? parseInt(hops, 10) : 1);
      return reply.send({ success: true, ...graph });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 2.2 Salvar Posicionamento Manual de Nós no Mapa
  fastify.post('/api/semantic/layout', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { positions } = req.body as { positions: Array<{ id: string; posX: number; posY: number }> };
      if (!Array.isArray(positions)) {
        return reply.status(400).send({ success: false, error: 'positions deve ser um array.' });
      }

      for (const pos of positions) {
        await (prisma as any).semanticTable.update({
          where: { id: pos.id },
          data: { pos_x: pos.posX, pos_y: pos.posY },
        });
      }

      return reply.send({ success: true, updated: positions.length });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 3. Tabelas Semânticas (CRUD e Edição de Metadados)
  fastify.get('/api/semantic/tables', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { dataSourceId } = req.query as { dataSourceId?: string };
      const where = dataSourceId ? { data_source_id: dataSourceId } : {};
      const tables = await (prisma as any).semanticTable.findMany({
        where,
        include: { columns: true },
        orderBy: { table_name: 'asc' },
      });
      return reply.send({ success: true, tables });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.put('/api/semantic/tables/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as any;

      const updated = await (prisma as any).semanticTable.update({
        where: { id },
        data: {
          display_name: body.displayName,
          business_description: body.businessDescription,
          business_domain: body.businessDomain,
          synonyms: body.synonyms,
          usage_notes: body.usageNotes,
          do_not_use_notes: body.doNotUseNotes,
          priority: body.priority,
          active: body.active,
          ai_enabled: body.aiEnabled,
        },
      });

      return reply.send({ success: true, table: updated });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 4. Colunas Semânticas (CRUD e Classificação)
  fastify.put('/api/semantic/columns/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as any;

      const updated = await (prisma as any).semanticColumn.update({
        where: { id },
        data: {
          display_name: body.displayName,
          business_description: body.businessDescription,
          synonyms: body.synonyms,
          classification: body.classification,
          ai_enabled: body.aiEnabled,
        },
      });

      return reply.send({ success: true, column: updated });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 5. Relacionamentos Semânticos
  fastify.post('/api/semantic/relationships', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const body = req.body as any;
      if (!body.dataSourceId || !body.sourceTableId || !body.sourceColumnId || !body.targetTableId || !body.targetColumnId) {
        return reply.status(400).send({ success: false, error: 'Parâmetros obrigatórios incompletos para criação de relacionamento.' });
      }

      const rel = await (prisma as any).semanticRelationship.create({
        data: {
          data_source_id: body.dataSourceId,
          source_table_id: body.sourceTableId,
          source_column_id: body.sourceColumnId,
          target_table_id: body.targetTableId,
          target_column_id: body.targetColumnId,
          cardinality: body.cardinality || 'N:1',
          rel_type: body.relType || 'logical',
          join_type: body.joinType || 'INNER',
          join_expression: body.joinExpression || null,
          business_description: body.businessDescription || null,
          usage_notes: body.usageNotes || null,
          do_not_use_notes: body.doNotUseNotes || null,
          confidence: 'manual',
          status: 'validated',
          priority: body.priority || 'normal',
        },
      });

      return reply.send({ success: true, relationship: rel });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.put('/api/semantic/relationships/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as any;

      const updated = await (prisma as any).semanticRelationship.update({
        where: { id },
        data: {
          cardinality: body.cardinality,
          rel_type: body.relType,
          join_type: body.joinType,
          join_expression: body.joinExpression,
          business_description: body.businessDescription,
          usage_notes: body.usageNotes,
          do_not_use_notes: body.doNotUseNotes,
          status: body.status,
          priority: body.priority,
        },
      });

      return reply.send({ success: true, relationship: updated });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.delete('/api/semantic/relationships/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      await (prisma as any).semanticRelationship.delete({ where: { id } });
      return reply.send({ success: true, message: 'Relacionamento excluído com sucesso.' });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 6. Dicionário de Negócio (Business Terms)
  fastify.get('/api/semantic/business-terms', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { dataSourceId } = req.query as { dataSourceId?: string };
      const where = dataSourceId ? { data_source_id: dataSourceId } : {};
      const terms = await (prisma as any).businessTerm.findMany({
        where,
        orderBy: { name: 'asc' },
      });
      return reply.send({ success: true, terms });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.post('/api/semantic/business-terms', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const body = req.body as any;
      if (!body.name || !body.description) {
        return reply.status(400).send({ success: false, error: 'Nome e descrição são obrigatórios.' });
      }

      const term = await (prisma as any).businessTerm.create({
        data: {
          data_source_id: body.dataSourceId || null,
          name: body.name,
          description: body.description,
          synonyms: body.synonyms || null,
          business_domain: body.businessDomain || null,
          formula: body.formula || null,
          semantic_expression: body.semanticExpression || null,
          default_filters: body.defaultFilters || null,
          active: body.active !== false,
        },
      });

      return reply.send({ success: true, term });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.delete('/api/semantic/business-terms/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      await (prisma as any).businessTerm.delete({ where: { id } });
      return reply.send({ success: true, message: 'Termo removido com sucesso.' });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 7. Métricas & KPIs
  fastify.get('/api/semantic/metrics', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { dataSourceId } = req.query as { dataSourceId?: string };
      const where = dataSourceId ? { data_source_id: dataSourceId } : {};
      const metrics = await (prisma as any).semanticMetric.findMany({
        where,
        orderBy: { name: 'asc' },
      });
      return reply.send({ success: true, metrics });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.post('/api/semantic/metrics', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const body = req.body as any;
      if (!body.name || !body.formula || !body.baseTable) {
        return reply.status(400).send({ success: false, error: 'Nome, fórmula e tabela base são obrigatórios.' });
      }

      const metric = await (prisma as any).semanticMetric.create({
        data: {
          data_source_id: body.dataSourceId || null,
          name: body.name,
          description: body.description || '',
          formula: body.formula,
          aggregation: body.aggregation || 'SUM',
          base_table: body.baseTable,
          required_relationships: body.requiredRelationships || null,
          default_filters: body.defaultFilters || null,
          time_column: body.timeColumn || null,
          synonyms: body.synonyms || null,
          active: body.active !== false,
        },
      });

      return reply.send({ success: true, metric });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.delete('/api/semantic/metrics/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      await (prisma as any).semanticMetric.delete({ where: { id } });
      return reply.send({ success: true, message: 'Métrica removida com sucesso.' });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 8. Consultas Validadas (Few-Shot RAG)
  fastify.get('/api/semantic/validated-queries', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { dataSourceId } = req.query as { dataSourceId?: string };
      const where = dataSourceId ? { data_source_id: dataSourceId } : {};
      const queries = await (prisma as any).validatedQuery.findMany({
        where,
        orderBy: { usage_count: 'desc' },
      });
      return reply.send({ success: true, queries });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.post('/api/semantic/validated-queries', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const body = req.body as any;
      if (!body.question || !body.sql) {
        return reply.status(400).send({ success: false, error: 'Pergunta e SQL são obrigatórios.' });
      }

      const query = await (prisma as any).validatedQuery.create({
        data: {
          data_source_id: body.dataSourceId || null,
          question: body.question,
          normalized_question: body.question.toLowerCase().trim(),
          sql: body.sql,
          tables_used: body.tablesUsed ? JSON.stringify(body.tablesUsed) : null,
          tags: body.tags || null,
          validation_status: 'validated',
        },
      });

      return reply.send({ success: true, query });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 9. Diagnóstico, Cobertura Semântica & Sugestões
  fastify.get('/api/semantic/diagnostic', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { dataSourceId } = req.query as { dataSourceId?: string };
      const coverage = await DiagnosticService.getCoverage(dataSourceId);
      return reply.send({ success: true, coverage });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  fastify.get('/api/semantic/suggestions', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { dataSourceId } = req.query as { dataSourceId: string };
      if (!dataSourceId) {
        return reply.status(400).send({ success: false, error: 'dataSourceId é obrigatório.' });
      }
      const suggestions = await DiagnosticService.detectRelationshipSuggestions(dataSourceId);
      return reply.send({ success: true, suggestions });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 10. Laboratório de Testes Semânticos (Admin Lab)
  fastify.post('/api/semantic/lab/ask', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const { question, dataSourceId } = req.body as { question: string; dataSourceId: string };
      if (!question || !dataSourceId) {
        return reply.status(400).send({ success: false, error: 'question e dataSourceId são obrigatórios.' });
      }

      const response = await SemanticDataEngine.ask({
        question,
        dataSourceId,
      });

      return reply.send(response);
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
