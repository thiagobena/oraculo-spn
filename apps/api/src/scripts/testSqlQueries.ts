import { DatabaseService } from '../services/DatabaseService.js';
import { prisma } from '../db/prisma.js';

async function testSqlPresets() {
  const glpiConn = await prisma.databaseConnector.findFirst({
    where: { category: 'database', name: { contains: 'glpi' } }
  });

  if (!glpiConn) {
    console.log('Conector GLPI não encontrado!');
    return;
  }

  console.log('Testando queries no conector GLPI:', glpiConn.id);

  const testQueries = [
    {
      name: 'Triagem / Sem Atribuição',
      sql: `SELECT t.id, t.name AS titulo, t.date AS data_abertura, 
       COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
       COALESCE(u.name, 'Desconhecido') AS requerente
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu ON (t.id = tu.tickets_id AND tu.type = 1)
LEFT JOIN glpi_users u ON tu.users_id = u.id
WHERE t.is_deleted = 0 
  AND t.status = 1 
  AND NOT EXISTS (SELECT 1 FROM glpi_tickets_users WHERE tickets_id = t.id AND type = 2)
ORDER BY t.date ASC LIMIT 10;`
    },
    {
      name: 'Violação de SLA por Categoria',
      sql: `SELECT COALESCE(c.name, 'Sem Categoria') AS categoria,
       COUNT(*) AS total_estourados
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
WHERE t.is_deleted = 0 
  AND t.status NOT IN (5, 6) 
  AND t.time_to_resolve IS NOT NULL 
  AND t.time_to_resolve < NOW()
GROUP BY c.id, c.name
ORDER BY total_estourados DESC LIMIT 10;`
    },
    {
      name: 'Top Requerentes do Mês',
      sql: `SELECT COALESCE(NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '), u.name, 'Desconhecido') AS requerente,
       COUNT(*) AS total_chamados
FROM glpi_tickets t
JOIN glpi_tickets_users tu ON (t.id = tu.tickets_id AND tu.type = 1)
JOIN glpi_users u ON tu.users_id = u.id
WHERE t.is_deleted = 0 
  AND t.date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY u.id, u.firstname, u.realname, u.name
ORDER BY total_chamados DESC LIMIT 10;`
    }
  ];

  for (const t of testQueries) {
    try {
      const res = await DatabaseService.executeQuery(glpiConn.id, t.sql);
      console.log(`✅ [${t.name}] OK -> Retornou ${res.totalRows ?? 0} linhas`);
    } catch (err: any) {
      console.error(`❌ [${t.name}] ERRO:`, err.message);
    }
  }
}

testSqlPresets()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
