import { prisma } from '../../db/prisma.js';

export interface RetrievedSchema {
  tables: Array<{
    id: string;
    tableName: string;
    schemaName: string;
    displayName: string;
    businessDescription?: string | null;
    domain?: string | null;
    columns: Array<{
      id: string;
      columnName: string;
      displayName?: string | null;
      dataType: string;
      isPk: boolean;
      isFk: boolean;
      classification: string;
      businessDescription?: string | null;
    }>;
  }>;
  relevanceExplanation: string[];
}

export class SchemaRetriever {
  /**
   * Recupera de 3 a 10 tabelas mais relevantes com base na pergunta, entidades e termos detectados
   */
  static async retrieveRelevantSchema(
    dataSourceId: string,
    question: string,
    detectedTerms: string[] = [],
    maxTables: number = 8
  ): Promise<RetrievedSchema> {
    const allTables = await (prisma as any).semanticTable.findMany({
      where: {
        data_source_id: dataSourceId,
        ai_enabled: true,
        status: 'active',
      },
      include: {
        columns: {
          where: { ai_enabled: true, status: 'active' },
        },
      },
    });

    if (allTables.length <= maxTables) {
      return {
        tables: allTables.map((t: any) => ({
          id: t.id,
          tableName: t.table_name,
          schemaName: t.schema_name,
          displayName: t.display_name || t.table_name,
          businessDescription: t.business_description,
          domain: t.business_domain,
          columns: t.columns.map((c: any) => ({
            id: c.id,
            columnName: c.column_name,
            displayName: c.display_name || c.column_name,
            dataType: c.data_type,
            isPk: c.is_pk,
            isFk: c.is_fk,
            classification: c.classification,
            businessDescription: c.business_description,
          })),
        })),
        relevanceExplanation: ['Todas as tabelas do catálogo foram incluídas (esquema com menos de 8 tabelas).'],
      };
    }

    // Tokenização da pergunta para pontuação de relevância
    const searchTokens = question
      .toLowerCase()
      .replace(/[^\w\sáéíóúãõâêîôûç]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .concat(detectedTerms.map((t) => t.toLowerCase()));

    const scoredTables = allTables.map((table: any) => {
      let score = 0;
      const reasons: string[] = [];

      const tableNameLower = table.table_name.toLowerCase();
      const displayNameLower = (table.display_name || '').toLowerCase();
      const descLower = (table.business_description || '').toLowerCase();
      const synonymsLower = (table.synonyms || '').toLowerCase();

      for (const token of searchTokens) {
        if (tableNameLower.includes(token)) {
          score += 15;
          reasons.push(`Nome da tabela coincide com "${token}"`);
        }
        if (displayNameLower.includes(token)) {
          score += 12;
          reasons.push(`Nome amigável coincide com "${token}"`);
        }
        if (synonymsLower.includes(token)) {
          score += 20;
          reasons.push(`Sinônimo coincide com "${token}"`);
        }
        if (descLower.includes(token)) {
          score += 8;
          reasons.push(`Descrição empresarial menciona "${token}"`);
        }

        // Checar colunas
        for (const col of table.columns) {
          const colNameLower = col.column_name.toLowerCase();
          const colDisplayLower = (col.display_name || '').toLowerCase();
          const colSynonymsLower = (col.synonyms || '').toLowerCase();

          if (colNameLower.includes(token) || colDisplayLower.includes(token)) {
            score += 5;
          }
          if (colSynonymsLower.includes(token)) {
            score += 10;
          }
        }
      }

      // Prioridade configurada pelo administrador
      if (table.priority === 'high') score += 10;
      if (table.priority === 'low') score -= 5;

      return {
        table,
        score,
        reasons,
      };
    });

    // Ordenar por score decrescente
    scoredTables.sort((a: any, b: any) => b.score - a.score);

    // Selecionar as top tabelas (mínimo 3, máximo configurável)
    const selected = scoredTables.slice(0, Math.max(3, maxTables));
    const explanations: string[] = [];

    const resultTables = selected.map((item: any) => {
      if (item.reasons.length > 0) {
        explanations.push(`Tabela [${item.table.table_name}]: ${item.reasons.slice(0, 2).join(', ')}`);
      }
      return {
        id: item.table.id,
        tableName: item.table.table_name,
        schemaName: item.table.schema_name,
        displayName: item.table.display_name || item.table.table_name,
        businessDescription: item.table.business_description,
        domain: item.table.business_domain,
        columns: item.table.columns.map((c: any) => ({
          id: c.id,
          columnName: c.column_name,
          displayName: c.display_name || c.column_name,
          dataType: c.data_type,
          isPk: c.is_pk,
          isFk: c.is_fk,
          classification: c.classification,
          businessDescription: c.business_description,
        })),
      };
    });

    return {
      tables: resultTables,
      relevanceExplanation: explanations,
    };
  }
}
