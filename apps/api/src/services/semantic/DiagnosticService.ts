import { prisma } from '../../db/prisma.js';

export interface SemanticCoverageMetrics {
  totalTables: number;
  documentedTables: number;
  tablesDocumentationPct: number;
  totalColumns: number;
  documentedColumns: number;
  columnsDocumentationPct: number;
  totalRelationships: number;
  validatedRelationships: number;
  suggestedRelationships: number;
  isolatedTablesCount: number;
  isolatedTableNames: string[];
  metricsCount: number;
  businessTermsCount: number;
  validatedQueriesCount: number;
}

export interface SuggestedRelationship {
  sourceTableId: string;
  sourceTableName: string;
  sourceColumnId: string;
  sourceColumnName: string;
  targetTableId: string;
  targetTableName: string;
  targetColumnId: string;
  targetColumnName: string;
  cardinality: string;
  reason: string;
  confidenceScore: number;
}

export class DiagnosticService {
  /**
   * Calcula o índice de cobertura e maturidade semântica para uma fonte ou global
   */
  static async getCoverage(dataSourceId?: string): Promise<SemanticCoverageMetrics> {
    const tableWhere = dataSourceId ? { data_source_id: dataSourceId } : {};
    const relWhere = dataSourceId ? { data_source_id: dataSourceId } : {};
    const metaWhere = dataSourceId ? { data_source_id: dataSourceId } : {};

    const tables = await (prisma as any).semanticTable.findMany({
      where: tableWhere,
      include: {
        columns: true,
      },
    });

    const relationships = await (prisma as any).semanticRelationship.findMany({
      where: relWhere,
    });

    const metricsCount = await (prisma as any).semanticMetric.count({ where: metaWhere });
    const businessTermsCount = await (prisma as any).businessTerm.count({ where: metaWhere });
    const validatedQueriesCount = await (prisma as any).validatedQuery.count({ where: metaWhere });

    const totalTables = tables.length;
    let documentedTables = 0;
    let totalColumns = 0;
    let documentedColumns = 0;

    const tablesWithEdges = new Set<string>();
    for (const rel of relationships) {
      if (rel.status !== 'rejected') {
        tablesWithEdges.add(rel.source_table_id);
        tablesWithEdges.add(rel.target_table_id);
      }
    }

    const isolatedTableNames: string[] = [];

    for (const t of tables) {
      const isTableDoc = !!(t.business_description || t.business_domain || t.synonyms || t.usage_notes);
      if (isTableDoc) documentedTables++;

      if (!tablesWithEdges.has(t.id)) {
        isolatedTableNames.push(t.table_name);
      }

      for (const c of t.columns) {
        totalColumns++;
        if (c.business_description || c.synonyms || (c.display_name && c.display_name !== c.column_name)) {
          documentedColumns++;
        }
      }
    }

    const totalRelationships = relationships.length;
    const validatedRelationships = relationships.filter((r: any) => r.status === 'validated').length;
    const suggestedRelationships = relationships.filter((r: any) => r.status === 'suggested').length;

    return {
      totalTables,
      documentedTables,
      tablesDocumentationPct: totalTables > 0 ? Math.round((documentedTables / totalTables) * 100) : 0,
      totalColumns,
      documentedColumns,
      columnsDocumentationPct: totalColumns > 0 ? Math.round((documentedColumns / totalColumns) * 100) : 0,
      totalRelationships,
      validatedRelationships,
      suggestedRelationships,
      isolatedTablesCount: isolatedTableNames.length,
      isolatedTableNames,
      metricsCount,
      businessTermsCount,
      validatedQueriesCount,
    };
  }

  /**
   * Sugere automaticamente possíveis relacionamentos lógicos baseados em convenções de nomenclatura e tipos
   * (ex: tb_vendas.id_cliente -> tb_clientes.id ou cod_cliente)
   */
  static async detectRelationshipSuggestions(dataSourceId: string): Promise<SuggestedRelationship[]> {
    const tables = await (prisma as any).semanticTable.findMany({
      where: { data_source_id: dataSourceId },
      include: { columns: true },
    });

    const existingRels = await (prisma as any).semanticRelationship.findMany({
      where: { data_source_id: dataSourceId },
    });

    const existingRelKeys = new Set(
      existingRels.map(
        (r: any) => `${r.source_table_id}-${r.source_column_id}->${r.target_table_id}-${r.target_column_id}`
      )
    );

    const suggestions: SuggestedRelationship[] = [];

    // Mapeamento de tabelas por nome normalizado (remover tb_, tab_, tbl_, etc.)
    const cleanName = (str: string) => str.toLowerCase().replace(/^(tb_|tab_|tbl_|vw_)/, '').replace(/s$/, '');

    for (const sourceTable of tables) {
      for (const col of sourceTable.columns) {
        const colName = col.column_name.toLowerCase();

        // Ignorar se a própria coluna for a PK da tabela
        if (col.is_pk) continue;

        // Padrões de chave estrangeira lógica: id_<entidade>, <entidade>_id, cod_<entidade>, cd_<entidade>
        let targetEntity = '';
        if (colName.startsWith('id_')) targetEntity = colName.substring(3);
        else if (colName.endsWith('_id')) targetEntity = colName.substring(0, colName.length - 3);
        else if (colName.startsWith('cod_')) targetEntity = colName.substring(4);
        else if (colName.startsWith('cd_')) targetEntity = colName.substring(3);

        if (!targetEntity) continue;

        // Procurar tabelas candidatas cujo nome contenha targetEntity
        for (const candidateTable of tables) {
          if (candidateTable.id === sourceTable.id) continue;

          const candClean = cleanName(candidateTable.table_name);
          const entClean = cleanName(targetEntity);

          if (candClean === entClean || candClean.includes(entClean) || entClean.includes(candClean)) {
            // Procurar coluna PK ou id correspondente na tabela de destino
            const targetCol = candidateTable.columns.find(
              (c: any) => c.is_pk || c.column_name.toLowerCase() === 'id' || c.column_name.toLowerCase() === `id_${candClean}` || c.column_name.toLowerCase() === colName
            );

            if (targetCol) {
              const relKey = `${sourceTable.id}-${col.id}->${candidateTable.id}-${targetCol.id}`;
              const reverseKey = `${candidateTable.id}-${targetCol.id}->${sourceTable.id}-${col.id}`;

              if (!existingRelKeys.has(relKey) && !existingRelKeys.has(reverseKey)) {
                suggestions.push({
                  sourceTableId: sourceTable.id,
                  sourceTableName: sourceTable.table_name,
                  sourceColumnId: col.id,
                  sourceColumnName: col.column_name,
                  targetTableId: candidateTable.id,
                  targetTableName: candidateTable.table_name,
                  targetColumnId: targetCol.id,
                  targetColumnName: targetCol.column_name,
                  cardinality: 'N:1',
                  reason: `Correspondência de padrão entre [${sourceTable.table_name}.${col.column_name}] e chave primária de [${candidateTable.table_name}.${targetCol.column_name}]`,
                  confidenceScore: candClean === entClean ? 0.9 : 0.75,
                });
              }
            }
          }
        }
      }
    }

    return suggestions;
  }
}
