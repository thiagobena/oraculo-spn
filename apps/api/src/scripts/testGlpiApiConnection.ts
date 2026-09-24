import { DatabaseService } from '../services/DatabaseService.js';
import { prisma } from '../db/prisma.js';

async function test() {
  const connector = await prisma.databaseConnector.findFirst({
    where: { category: 'api' }
  });

  if (!connector) {
    console.log('Nenhum conector de API encontrado.');
    return;
  }

  console.log('Testando conector:', connector.name, connector.host);
  const result = await DatabaseService.testConnection({
    category: connector.category,
    db_type: connector.db_type,
    host: connector.host || undefined,
    port: connector.port || undefined,
    database: connector.database || undefined,
    username: connector.username || undefined,
    password: connector.password || undefined,
    use_ssl: connector.use_ssl,
    config_json: connector.config_json || undefined,
  });

  console.log('Resultado do teste:', result);
}

test()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
