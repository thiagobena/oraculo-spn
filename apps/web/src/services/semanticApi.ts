export interface SemanticGraphNode {
  id: string;
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

export interface SemanticGraphEdge {
  id: string;
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

export interface BusinessTermItem {
  id: string;
  dataSourceId?: string | null;
  name: string;
  description: string;
  synonyms?: string | null;
  businessDomain?: string | null;
  formula?: string | null;
  semanticExpression?: string | null;
  defaultFilters?: string | null;
  active: boolean;
  createdAt: string;
}

export interface SemanticMetricItem {
  id: string;
  dataSourceId?: string | null;
  name: string;
  description: string;
  formula: string;
  aggregation: string;
  baseTable: string;
  requiredRelationships?: string | null;
  defaultFilters?: string | null;
  timeColumn?: string | null;
  synonyms?: string | null;
  active: boolean;
}

export interface ValidatedQueryItem {
  id: string;
  dataSourceId?: string | null;
  question: string;
  sql: string;
  tablesUsed?: string | null;
  tags?: string | null;
  validationStatus: string;
  usageCount: number;
  createdAt: string;
}

export interface SemanticCoverageData {
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

export interface SuggestedRelItem {
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

// 1. Sincronização de Schema
export async function syncSemanticSchemaApi(token: string, dataSourceId: string) {
  const res = await fetch('/api/semantic/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ dataSourceId }),
  });
  return await res.json();
}

// 2. Grafo Semântico
export async function fetchSemanticGraphApi(token: string, dataSourceId?: string): Promise<{ success: boolean; nodes: SemanticGraphNode[]; edges: SemanticGraphEdge[] }> {
  const url = dataSourceId ? `/api/semantic/graph?dataSourceId=${dataSourceId}` : '/api/semantic/graph';
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return await res.json();
}

// 2.1 Salvar Posições de Layout
export async function saveSemanticLayoutApi(token: string, positions: Array<{ id: string; posX: number; posY: number }>) {
  const res = await fetch('/api/semantic/layout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ positions }),
  });
  return await res.json();
}

// 3. Atualizar Tabela Semântica
export async function updateSemanticTableApi(token: string, id: string, data: any) {
  const res = await fetch(`/api/semantic/tables/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  return await res.json();
}

// 4. Atualizar Coluna Semântica
export async function updateSemanticColumnApi(token: string, id: string, data: any) {
  const res = await fetch(`/api/semantic/columns/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  return await res.json();
}

// 5. Relacionamentos
export async function createSemanticRelationshipApi(token: string, data: any) {
  const res = await fetch('/api/semantic/relationships', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  return await res.json();
}

export async function updateSemanticRelationshipApi(token: string, id: string, data: any) {
  const res = await fetch(`/api/semantic/relationships/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  return await res.json();
}

export async function deleteSemanticRelationshipApi(token: string, id: string) {
  const res = await fetch(`/api/semantic/relationships/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return await res.json();
}

// 6. Dicionário de Negócio
export async function fetchBusinessTermsApi(token: string, dataSourceId?: string): Promise<{ success: boolean; terms: BusinessTermItem[] }> {
  const url = dataSourceId ? `/api/semantic/business-terms?dataSourceId=${dataSourceId}` : '/api/semantic/business-terms';
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return await res.json();
}

export async function createBusinessTermApi(token: string, data: any) {
  const res = await fetch('/api/semantic/business-terms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  return await res.json();
}

export async function deleteBusinessTermApi(token: string, id: string) {
  const res = await fetch(`/api/semantic/business-terms/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return await res.json();
}

// 7. Métricas
export async function fetchSemanticMetricsApi(token: string, dataSourceId?: string): Promise<{ success: boolean; metrics: SemanticMetricItem[] }> {
  const url = dataSourceId ? `/api/semantic/metrics?dataSourceId=${dataSourceId}` : '/api/semantic/metrics';
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return await res.json();
}

export async function createSemanticMetricApi(token: string, data: any) {
  const res = await fetch('/api/semantic/metrics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  return await res.json();
}

export async function deleteSemanticMetricApi(token: string, id: string) {
  const res = await fetch(`/api/semantic/metrics/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return await res.json();
}

// 8. Consultas Validadas
export async function fetchValidatedQueriesApi(token: string, dataSourceId?: string): Promise<{ success: boolean; queries: ValidatedQueryItem[] }> {
  const url = dataSourceId ? `/api/semantic/validated-queries?dataSourceId=${dataSourceId}` : '/api/semantic/validated-queries';
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return await res.json();
}

export async function createValidatedQueryApi(token: string, data: any) {
  const res = await fetch('/api/semantic/validated-queries', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  return await res.json();
}

// 9. Diagnóstico & Sugestões
export async function fetchSemanticDiagnosticApi(token: string, dataSourceId?: string): Promise<{ success: boolean; coverage: SemanticCoverageData }> {
  const url = dataSourceId ? `/api/semantic/diagnostic?dataSourceId=${dataSourceId}` : '/api/semantic/diagnostic';
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return await res.json();
}

export async function fetchSemanticSuggestionsApi(token: string, dataSourceId: string): Promise<{ success: boolean; suggestions: SuggestedRelItem[] }> {
  const res = await fetch(`/api/semantic/suggestions?dataSourceId=${dataSourceId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return await res.json();
}

// 10. Laboratório de Teste Semântico
export async function askSemanticLabApi(token: string, question: string, dataSourceId: string) {
  const res = await fetch('/api/semantic/lab/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ question, dataSourceId }),
  });
  return await res.json();
}
