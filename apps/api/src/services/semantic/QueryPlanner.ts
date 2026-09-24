import { StructuredIntent } from './IntentAnalyzer.js';
import { RetrievedSchema } from './SchemaRetriever.js';
import { PathStep } from './RelationshipGraphService.js';
import { LLMClient } from './LLMClient.js';

export interface LogicalQueryPlan {
  baseTable: string;
  joins: Array<{
    table: string;
    joinType: string;
    onExpression: string;
    relationshipId?: string;
  }>;
  selectedColumns: Array<{
    expression: string;
    alias: string;
    description?: string;
  }>;
  filters: Array<{
    expression: string;
    reason: string;
  }>;
  groupBy: string[];
  orderBy: Array<{
    expression: string;
    direction: 'ASC' | 'DESC';
  }>;
  limit: number | null;
  visualizationSuggestion: 'table' | 'bar_chart' | 'pie_chart' | 'line_chart' | 'kpi';
  confidenceScore: number;
}

export class QueryPlanner {
  /**
   * Constrói o Plano Lógico da consulta a partir da intenção, schema reduzido e grafo de relacionamentos
   */
  static async createPlan(params: {
    question: string;
    intent: StructuredIntent;
    schema: RetrievedSchema;
    graphSteps: PathStep[];
    dbType: string;
    metricsContext?: string;
    businessTermsContext?: string;
  }): Promise<LogicalQueryPlan> {
    const { question, intent, schema, graphSteps, dbType, metricsContext, businessTermsContext } = params;

    const availableTables = schema.tables.map((t) => {
      const cols = t.columns
        .map((c) => `${c.columnName} (${c.dataType}${c.isPk ? ', PK' : ''}${c.isFk ? ', FK' : ''}${c.classification === 'measure' ? ', métrica' : ''})`)
        .join(', ');
      return `Tabela: ${t.schemaName}.${t.tableName} [${t.displayName}]\nColunas: ${cols}`;
    }).join('\n\n');

    const allowedJoins = graphSteps.map((s) => {
      return `Conexão validada: ${s.fromTableName} -> ${s.toTableName} (${s.joinType}) ON ${s.joinExpression}`;
    }).join('\n');

    const systemPrompt = `Você é um Planejador de Consultas Lógicas (Query Planner) corporativo.
Seu objetivo é planejar a execução lógica de dados SEM inventar tabelas, colunas ou relacionamentos não autorizados.

DIALETO DO BANCO: ${dbType}

TABELAS SELECIONADAS:
${availableTables}

RELACIONAMENTOS VÁLIDOS DETECTADOS NO GRAFO:
${allowedJoins || 'Nenhuma junção adicional necessária (tabela única).'}

MÉTRICAS & REGRAS DE NEGÓCIO:
${metricsContext || 'Nenhuma métrica especial.'}
${businessTermsContext || 'Nenhum termo especial.'}

REGRAS ESTRITAS:
1. "baseTable": Escolha a tabela principal do contexto (ex: datalake.tb_documentos ou tb_vendas).
2. "joins": Utilize APENAS os relacionamentos válidos informados acima. NUNCA crie CROSS JOIN ou JOINs em colunas inexistentes.
3. "selectedColumns": Gere expressões com aliases amigáveis em português.
4. "filters": Aplique filtros de período e status conforme as regras de negócio conhecidas.
5. "groupBy": Se houver funções agregadoras (SUM, COUNT, AVG), adicione todas as dimensões não agregadas.
6. Responda ESTRITAMENTE em formato JSON com este schema:
{
  "baseTable": "schema.table",
  "joins": [
    { "table": "schema.other_table", "joinType": "INNER", "onExpression": "table.col = other_table.col" }
  ],
  "selectedColumns": [
    { "expression": "f.nome_filial", "alias": "filial" },
    { "expression": "SUM(i.valor_liquido)", "alias": "total_vendas" }
  ],
  "filters": [
    { "expression": "d.status = 'FINALIZADA'", "reason": "Apenas vendas concluídas" }
  ],
  "groupBy": ["f.nome_filial"],
  "orderBy": [
    { "expression": "total_vendas", "direction": "DESC" }
  ],
  "limit": 10,
  "visualizationSuggestion": "bar_chart",
  "confidenceScore": 0.95
}`;

    const userPrompt = `Pergunta: "${question}"\nIntenção Detectada: ${JSON.stringify(intent)}`;

    try {
      const plan = await LLMClient.generateStructured<LogicalQueryPlan>(
        userPrompt,
        systemPrompt,
        { temperature: 0.05, maxTokens: 1500 }
      );

      return {
        baseTable: plan.baseTable || schema.tables[0]?.tableName || '',
        joins: plan.joins || [],
        selectedColumns: plan.selectedColumns || [{ expression: '*', alias: 'todos' }],
        filters: plan.filters || [],
        groupBy: plan.groupBy || [],
        orderBy: plan.orderBy || [],
        limit: plan.limit ?? (intent.limit || 500),
        visualizationSuggestion: plan.visualizationSuggestion || 'table',
        confidenceScore: plan.confidenceScore ?? 0.85,
      };
    } catch (err: any) {
      // Fallback em caso de falha de estruturação
      const fallbackTable = schema.tables[0]?.tableName || 'dados';
      return {
        baseTable: fallbackTable,
        joins: [],
        selectedColumns: [{ expression: '*', alias: 'resultado' }],
        filters: [],
        groupBy: [],
        orderBy: [],
        limit: 100,
        visualizationSuggestion: 'table',
        confidenceScore: 0.5,
      };
    }
  }
}
