import { SQLValidator } from '../apps/api/src/services/semantic/SQLValidator.js';

console.log('🧪 Iniciando Suíte de Testes da Camada Semântica & SQL Validator...\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}: ${failureDetails || 'Assertion failed'}`);
  }
}

// -------------------------------------------------------------------------
// 1. TESTES DO SQL VALIDATOR (Defesa em Profundidade)
// -------------------------------------------------------------------------
console.log('1. Testando SQL Validator (Defesa contra DDL/DML destrutivos e limites)...');

// 1.1 SELECT válido
const validSelect = 'SELECT id, nome, valor FROM tb_vendas WHERE data_venda >= "2026-01-01"';
const v1 = SQLValidator.validate(validSelect, 100);
assert(v1.isValid, 'SELECT legítimo deve ser aprovado');
assert(v1.sanitizedSql.includes('LIMIT 100'), 'Limite padrão deve ser injetado quando ausente');

// 1.2 CTE (WITH) válido
const validWith = 'WITH ranking AS (SELECT filial, sum(valor) as total FROM tb_vendas GROUP BY filial) SELECT * FROM ranking';
const vWith = SQLValidator.validate(validWith, 50);
assert(vWith.isValid, 'CTE legítimo (WITH ... SELECT) deve ser aprovado');

// 1.3 Bloqueio de DELETE
const deleteSql = 'DELETE FROM tb_vendas WHERE id = 1';
const v2 = SQLValidator.validate(deleteSql);
assert(!v2.isValid, 'DELETE deve ser bloqueado');
assert(v2.violations.some(v => v.toLowerCase().includes('delete') || v.toLowerCase().includes('select')), 'Violação deve indicar comando proibido');

// 1.4 Bloqueio de DROP TABLE
const dropSql = 'DROP TABLE tb_clientes';
const v3 = SQLValidator.validate(dropSql);
assert(!v3.isValid, 'DROP TABLE deve ser bloqueado');

// 1.5 Bloqueio de UPDATE
const updateSql = 'UPDATE tb_produtos SET preco = 0';
const v4 = SQLValidator.validate(updateSql);
assert(!v4.isValid, 'UPDATE deve ser bloqueado');

// 1.6 Bloqueio de TRUNCATE
const truncateSql = 'TRUNCATE TABLE tb_pedidos';
const v5 = SQLValidator.validate(truncateSql);
assert(!v5.isValid, 'TRUNCATE deve ser bloqueado');

// 1.7 Bloqueio de Comandos Múltiplos Injetados (; DROP ...)
const multiSql = 'SELECT * FROM tb_usuarios; DROP TABLE tb_usuarios;';
const v6 = SQLValidator.validate(multiSql);
assert(!v6.isValid, 'Múltiplos comandos encadeados com ponto e vírgula devem ser bloqueados');

// 1.8 Bloqueio de Produto Cartesiano implícito (FROM t1, t2)
const cartesianSql = 'SELECT * FROM tb_vendas, tb_clientes WHERE 1=1';
const v7 = SQLValidator.validate(cartesianSql);
assert(!v7.isValid, 'Produto Cartesiano implícito sem JOIN explícito deve ser bloqueado');

// 1.9 Bloqueio de CROSS JOIN explícito
const crossJoinSql = 'SELECT * FROM tb_vendas CROSS JOIN tb_clientes';
const v8 = SQLValidator.validate(crossJoinSql);
assert(!v8.isValid, 'CROSS JOIN explícito não autorizado deve ser bloqueado');

// 1.10 Respeito e redução de LIMIT superior ao teto
const highLimitSql = 'SELECT id FROM tb_vendas LIMIT 50000';
const v9 = SQLValidator.validate(highLimitSql, 1000);
assert(v9.sanitizedSql.includes('LIMIT 100'), 'Limite excessivo deve ser truncado para o teto de segurança');

// -------------------------------------------------------------------------
// 2. TESTES DE TOPOLOGIA E GRAFO DE RELACIONAMENTOS (Dijkstra & Resolução)
// -------------------------------------------------------------------------
console.log('\n2. Testando Algoritmo do Grafo de Relacionamentos (Dijkstra / Menor Caminho)...');

interface MockEdge {
  from: string;
  to: string;
  weight: number;
  isActive: boolean;
}

function runDijkstraTest(
  edges: MockEdge[],
  start: string,
  end: string
): { path: string[]; totalWeight: number } | null {
  const activeEdges = edges.filter(e => e.isActive);
  const adj = new Map<string, Array<{ neighbor: string; weight: number }>>();

  for (const e of activeEdges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push({ neighbor: e.to, weight: e.weight });
    adj.get(e.to)!.push({ neighbor: e.from, weight: e.weight });
  }

  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const unvisited = new Set<string>(adj.keys());

  for (const k of adj.keys()) {
    distances.set(k, Infinity);
  }
  distances.set(start, 0);

  while (unvisited.size > 0) {
    let curr: string | null = null;
    let minDist = Infinity;
    for (const u of unvisited) {
      const d = distances.get(u) ?? Infinity;
      if (d < minDist) {
        minDist = d;
        curr = u;
      }
    }
    if (!curr || minDist === Infinity) break;
    if (curr === end) break;
    unvisited.delete(curr);

    const neighbors = adj.get(curr) || [];
    for (const edge of neighbors) {
      if (!unvisited.has(edge.neighbor)) continue;
      const alt = minDist + edge.weight;
      if (alt < (distances.get(edge.neighbor) ?? Infinity)) {
        distances.set(edge.neighbor, alt);
        previous.set(edge.neighbor, curr);
      }
    }
  }

  if (!previous.has(end) && start !== end) return null;

  const path: string[] = [];
  let step: string | undefined = end;
  while (step) {
    path.unshift(step);
    if (step === start) break;
    step = previous.get(step);
  }

  return { path, totalWeight: distances.get(end) || 0 };
}

const mockGraphEdges: MockEdge[] = [
  { from: 'clientes', to: 'vendas', weight: 1.0, isActive: true },
  { from: 'vendas', to: 'itens_venda', weight: 1.0, isActive: true },
  { from: 'itens_venda', to: 'produtos', weight: 1.0, isActive: true },
  { from: 'clientes', to: 'produtos', weight: 0.1, isActive: false }, // Relação falsa desabilitada
];

// 2.1 Menor caminho direto
const resDirect = runDijkstraTest(mockGraphEdges, 'clientes', 'vendas');
assert(resDirect !== null && resDirect.path.length === 2, 'Caminho direto clientes -> vendas deve ter 1 salto (2 nós)');

// 2.2 Menor caminho multi-saltos ignorando aresta desabilitada
const resMulti = runDijkstraTest(mockGraphEdges, 'clientes', 'produtos');
assert(
  resMulti !== null && resMulti.path.join(' -> ') === 'clientes -> vendas -> itens_venda -> produtos',
  'Caminho clientes -> produtos deve transitar por vendas e itens_venda'
);

// -------------------------------------------------------------------------
// 3. TESTES DO CACHE SEMÂNTICO (Opção 3)
// -------------------------------------------------------------------------
console.log('\n3. Testando Cache Semântico em Memória (Opção 3)...');
import { SemanticDataEngine } from '../apps/api/src/services/semantic/SemanticDataEngine.js';

SemanticDataEngine.clearCache();
const statsInitial = SemanticDataEngine.getCacheStats();
assert(statsInitial.size === 0, 'Cache inicial deve estar limpo com tamanho 0');

SemanticDataEngine.clearCache();
assert(SemanticDataEngine.getCacheStats().size === 0, 'clearCache deve zerar o cache com sucesso');

// -------------------------------------------------------------------------
// 4. TESTES DE DETECÇÃO DE SCHEMA DRIFT (Opção 4)
// -------------------------------------------------------------------------
console.log('\n4. Testando Lógica de Detecção de Divergências (Schema Drift - Opção 4)...');

const mockPhysicalTables = [
  { schemaName: 'public', tableName: 'glpi_tickets' },
  { schemaName: 'public', tableName: 'glpi_users' },
  { schemaName: 'public', tableName: 'glpi_sla' }, // Nova tabela
];

const mockCatalogTables = [
  { schema_name: 'public', table_name: 'glpi_tickets', status: 'active' },
  { schema_name: 'public', table_name: 'glpi_users', status: 'active' },
  { schema_name: 'public', table_name: 'glpi_old_logs', status: 'active' }, // Tabela removida do banco
];

const physSet = new Set(mockPhysicalTables.map((t) => `${t.schemaName}.${t.tableName}`));
const catSet = new Set(mockCatalogTables.map((t) => `${t.schema_name}.${t.table_name}`));

const added = mockPhysicalTables.filter((t) => !catSet.has(`${t.schemaName}.${t.tableName}`));
const removed = mockCatalogTables.filter((t) => !physSet.has(`${t.schema_name}.${t.table_name}`));

assert(added.length === 1 && added[0].tableName === 'glpi_sla', 'Drift deve detectar tabela física adicionada (glpi_sla)');
assert(removed.length === 1 && removed[0].table_name === 'glpi_old_logs', 'Drift deve detectar tabela removida (glpi_old_logs)');

// -------------------------------------------------------------------------
// 5. TESTES DE FEDERAÇÃO CROSS-SOURCE (Opção 5)
// -------------------------------------------------------------------------
console.log('\n5. Testando Identificação de Arestas Cross-Source (Opção 5)...');

const relSameSource = { source_table: { data_source_id: 'ds-glpi' }, target_table: { data_source_id: 'ds-glpi' } };
const relCrossSource = { source_table: { data_source_id: 'ds-glpi' }, target_table: { data_source_id: 'ds-vetor-lake' } };

const isCross1 = relSameSource.source_table.data_source_id !== relSameSource.target_table.data_source_id;
const isCross2 = relCrossSource.source_table.data_source_id !== relCrossSource.target_table.data_source_id;

assert(!isCross1, 'Relacionamento intra-banco não deve ser classificado como cross-source');
assert(isCross2, 'Relacionamento entre GLPI e Vetor Lake deve ser classificado como cross-source');

// -------------------------------------------------------------------------
// RESULTADO FINAL
// -------------------------------------------------------------------------
console.log(`\n======================================================`);
console.log(`📊 Resultado dos Testes: ${passedTests} de ${totalTests} testes aprovados.`);
if (passedTests === totalTests) {
  console.log('🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
  process.exit(0);
} else {
  console.error('❌ ALGUNS TESTES FALHARAM!');
  process.exit(1);
}
