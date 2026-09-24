import { prisma } from '../db/prisma.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  console.log('Verificando conectores existentes no banco...');
  const connectors = await prisma.databaseConnector.findMany();
  console.log('Conectores encontrados:', connectors.map(c => ({ id: c.id, name: c.name, category: c.category, db_type: c.db_type, host: c.host })));

  const apiUrl = process.env.GLPI_API_URL || 'https://spn-grupo-glpi.rncdqt.easypanel.host/apirest.php';
  const appToken = process.env.GLPI_APP_TOKEN || 'uosK8MgxHXqs6gfOBHh2RzSidmD0BfB6zBcpGS0I';
  const username = process.env.GLPI_API_USER || 'oraculo_ia';
  const password = process.env.GLPI_API_PASSWORD || 'IA@2026.';

  const configJson = JSON.stringify({
    apiUrl,
    baseUrl: apiUrl,
    appToken,
    username,
    password,
    description: 'API REST oficial do GLPI para abertura, acompanhamento e consulta de chamados e ativos.',
  }, null, 2);

  // Verificar se já existe um conector para a API REST do GLPI
  const existingApi = connectors.find(c => 
    c.category === 'api' && (c.name.toLowerCase().includes('glpi') || (c.host && c.host.includes('glpi')))
  );

  if (existingApi) {
    console.log('Conector de API REST do GLPI já existe:', existingApi.id);
    const updated = await prisma.databaseConnector.update({
      where: { id: existingApi.id },
      data: {
        name: 'GLPI - API REST & Webhook',
        category: 'api',
        db_type: 'rest_api',
        host: apiUrl,
        port: 443,
        database: 'glpi',
        username: username,
        password: password,
        use_ssl: true,
        is_active: true,
        description: 'Endpoint da API REST oficial do GLPI (apirest.php) para integração e automação de chamados.',
        config_json: configJson,
        mode: 'action_tool',
      }
    });
    console.log('Conector atualizado com sucesso:', updated);
  } else {
    console.log('Criando novo conector para API REST do GLPI...');
    const created = await prisma.databaseConnector.create({
      data: {
        name: 'GLPI - API REST & Webhook',
        category: 'api',
        db_type: 'rest_api',
        host: apiUrl,
        port: 443,
        database: 'glpi',
        username: username,
        password: password,
        use_ssl: true,
        is_active: true,
        description: 'Endpoint da API REST oficial do GLPI (apirest.php) para integração e automação de chamados.',
        config_json: configJson,
        mode: 'action_tool',
      }
    });
    console.log('Conector criado com sucesso:', created);
  }
}

main()
  .catch(err => {
    console.error('Erro ao executar:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
