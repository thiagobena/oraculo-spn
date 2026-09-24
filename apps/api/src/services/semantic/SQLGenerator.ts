import { LogicalQueryPlan } from './QueryPlanner.js';
import { LLMClient } from './LLMClient.js';
import { prisma } from '../../db/prisma.js';

export interface GeneratedSQLResult {
  sql: string;
  explanation: string;
  visualizationSuggestion: string;
  dialect: string;
  tablesUsed: string[];
  relationshipsUsed: string[];
}

export class SQLGenerator {
  /**
   * Converte o Plano Lógico em consulta SQL compilada para o dialeto do banco de dados alvo
   */
  static async generate(params: {
    question: string;
    plan: LogicalQueryPlan;
    dbType: string;
    dataSourceId?: string;
  }): Promise<GeneratedSQLResult> {
    const { question, plan, dbType, dataSourceId } = params;

    // Recuperar consultas validadas (Few-Shot RAG) para aprendizado contextual
    let fewShotContext = '';
    if (dataSourceId) {
      const validatedQueries = await (prisma as any).validatedQuery.findMany({
        where: {
          data_source_id: dataSourceId,
          validation_status: 'validated',
        },
        take: 3,
        orderBy: { usage_count: 'desc' },
      });

      if (validatedQueries.length > 0) {
        fewShotContext = `\nEXEMPLOS DE CONSULTAS VALIDADAS ANTERIORMENTE (FEW-SHOT):\n` +
          validatedQueries.map((q: any) => `Pergunta: "${q.question}"\nSQL Validado:\n${q.sql}`).join('\n\n');
      }
    }

    const isPostgres = dbType.includes('postgres');
    const isSqlServer = dbType.includes('sqlserver') || dbType.includes('mssql');

    const nowBR = new Date();
    const dataAtualISO = nowBR.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    const systemPrompt = `Você é um Gerador de SQL Rigoroso e Otimizado.
Seu papel é converter o Plano Lógico em uma consulta SQL EXCLUSIVAMENTE DE LEITURA (SELECT) para o dialeto "${dbType}".

DIALETO:
- Dialeto atual: ${dbType}.
${isPostgres ? '- PostgreSQL: use CURRENT_DATE (sem parênteses), DATE_TRUNC, ILIKE para strings, LIMIT no final.' : ''}
${isSqlServer ? '- SQL Server: use GETDATE(), DATEFROMPARTS, TOP N em vez de LIMIT.' : ''}
${!isPostgres && !isSqlServer ? '- MySQL: use CURDATE(), DATE_FORMAT, LIKE, LIMIT no final.' : ''}
- Data de Referência Hoje: '${dataAtualISO}'
${fewShotContext}

PLANO LÓGICO A SEGUIR ESTRITAMENTE:
${JSON.stringify(plan, null, 2)}

REGRAS DE CONFORMIDADE:
1. Respeite 100% as tabelas e junções aprovadas no plano lógico. NUNCA faça junções não especificadas no plano.
2. Em queries agregadas, todas as colunas que não estiverem em funções de agregação DEVEM constar na cláusula GROUP BY.
3. Se for MySQL/PostgreSQL, adicione LIMIT no final. Se for SQL Server, use SELECT TOP.
4. Responda ESTRITAMENTE em formato JSON com o seguinte schema:
{
  "sql": "SELECT ...",
  "explanation": "Explicação detalhada da lógica, agrupamento e filtros aplicados.",
  "tablesUsed": ["tb_vendas", "tb_lojas"],
  "relationshipsUsed": ["tb_vendas.loja_id = tb_lojas.id"]
}`;

    const userPrompt = `Pergunta: "${question}"\nPlano Lógico: Base ${plan.baseTable}, ${plan.joins.length} junções, ${plan.selectedColumns.length} colunas.`;

    const result = await LLMClient.generateStructured<{
      sql: string;
      explanation: string;
      tablesUsed: string[];
      relationshipsUsed: string[];
    }>(userPrompt, systemPrompt, { temperature: 0.05, maxTokens: 1800 });

    let cleanSql = (result.sql || '').trim().replace(/;+\s*$/, '');

    // Correções automáticas de dialeto
    if (isPostgres) {
      cleanSql = cleanSql.replace(/CURRENT_DATE\(\)/gi, 'CURRENT_DATE');
    }

    return {
      sql: cleanSql,
      explanation: result.explanation || 'Consulta gerada conforme o plano semântico homologado.',
      visualizationSuggestion: plan.visualizationSuggestion || 'table',
      dialect: dbType,
      tablesUsed: result.tablesUsed || [plan.baseTable],
      relationshipsUsed: result.relationshipsUsed || [],
    };
  }
}
