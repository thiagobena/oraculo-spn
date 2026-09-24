import { LLMClient } from './LLMClient.js';

export interface InterpretationResult {
  naturalAnswer: string;
  summaryBulletPoints: string[];
  transparencyAudit: {
    questionInterpreted: string;
    tablesUsed: string[];
    relationshipsUsed: string[];
    metricsUsed: string[];
    filtersApplied: string[];
    sqlExecuted: string;
    executionTimeMs: number;
    rowCount: number;
    confidenceScore: number;
    dataSourceName: string;
    dataSourceId?: string;
  };
}

export class ResultInterpreter {
  /**
   * Converte o resultado de execução do banco em resposta executiva fundamentada e constrói a auditoria de proveniência
   */
  static async interpret(params: {
    question: string;
    rows: any[];
    columns: string[];
    sqlExecuted: string;
    executionTimeMs: number;
    tablesUsed: string[];
    relationshipsUsed: string[];
    metricsUsed: string[];
    filtersApplied: string[];
    confidenceScore: number;
    dataSourceName: string;
    dataSourceId?: string;
  }): Promise<InterpretationResult> {
    const {
      question,
      rows,
      columns,
      sqlExecuted,
      executionTimeMs,
      tablesUsed,
      relationshipsUsed,
      metricsUsed,
      filtersApplied,
      confidenceScore,
      dataSourceName,
      dataSourceId,
    } = params;

    // Se não houver linhas retornadas
    if (!rows || rows.length === 0) {
      return {
        naturalAnswer: `Não foram encontrados registros para a consulta referente a "${question}" na fonte **${dataSourceName}**. Verifique se os filtros de período ou parâmetros informados estão corretos.`,
        summaryBulletPoints: ['Nenhum dado retornado no banco de dados.'],
        transparencyAudit: {
          questionInterpreted: question,
          tablesUsed,
          relationshipsUsed,
          metricsUsed,
          filtersApplied,
          sqlExecuted,
          executionTimeMs,
          rowCount: 0,
          confidenceScore,
          dataSourceName,
          dataSourceId,
        },
      };
    }

    // Amostra compacta para a LLM (máximo 15 linhas) para evitar estouro de tokens
    const sampleRows = rows.slice(0, 15);
    const dataPreview = JSON.stringify(sampleRows, null, 2);

    const systemPrompt = `Você é um Analista de Inteligência de Negócios e Dados Corporativos.
Seu objetivo é interpretar o resultado do banco de dados e apresentar uma resposta clara, natural, precisa e executiva em Português do Brasil.

DIRETRIZES FUNDAMENTAIS:
1. PRESERVE OS NÚMEROS EXATOS: NUNCA altere valores, totais, percentuais ou datas retornadas.
2. NÃO INVENTE DADOS: Limite-se estritamente ao que está evidente nos dados.
3. Se o total de registros retornados (${rows.length}) for maior que a amostra (${sampleRows.length}), destaque esse fato com elegância.
4. Forneça 2 a 4 pontos de destaque (bullet points) no array "summaryBulletPoints".
5. Responda ESTRITAMENTE em formato JSON com o schema:
{
  "naturalAnswer": "Texto explicativo e direto com a resposta final...",
  "summaryBulletPoints": [
    "Destaque 1...",
    "Destaque 2..."
  ]
}`;

    const userPrompt = `Pergunta original: "${question}"\nTotal de Linhas no Banco: ${rows.length}\nColunas: ${columns.join(', ')}\n\nDados:\n${dataPreview}`;

    try {
      const parsed = await LLMClient.generateStructured<{
        naturalAnswer: string;
        summaryBulletPoints: string[];
      }>(userPrompt, systemPrompt, { temperature: 0.1, maxTokens: 1200 });

      return {
        naturalAnswer: parsed.naturalAnswer,
        summaryBulletPoints: parsed.summaryBulletPoints || [],
        transparencyAudit: {
          questionInterpreted: question,
          tablesUsed,
          relationshipsUsed,
          metricsUsed,
          filtersApplied,
          sqlExecuted,
          executionTimeMs,
          rowCount: rows.length,
          confidenceScore,
          dataSourceName,
          dataSourceId,
        },
      };
    } catch (err: any) {
      // Fallback determinístico
      return {
        naturalAnswer: `A consulta retornou ${rows.length} registro(s) para a pergunta "${question}".`,
        summaryBulletPoints: [`${rows.length} linha(s) processada(s) com sucesso em ${executionTimeMs}ms.`],
        transparencyAudit: {
          questionInterpreted: question,
          tablesUsed,
          relationshipsUsed,
          metricsUsed,
          filtersApplied,
          sqlExecuted,
          executionTimeMs,
          rowCount: rows.length,
          confidenceScore,
          dataSourceName,
          dataSourceId,
        },
      };
    }
  }
}
