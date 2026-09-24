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
