import { prisma } from '../../db/prisma.js';
import { LLMClient } from './LLMClient.js';

export interface StructuredIntent {
  intent: 'ranking' | 'aggregation' | 'filter_list' | 'trend' | 'comparison' | 'lookup' | 'unknown';
  entities: string[];
  metrics: string[];
  dimensions: string[];
  filters: Array<{
    concept: string;
    operator: string;
    value: string;
  }>;
  order: 'asc' | 'desc' | 'none';
  limit?: number | null;
  timeRange?: {
    start?: string;
    end?: string;
    periodType?: string; // today | yesterday | last_7_days | last_30_days | this_month | custom
  } | null;
  ambiguityDetected: boolean;
  clarificationQuestion?: string | null;
  matchedBusinessTerms: string[];
  unknownTerms: string[];
}

export class IntentAnalyzer {
  /**
   * Analisa a intenção da pergunta do usuário com base no dicionário e métricas cadastradas
   */
  static async analyze(
    question: string,
    dataSourceId?: string
  ): Promise<StructuredIntent> {
    const metaWhere = dataSourceId ? { data_source_id: dataSourceId } : {};

    const businessTerms = await (prisma as any).businessTerm.findMany({
      where: { ...metaWhere, active: true },
    });

    const semanticMetrics = await (prisma as any).semanticMetric.findMany({
      where: { ...metaWhere, active: true },
    });

    const termsContext = businessTerms
      .map((t: any) => `- Termo: "${t.name}" | Sinônimos: ${t.synonyms || 'nenhum'} | Domínio: ${t.business_domain || 'geral'}`)
      .join('\n');

    const metricsContext = semanticMetrics
      .map((m: any) => `- Métrica: "${m.name}" | Fórmula: ${m.formula} | Agregação: ${m.aggregation}`)
      .join('\n');

    const systemPrompt = `Você é um Analisador de Intenções Semânticas Corporativas para análise de dados.
Seu objetivo é decompor a pergunta do usuário em um JSON ESTRITAMENTE ESTRUTURADO.

DICIONÁRIO DE TERMOS CONHECIDOS:
${termsContext || 'Nenhum termo cadastrado no dicionário.'}

MÉTRICAS OFICIAIS CADASTRADAS:
${metricsContext || 'Nenhuma métrica cadastrada.'}

REGRAS:
1. Extraia a intenção primária: "ranking", "aggregation", "filter_list", "trend", "comparison" ou "lookup".
2. Identifique entidades mencionadas (ex: cliente, produto, loja, venda, filial, documento, chamado).
3. Se o usuário usar um termo ou KPI que NÃO conste no dicionário e seja ambíguo (ex: "índice XPTO", "fator delta"), liste-o em "unknownTerms" e defina "ambiguityDetected": true com uma pergunta em "clarificationQuestion".
4. Extraia filtros de período e limites numéricos (ex: "top 10" -> limit: 10, order: "desc").
5. Responda ESTRITAMENTE em formato JSON com este schema:
{
  "intent": "ranking" | "aggregation" | "filter_list" | "trend" | "comparison" | "lookup",
  "entities": ["cliente", "venda"],
  "metrics": ["faturamento"],
  "dimensions": ["loja"],
  "filters": [
    { "concept": "status", "operator": "=", "value": "FINALIZADA" }
  ],
  "order": "desc" | "asc" | "none",
  "limit": 10,
  "timeRange": {
    "periodType": "last_90_days"
  },
  "ambiguityDetected": false,
  "clarificationQuestion": null,
  "matchedBusinessTerms": ["Faturamento"],
  "unknownTerms": []
}`;

    try {
      const intentResult = await LLMClient.generateStructured<StructuredIntent>(
        question,
        systemPrompt,
        { temperature: 0.05, maxTokens: 1200 }
      );

      // Validação do JSON retornado
      if (!intentResult.intent || !Array.isArray(intentResult.entities)) {
        throw new Error('Saída estruturada incompleta do IntentAnalyzer.');
      }

      return {
        intent: intentResult.intent || 'aggregation',
        entities: intentResult.entities || [],
        metrics: intentResult.metrics || [],
        dimensions: intentResult.dimensions || [],
        filters: intentResult.filters || [],
        order: intentResult.order || 'none',
        limit: intentResult.limit ?? null,
        timeRange: intentResult.timeRange ?? null,
        ambiguityDetected: !!intentResult.ambiguityDetected,
        clarificationQuestion: intentResult.clarificationQuestion || null,
        matchedBusinessTerms: intentResult.matchedBusinessTerms || [],
        unknownTerms: intentResult.unknownTerms || [],
      };
    } catch (err: any) {
      // Fallback heurístico em caso de falha de conexão com LLM
      const p = question.toLowerCase();
      const isTop = /\b(?:top|dez|10|primeiros|maiores)\b/i.test(p);
      return {
        intent: isTop ? 'ranking' : 'aggregation',
        entities: ['dados'],
        metrics: [],
        dimensions: [],
        filters: [],
        order: isTop ? 'desc' : 'none',
        limit: isTop ? 10 : null,
        timeRange: null,
        ambiguityDetected: false,
        clarificationQuestion: null,
        matchedBusinessTerms: [],
        unknownTerms: [],
      };
    }
  }
}
