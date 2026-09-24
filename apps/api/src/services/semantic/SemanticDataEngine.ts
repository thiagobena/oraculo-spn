import crypto from 'crypto';
import { prisma } from '../../db/prisma.js';
import { DatabaseService } from '../DatabaseService.js';
import { IntentAnalyzer } from './IntentAnalyzer.js';
import { SchemaRetriever } from './SchemaRetriever.js';
import { RelationshipGraphService } from './RelationshipGraphService.js';
import { QueryPlanner } from './QueryPlanner.js';
import { SQLGenerator } from './SQLGenerator.js';
import { SQLValidator } from './SQLValidator.js';
import { ResultInterpreter, InterpretationResult } from './ResultInterpreter.js';

export interface SemanticEngineResponse {
  success: boolean;
  requestId: string;
  answer: string;
  bulletPoints: string[];
  sql: string;
  rows: any[];
  columns: string[];
  totalRows: number;
  visualizationSuggestion: string;
  executionTimeMs: number;
  confidenceScore: number;
  transparencyAudit: InterpretationResult['transparencyAudit'];
  error?: string;
  isAmbiguous?: boolean;
  clarificationQuestion?: string | null;
  usedEngine: 'semantic_v2' | 'legacy_fallback';
  isCached?: boolean;
}

interface CacheEntry {
  timestamp: number;
  response: SemanticEngineResponse;
}

export class SemanticDataEngine {
  public static USE_SEMANTIC_DATA_ENGINE = true;

  private static cache = new Map<string, CacheEntry>();
  public static cacheHits = 0;
  public static cacheMisses = 0;

  static clearCache(): void {
    this.cache.clear();
  }

  static getCacheStats(): { size: number; hits: number; misses: number } {
    return {
      size: this.cache.size,
      hits: this.cacheHits,
      misses: this.cacheMisses,
    };
  }

  /**
   * Executa a pipeline completa da Versão 2 (Camada Semântica + Grafo + Planner + Validator)
   */
  static async ask(params: {
    question: string;
    dataSourceId: string;
    conversationId?: string;
    messageId?: string;
  }): Promise<SemanticEngineResponse> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const { question, dataSourceId, conversationId, messageId } = params;

    const connector = await DatabaseService.getConnectorById(dataSourceId);
    if (!connector) {
      throw new Error(`Fonte de dados [${dataSourceId}] não encontrada.`);
    }

    // 0. VERIFICAÇÃO DE CACHE SEMÂNTICO (Opção 3)
    let cacheEnabled = true;
    let cacheTtlSeconds = 300; // 5 minutos default

    try {
      const cacheSetting = await (prisma as any).appSetting.findUnique({
        where: { key: 'semantic_cache_enabled' },
      });
      if (cacheSetting && cacheSetting.value === 'false') {
        cacheEnabled = false;
      }
      const ttlSetting = await (prisma as any).appSetting.findUnique({
        where: { key: 'semantic_cache_ttl_seconds' },
      });
      if (ttlSetting && !isNaN(Number(ttlSetting.value))) {
        cacheTtlSeconds = Number(ttlSetting.value);
      }
    } catch {
      // Fallback para defaults
    }

    const normalizedKey = `${dataSourceId}:${question.trim().toLowerCase()}`;
    if (cacheEnabled) {
      const cached = this.cache.get(normalizedKey);
      if (cached && (Date.now() - cached.timestamp < cacheTtlSeconds * 1000)) {
        this.cacheHits++;
        const cachedResponse: SemanticEngineResponse = {
          ...cached.response,
          requestId,
          executionTimeMs: Math.max(1, Date.now() - startTime),
          isCached: true,
          transparencyAudit: {
            ...cached.response.transparencyAudit,
            executionTimeMs: Math.max(1, Date.now() - startTime),
          },
        };
        return cachedResponse;
      }
    }
    this.cacheMisses++;

    try {
      // 1. INTENT ANALYZER
      const intent = await IntentAnalyzer.analyze(question, dataSourceId);

      // Se houver ambiguidade crítica ou termo totalmente desconhecido que impeça resposta
      if (intent.ambiguityDetected && intent.clarificationQuestion) {
        return {
          success: true,
          requestId,
          answer: intent.clarificationQuestion,
          bulletPoints: ['A IA solicitou esclarecimento para evitar inferência incorreta.'],
          sql: '',
          rows: [],
          columns: [],
          totalRows: 0,
          visualizationSuggestion: 'table',
          executionTimeMs: Date.now() - startTime,
          confidenceScore: 0.4,
          isAmbiguous: true,
          clarificationQuestion: intent.clarificationQuestion,
          usedEngine: 'semantic_v2',
          transparencyAudit: {
            questionInterpreted: question,
            tablesUsed: [],
            relationshipsUsed: [],
            metricsUsed: [],
            filtersApplied: [],
            sqlExecuted: '',
            executionTimeMs: Date.now() - startTime,
            rowCount: 0,
            confidenceScore: 0.4,
            dataSourceName: connector.name,
          },
        };
      }

      // 2. SCHEMA RETRIEVER (Seleção de subconjunto de tabelas)
      const retrievedSchema = await SchemaRetriever.retrieveRelevantSchema(
        dataSourceId,
        question,
        intent.entities.concat(intent.matchedBusinessTerms),
        8
      );

      const tableIds = retrievedSchema.tables.map((t) => t.id);

      // 3. RELATIONSHIP RESOLVER (Grafo)
      const { resolvedTables, steps: graphSteps } = await RelationshipGraphService.resolveSubgraphForTables(
        tableIds,
        dataSourceId
      );

      // 4. QUERY PLANNER (Plano Lógico)
      const plan = await QueryPlanner.createPlan({
        question,
        intent,
        schema: retrievedSchema,
        graphSteps,
        dbType: connector.db_type || 'mysql',
      });

      // 5. SQL GENERATOR
      const sqlGenResult = await SQLGenerator.generate({
        question,
        plan,
        dbType: connector.db_type || 'mysql',
        dataSourceId,
      });

      // 6. SQL VALIDATOR
      let validation = SQLValidator.validate(sqlGenResult.sql, 1000);
      if (!validation.isValid) {
        throw new Error(`Consulta bloqueada pelo SQL Validator: ${validation.violations.join(', ')}`);
      }

      // 7. EXECUÇÃO COM AUTOCORREÇÃO CONTROLADA (MAX 2 RETRIES)
      let queryResult: any;
      let finalSql = validation.sanitizedSql;
      let attempt = 0;
      const MAX_RETRIES = 2;

      while (attempt <= MAX_RETRIES) {
        try {
          queryResult = await DatabaseService.executeQuery(dataSourceId, finalSql, { generateSummary: false });
          break; // Sucesso
        } catch (execErr: any) {
          attempt++;
          if (attempt > MAX_RETRIES) {
            throw new Error(`Erro na execução SQL após ${MAX_RETRIES} tentativas: ${execErr.message}`);
          }
          // Tentar autocorreção rápida com base no erro
          const autoHealPrompt = `A consulta SQL falhou com o erro: "${execErr.message}".\nSQL Anterior: ${finalSql}\nCorrija apenas a sintaxe para o dialeto ${connector.db_type}.`;
          const autoHealResult = await SQLGenerator.generate({
            question: autoHealPrompt,
            plan,
            dbType: connector.db_type || 'mysql',
            dataSourceId,
          });
          const reValidation = SQLValidator.validate(autoHealResult.sql, 1000);
          if (reValidation.isValid) {
            finalSql = reValidation.sanitizedSql;
          }
        }
      }

      // 8. RESULT INTERPRETER
      const rows = queryResult?.rows || [];
      const columns = queryResult?.columns || [];
      const executionTimeMs = Date.now() - startTime;

      const interpretation = await ResultInterpreter.interpret({
        question,
        rows,
        columns,
        sqlExecuted: finalSql,
        executionTimeMs,
        tablesUsed: sqlGenResult.tablesUsed,
        relationshipsUsed: sqlGenResult.relationshipsUsed,
        metricsUsed: intent.metrics,
        filtersApplied: plan.filters.map((f) => f.expression),
        confidenceScore: plan.confidenceScore,
        dataSourceName: connector.name,
        dataSourceId,
      });

      // 9. LOG DO RACIOCÍNIO OPERACIONAL (Persistência estruturada sem chain-of-thought)
      try {
        await (prisma as any).semanticQueryLog.create({
          data: {
            request_id: requestId,
            conversation_id: conversationId || null,
            message_id: messageId || null,
            data_source_id: dataSourceId,
            question,
            detected_intent: JSON.stringify(intent),
            selected_tables: JSON.stringify(sqlGenResult.tablesUsed),
            selected_columns: JSON.stringify(plan.selectedColumns),
            selected_relationships: JSON.stringify(sqlGenResult.relationshipsUsed),
            selected_metrics: JSON.stringify(intent.metrics),
            query_plan: JSON.stringify(plan),
            generated_sql: finalSql,
            validation_result: JSON.stringify(validation),
            confidence_score: plan.confidenceScore,
            query_duration_ms: executionTimeMs,
            row_count: rows.length,
            response_status: 'SUCCESS',
            engine_version: '2.0.0',
          },
        });
      } catch (logErr) {
        console.error('Falha ao registrar log operacional semântico:', logErr);
      }

      const engineResponse: SemanticEngineResponse = {
        success: true,
        requestId,
        answer: interpretation.naturalAnswer,
        bulletPoints: interpretation.summaryBulletPoints,
        sql: finalSql,
        rows,
        columns,
        totalRows: rows.length,
        visualizationSuggestion: plan.visualizationSuggestion,
        executionTimeMs,
        confidenceScore: plan.confidenceScore,
        transparencyAudit: interpretation.transparencyAudit,
        usedEngine: 'semantic_v2',
      };

      if (cacheEnabled) {
        this.cache.set(normalizedKey, {
          timestamp: Date.now(),
          response: engineResponse,
        });
      }

      return engineResponse;
    } catch (err: any) {
      console.error('Falha no SemanticDataEngine:', err);

      // Fallback controlado para o motor legado caso habilitado durante a fase de transição
      return {
        success: false,
        requestId,
        answer: `Não foi possível processar a consulta através da camada semântica: ${err.message}`,
        bulletPoints: [],
        sql: '',
        rows: [],
        columns: [],
        totalRows: 0,
        visualizationSuggestion: 'table',
        executionTimeMs: Date.now() - startTime,
        confidenceScore: 0.0,
        error: err.message,
        usedEngine: 'semantic_v2',
        transparencyAudit: {
          questionInterpreted: question,
          tablesUsed: [],
          relationshipsUsed: [],
          metricsUsed: [],
          filtersApplied: [],
          sqlExecuted: '',
          executionTimeMs: Date.now() - startTime,
          rowCount: 0,
          confidenceScore: 0.0,
          dataSourceName: connector.name,
        },
      };
    }
  }
}
