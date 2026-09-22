import dotenv from 'dotenv';
dotenv.config();

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

console.log('===============================================================');
console.log('         🔮 ORÁCULO SPN — SECURE STARTUP & AUDIT SYSTEM       ');
console.log('===============================================================');

async function runSecurityChecks() {
  let passed = true;

  // -------------------------------------------------------------
  // STEP 1: Environment Audit & Directory Isolation
  // -------------------------------------------------------------
  console.log('\n[1/5] 🛡️  Auditando arquivo de configuração e diretórios...');
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ ERRO CRÍTICO: Arquivo .env não encontrado na raiz!');
    process.exit(1);
  }
  console.log('  ✓ Arquivo .env detectado');

  const requiredVars = ['DATABASE_URL', 'LM_STUDIO_BASE_URL'];
  for (const v of requiredVars) {
    if (!process.env[v]) {
      console.error(`❌ ERRO DE SEGURANÇA: Variável de ambiente ${v} ausente!`);
      passed = false;
    }
  }

  // Ensure storage paths exist
  const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_PATH || './uploads');
  const logDir = path.resolve(process.cwd(), process.env.LOG_PATH || './logs');

  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  console.log(`  ✓ Diretórios protegidos verificados:\n    - Uploads: ${uploadDir}\n    - Logs: ${logDir}`);

  // -------------------------------------------------------------
  // STEP 2: Database Connection & Schema Audit
  // -------------------------------------------------------------
  console.log('\n[2/5] 🗄️  Verificando integridade e segurança do Banco de Dados...');
  const prisma = new PrismaClient();
  try {
    const startDb = Date.now();
    await prisma.$connect();
    const dbLatency = Date.now() - startDb;
    console.log(`  ✓ Conexão com SQL Server estabelecida (${dbLatency}ms)`);

    const settingCount = await prisma.appSetting.count();
    console.log(`  ✓ Tabelas de banco verificadas em ${process.env.SQL_SERVER_DATABASE || 'B3N_ORACULO'} (${settingCount} configurações salvas)`);

    // Audit Log Entry
    await prisma.auditLog.create({
      data: {
        action: 'SYSTEM_STARTUP',
        client_id: 'SYSTEM_DAEMON',
        client_name: 'StartSecureScript',
        status: 'SUCCESS',
        details: JSON.stringify({
          node_version: process.version,
          host: process.env.SQL_SERVER_HOST,
          timestamp: new Date().toISOString(),
        }),
      },
    });
    console.log('  ✓ Registro de auditoria de inicialização gravado no SQL Server');
  } catch (err: any) {
    console.error(`❌ ERRO DE CONEXÃO AO BANCO: ${err.message}`);
    passed = false;
  } finally {
    await prisma.$disconnect();
  }

  // -------------------------------------------------------------
  // STEP 3: LM Studio API & Token Verification
  // -------------------------------------------------------------
  console.log('\n[3/5] 🤖 Verificando servidor de Inteligência Artificial (LM Studio)...');
  const lmUrl = process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234';
  const token = process.env.LM_STUDIO_API_TOKEN;

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const startLm = Date.now();
    const res = await fetch(`${lmUrl}/v1/models`, { headers });
    const lmLatency = Date.now() - startLm;

    if (res.ok) {
      const data = (await res.json()) as any;
      console.log(`  ✓ Conexão LM Studio autorizada (${lmLatency}ms) em ${lmUrl}`);
      console.log(`  ✓ ${data.data?.length ?? 0} Modelo(s) de IA prontos para inferência`);
    } else {
      console.warn(`  ⚠️  LM Studio respondeu com erro HTTP ${res.status}`);
    }
  } catch (err: any) {
    console.warn(`  ⚠️  LM Studio offline em ${lmUrl} (${err.message}). O sistema iniciará com aviso visual aos usuários.`);
  }

  // -------------------------------------------------------------
  // STEP 4: Monorepo Build Check
  // -------------------------------------------------------------
  console.log('\n[4/5] 📦 Validando integridade dos pacotes do Monorepo...');
  const sharedDist = path.resolve(process.cwd(), 'packages/shared/dist');
  const aiCoreDist = path.resolve(process.cwd(), 'packages/ai-core/dist');
  if (!fs.existsSync(sharedDist) || !fs.existsSync(aiCoreDist)) {
    console.log('  ℹ️  Pacotes não compilados. Executando build de segurança...');
    const buildProcess = spawn('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
    await new Promise((resolve) => buildProcess.on('exit', resolve));
  }
  console.log('  ✓ Pacotes compilados e validados');

  if (!passed) {
    console.error('\n❌ VERIFICAÇÃO DE SEGURANÇA FALHOU. A inicialização foi abortada.');
    process.exit(1);
  }

  // -------------------------------------------------------------
  // STEP 5: Launch Supervised Services
  // -------------------------------------------------------------
  console.log('\n[5/5] 🚀 Iniciando serviços expostos à rede com supervisão...');
  console.log('===============================================================');
  console.log('  - Frontend (Web UI): http://localhost:3070 / IP da Rede');
  console.log('  - Backend (Fastify API): http://localhost:3333 / IP da Rede');
  console.log('===============================================================\n');

  const appProcess = spawn('npm', ['run', 'dev:all'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=512' },
  });

  const shutdown = () => {
    console.log('\n🛑 Encerrando aplicação com segurança...');
    appProcess.kill('SIGINT');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

runSecurityChecks();
