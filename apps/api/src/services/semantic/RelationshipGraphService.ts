import { prisma } from '../../db/prisma.js';

export interface GraphNode {
  id: string;
  dataSourceId: string;
  tableName: string;
  schemaName: string;
  displayName: string;
  businessDescription?: string | null;
  domain?: string | null;
  synonyms?: string | null;
  usageNotes?: string | null;
  doNotUseNotes?: string | null;
  aiEnabled: boolean;
  priority: string;
  status: string;
  columnsCount: number;
  posX: number;
  posY: number;
  columns: Array<{
    id: string;
    columnName: string;
    displayName?: string | null;
    dataType: string;
    isPk: boolean;
    isFk: boolean;
    classification: string;
    aiEnabled: boolean;
  }>;
}

export interface GraphEdge {
  id: string;
  dataSourceId: string;
  isCrossSource: boolean;
  sourceDataSourceId?: string;
  targetDataSourceId?: string;
  sourceTableId: string;
  sourceColumnId: string;
  sourceColumnName: string;
  targetTableId: string;
  targetColumnId: string;
  targetColumnName: string;
  cardinality: string;
  relType: string;
  joinType: string;
  joinExpression?: string | null;
  businessDescription?: string | null;
  confidence: string;
  status: string;
  priority: string;
}

export interface PathStep {
  fromTableId: string;
  fromTableName: string;
  toTableId: string;
  toTableName: string;
  relationshipId: string;
  joinType: string;
  joinExpression: string;
  cardinality: string;
}

export interface GraphPath {
  tables: string[]; // Table IDs in traversal order
  tableNames: string[];
  steps: PathStep[];
  totalWeight: number;
  isAmbiguous: boolean;
}

export class RelationshipGraphService {
  /**
   * Retorna os nós e arestas formatados para o visualizador (React Flow / Mapa Semântico)
   */
  static async getGraph(dataSourceId?: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const tableWhere = dataSourceId ? { data_source_id: dataSourceId } : {};
    const relWhere = dataSourceId
      ? {
          OR: [
            { data_source_id: dataSourceId },
            { source_table: { data_source_id: dataSourceId } },
            { target_table: { data_source_id: dataSourceId } },
          ],
        }
      : {};

    const tables = await (prisma as any).semanticTable.findMany({
      where: tableWhere,
      include: {
        columns: {
          orderBy: { column_name: 'asc' },
        },
      },
      orderBy: { table_name: 'asc' },
    });

    const relationships = await (prisma as any).semanticRelationship.findMany({
      where: relWhere,
      include: {
        source_table: {
          include: {
            columns: { orderBy: { column_name: 'asc' } },
          },
        },
        source_column: true,
        target_table: {
          include: {
            columns: { orderBy: { column_name: 'asc' } },
          },
        },
        target_column: true,
      },
    });

    // Se houver tabelas conectadas via cross-source que não estejam em tables, incluir para completar o grafo
    const tableMap = new Map<string, any>();
    for (const t of tables) {
      tableMap.set(t.id, t);
    }

    for (const r of relationships) {
      if (r.source_table && !tableMap.has(r.source_table.id)) {
        tableMap.set(r.source_table.id, r.source_table);
      }
      if (r.target_table && !tableMap.has(r.target_table.id)) {
        tableMap.set(r.target_table.id, r.target_table);
      }
    }

    const allTables = Array.from(tableMap.values());

    const nodes: GraphNode[] = allTables.map((t: any) => ({
      id: t.id,
      dataSourceId: t.data_source_id,
      tableName: t.table_name,
      schemaName: t.schema_name,
      displayName: t.display_name || t.table_name,
      businessDescription: t.business_description,
      domain: t.business_domain,
      synonyms: t.synonyms,
      usageNotes: t.usage_notes,
      doNotUseNotes: t.do_not_use_notes,
      aiEnabled: t.ai_enabled,
      priority: t.priority,
      status: t.status,
      columnsCount: t.columns?.length || 0,
      posX: t.pos_x ?? 0,
      posY: t.pos_y ?? 0,
      columns: (t.columns || []).map((c: any) => ({
        id: c.id,
        columnName: c.column_name,
        displayName: c.display_name || c.column_name,
        dataType: c.data_type,
        isPk: c.is_pk,
        isFk: c.is_fk,
        classification: c.classification,
        aiEnabled: c.ai_enabled,
      })),
    }));

    const edges: GraphEdge[] = relationships.map((r: any) => {
      const isCross = r.source_table?.data_source_id !== r.target_table?.data_source_id;
      return {
        id: r.id,
        dataSourceId: r.data_source_id,
        isCrossSource: isCross,
        sourceDataSourceId: r.source_table?.data_source_id,
        targetDataSourceId: r.target_table?.data_source_id,
        sourceTableId: r.source_table_id,
        sourceColumnId: r.source_column_id,
        sourceColumnName: r.source_column?.column_name || 'id',
        targetTableId: r.target_table_id,
        targetColumnId: r.target_column_id,
        targetColumnName: r.target_column?.column_name || 'id',
        cardinality: r.cardinality,
        relType: isCross ? 'cross_source' : r.rel_type,
        joinType: r.join_type,
        joinExpression:
          r.join_expression ||
          `${r.source_table?.table_name}.${r.source_column?.column_name} = ${r.target_table?.table_name}.${r.target_column?.column_name}`,
        businessDescription: r.business_description,
        confidence: r.confidence,
        status: r.status,
        priority: r.priority,
      };
    });

    return { nodes, edges };
  }

  /**
   * Busca a vizinhança de uma tabela (1 a 3 saltos) para visualização focada no mapa
   */
  static async getNeighborhood(tableId: string, hops: number = 1): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const fullGraph = await this.getGraph();
    const visitedTableIds = new Set<string>([tableId]);
    let currentLevel = new Set<string>([tableId]);

    const boundedHops = Math.min(Math.max(hops, 1), 3);

    for (let i = 0; i < boundedHops; i++) {
      const nextLevel = new Set<string>();
      for (const edge of fullGraph.edges) {
        if (currentLevel.has(edge.sourceTableId) && !visitedTableIds.has(edge.targetTableId)) {
          visitedTableIds.add(edge.targetTableId);
          nextLevel.add(edge.targetTableId);
        }
        if (currentLevel.has(edge.targetTableId) && !visitedTableIds.has(edge.sourceTableId)) {
          visitedTableIds.add(edge.sourceTableId);
          nextLevel.add(edge.sourceTableId);
        }
      }
      currentLevel = nextLevel;
    }

    const filteredNodes = fullGraph.nodes.filter((n) => visitedTableIds.has(n.id));
    const filteredEdges = fullGraph.edges.filter(
      (e) => visitedTableIds.has(e.sourceTableId) && visitedTableIds.has(e.targetTableId)
    );

    return { nodes: filteredNodes, edges: filteredEdges };
  }

  /**
   * Encontra o menor caminho e valida conexões entre múltiplas tabelas usando busca ponderada no grafo.
   * Prioriza relações validadas e descarta relações desabilitadas ou rejeitadas.
   */
  static async findPathBetweenTables(
    startTableId: string,
    targetTableId: string,
    dataSourceId?: string
  ): Promise<GraphPath | null> {
    if (startTableId === targetTableId) {
      const table = await (prisma as any).semanticTable.findUnique({ where: { id: startTableId } });
      return {
        tables: [startTableId],
        tableNames: [table?.table_name || ''],
        steps: [],
        totalWeight: 0,
        isAmbiguous: false,
      };
    }

    const { nodes, edges } = await this.getGraph(dataSourceId);
    const tableMap = new Map(nodes.map((n) => [n.id, n]));

    // Filtrar apenas arestas operáveis (não desabilitadas e não rejeitadas)
    const validEdges = edges.filter((e) => e.status !== 'disabled' && e.status !== 'rejected');

    // Construção de Adjacency List bidirecional (JOINs podem ser navegados em ambos os sentidos)
    interface AdjEdge {
      edgeId: string;
      neighborId: string;
      joinType: string;
      joinExpression: string;
      cardinality: string;
      weight: number;
    }

    const adj = new Map<string, AdjEdge[]>();
    for (const node of nodes) {
      adj.set(node.id, []);
    }

    for (const edge of validEdges) {
      // Cálculo de peso: relações validadas têm menor custo (1.0), sugeridas custam mais (2.5), prioridade alta tem desconto
      let weight = edge.status === 'validated' ? 1.0 : 2.5;
      if (edge.priority === 'high') weight *= 0.8;
      if (edge.priority === 'low') weight *= 1.5;

      const forwardExpr = edge.joinExpression || `${tableMap.get(edge.sourceTableId)?.tableName}.${edge.sourceColumnName} = ${tableMap.get(edge.targetTableId)?.tableName}.${edge.targetColumnName}`;
      const reverseExpr = `${tableMap.get(edge.targetTableId)?.tableName}.${edge.targetColumnName} = ${tableMap.get(edge.sourceTableId)?.tableName}.${edge.sourceColumnName}`;

      adj.get(edge.sourceTableId)?.push({
        edgeId: edge.id,
        neighborId: edge.targetTableId,
        joinType: edge.joinType,
        joinExpression: forwardExpr,
        cardinality: edge.cardinality,
        weight,
      });

      adj.get(edge.targetTableId)?.push({
        edgeId: edge.id,
        neighborId: edge.sourceTableId,
        joinType: edge.joinType,
        joinExpression: reverseExpr,
        cardinality: edge.cardinality,
        weight,
      });
    }

    // Algoritmo de Dijkstra para menor caminho ponderado
    const distances = new Map<string, number>();
    const previous = new Map<string, { neighborId: string; step: PathStep; weight: number }>();
    const unvisited = new Set<string>();

    for (const node of nodes) {
      distances.set(node.id, Infinity);
      unvisited.add(node.id);
    }
    distances.set(startTableId, 0);

    while (unvisited.size > 0) {
      // Obter nó não visitado com menor distância
      let currentId: string | null = null;
      let minDistance = Infinity;
      for (const id of unvisited) {
        const d = distances.get(id) ?? Infinity;
        if (d < minDistance) {
          minDistance = d;
          currentId = id;
        }
      }

      if (!currentId || minDistance === Infinity) break;
      if (currentId === targetTableId) break;

      unvisited.delete(currentId);

      const neighbors = adj.get(currentId) || [];
      for (const edge of neighbors) {
        if (!unvisited.has(edge.neighborId)) continue;
        const newDist = minDistance + edge.weight;
        if (newDist < (distances.get(edge.neighborId) ?? Infinity)) {
          distances.set(edge.neighborId, newDist);
          previous.set(edge.neighborId, {
            neighborId: currentId,
            step: {
              fromTableId: currentId,
              fromTableName: tableMap.get(currentId)?.tableName || '',
              toTableId: edge.neighborId,
              toTableName: tableMap.get(edge.neighborId)?.tableName || '',
              relationshipId: edge.edgeId,
              joinType: edge.joinType,
              joinExpression: edge.joinExpression,
              cardinality: edge.cardinality,
            },
            weight: edge.weight,
          });
        }
      }
    }

    if (!previous.has(targetTableId) && startTableId !== targetTableId) {
      return null; // Nenhum caminho válido
    }

    // Reconstrução do caminho
    const steps: PathStep[] = [];
    const tableIdSequence: string[] = [];
    let curr = targetTableId;

    while (curr !== startTableId) {
      const prev = previous.get(curr);
      if (!prev) break;
      steps.unshift(prev.step);
      tableIdSequence.unshift(curr);
      curr = prev.neighborId;
    }
    tableIdSequence.unshift(startTableId);

    const tableNames = tableIdSequence.map((id) => tableMap.get(id)?.tableName || id);

    return {
      tables: tableIdSequence,
      tableNames,
      steps,
      totalWeight: distances.get(targetTableId) || 0,
      isAmbiguous: false,
    };
  }

  /**
   * Conecta um conjunto de tabelas requisitadas no menor subgrafo conexo (Steiner tree aproximada)
   */
  static async resolveSubgraphForTables(
    tableIds: string[],
    dataSourceId?: string
  ): Promise<{ resolvedTables: string[]; steps: PathStep[] }> {
    if (tableIds.length === 0) return { resolvedTables: [], steps: [] };
    if (tableIds.length === 1) return { resolvedTables: tableIds, steps: [] };

    const resolvedTables = new Set<string>([tableIds[0]]);
    const stepsMap = new Map<string, PathStep>(); // relationshipId -> PathStep

    for (let i = 1; i < tableIds.length; i++) {
      const targetId = tableIds[i];
      if (resolvedTables.has(targetId)) continue;

      let bestPath: GraphPath | null = null;
      let minWeight = Infinity;

      // Tenta conectar targetId a qualquer nó já incluído na árvore
      for (const existingId of resolvedTables) {
        const path = await this.findPathBetweenTables(existingId, targetId, dataSourceId);
        if (path && path.totalWeight < minWeight) {
          minWeight = path.totalWeight;
          bestPath = path;
        }
      }

      if (bestPath) {
        for (const tid of bestPath.tables) {
          resolvedTables.add(tid);
        }
        for (const s of bestPath.steps) {
          stepsMap.set(s.relationshipId, s);
        }
      } else {
        // Tabela isolada
        resolvedTables.add(targetId);
      }
    }

    return {
      resolvedTables: Array.from(resolvedTables),
      steps: Array.from(stepsMap.values()),
    };
  }
}
