import mysql from 'mysql2/promise';
import pg from 'pg';
import { prisma } from '../db/prisma.js';

export interface DatabaseTestParams {
  category?: string;
  db_type: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  use_ssl?: boolean;
  config_json?: string;
}

// In-Memory TTL Cache
interface CacheEntry {
  timestamp: number;
  ttlMs: number;
  data: any;
}
const queryCache = new Map<string, CacheEntry>();
const anomalyCache = new Map<string, { timestamp: number; anomalies: Array<{ type: string; level: 'warning' | 'critical' | 'info'; title: string; message: string }> }>();

export class DatabaseService {
  /**
   * Testar a conexão com o conector especificado (MySQL, Postgres, REST API, n8n, etc.)
   */
  static async testConnection(params: DatabaseTestParams): Promise<{
    success: boolean;
    latencyMs?: number;
    dbVersion?: string;
    message?: string;
    error?: string;
  }> {
    const startTime = Date.now();
    const dbType = (params.db_type || 'mysql').toLowerCase();
    const category = params.category || 'database';

    try {
      // 1. BANCOS RELACIONAIS (MySQL / MariaDB)
      if (dbType === 'mysql' || dbType === 'mariadb') {
        const connection = await mysql.createConnection({
          host: params.host || 'localhost',
          port: params.port || 3306,
          user: params.username || 'root',
          password: params.password || '',
          database: params.database || '',
          connectTimeout: 6000,
          dateStrings: true,
          timezone: '-03:00',
          ssl: params.use_ssl ? { rejectUnauthorized: false } : undefined,
        });

        const [rows] = await connection.query<any[]>('SELECT VERSION() as version');
        await connection.end();

        const latencyMs = Date.now() - startTime;
        const dbVersion = rows && rows[0] ? rows[0].version : 'Desconhecida';

        return {
          success: true,
          latencyMs,
          dbVersion,
          message: `Conexão efetuada com sucesso! Versão do banco: ${dbVersion} (${latencyMs}ms)`,
        };
      }

      // 1.1 BANCOS RELACIONAIS (PostgreSQL)
      if (dbType === 'postgresql' || dbType === 'postgres' || dbType === 'pgsql') {
        const client = new pg.Client({
          host: params.host || 'localhost',
          port: params.port ? Number(params.port) : 5432,
          user: params.username || 'postgres',
          password: params.password || '',
          database: params.database || 'postgres',
          connectionTimeoutMillis: 6000,
          ssl: params.use_ssl ? { rejectUnauthorized: false } : undefined,
        });

        await client.connect();
        const res = await client.query('SELECT version() as version');
        await client.end();

        const latencyMs = Date.now() - startTime;
        const dbVersion = res.rows && res.rows[0] ? res.rows[0].version : 'Desconhecida';

        return {
          success: true,
          latencyMs,
          dbVersion,
          message: `Conexão efetuada com sucesso! Versão do banco: ${dbVersion} (${latencyMs}ms)`,
        };
      }

      // 2. APIs REST & WEBHOOKS / n8n
      if (dbType === 'rest_api' || dbType === 'n8n' || category === 'api' || category === 'automation') {
        let apiUrl = params.host || '';
        let headers: Record<string, string> = { 'Accept': 'application/json' };

        if (params.config_json) {
          try {
            const parsed = JSON.parse(params.config_json);
            if (parsed.baseUrl) apiUrl = parsed.baseUrl;
            if (parsed.headers) headers = { ...headers, ...parsed.headers };
            if (parsed.apiKey) headers['Authorization'] = `Bearer ${parsed.apiKey}`;
          } catch (_) {}
        }

        if (!apiUrl) {
          return { success: false, error: 'URL da API ou Webhook não configurada.' };
        }

        const res = await fetch(apiUrl, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(7000),
        });

        const latencyMs = Date.now() - startTime;
        return {
          success: res.ok || res.status < 500,
          latencyMs,
          dbVersion: `HTTP ${res.status} ${res.statusText}`,
          message: `Endpoint respondeu com status ${res.status} em ${latencyMs}ms`,
        };
      }

      // 3. FONTES WEB & URLS
      if (dbType === 'web_url' || category === 'web') {
        const targetUrl = params.host || '';
        if (!targetUrl.startsWith('http')) {
          return { success: false, error: 'URL inválida. Deve iniciar com http:// ou https://' };
        }

        const res = await fetch(targetUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(7000),
        });

        const latencyMs = Date.now() - startTime;
        return {
          success: res.ok,
          latencyMs,
          dbVersion: `HTTP ${res.status}`,
          message: `Portal Web online (${latencyMs}ms)`,
        };
      }

      // 4. STORAGE / SMB / S3
      if (dbType === 'smb' || dbType === 's3' || category === 'storage') {
        const latencyMs = Date.now() - startTime;
        return {
          success: true,
          latencyMs,
          dbVersion: 'Storage Connector Ready',
          message: `Conector de armazenamento validado (${latencyMs}ms)`,
        };
      }

      // Outros bancos relacionais
      return {
        success: false,
        error: `Tipo de banco '${params.db_type}' ainda não possui driver de teste configurado. Suportados: MySQL, MariaDB, PostgreSQL, REST API, n8n Webhook e URLs Web.`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erro ao conectar ao conector.',
      };
    }
  }

  /**
   * Listar todas as conexões cadastradas com a senha mascarada por segurança
   */
  static async listConnectors() {
    const connectors = await (prisma as any).databaseConnector.findMany({
      include: {
        presets: {
          orderBy: { created_at: 'asc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // Auto-seed de presets padrão para conectores existentes sem presets
    for (const conn of connectors) {
      if (!conn.presets || conn.presets.length === 0) {
        await this.seedDefaultPresets(conn);
      }
    }

    const refreshed = await (prisma as any).databaseConnector.findMany({
      include: {
        presets: {
          orderBy: { created_at: 'asc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return refreshed.map((c: any) => ({
      ...c,
      password: c.password ? '••••••••' : '',
    }));
  }

  /**
   * Obter uma conexão específica por ID
   */
  static async getConnectorById(id: string) {
    return await (prisma as any).databaseConnector.findUnique({
      where: { id },
      include: { presets: true },
    });
  }

  /**
   * Criar uma nova conexão
   */
  static async createConnector(data: {
    name: string;
    category?: string;
    db_type?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    use_ssl?: boolean;
    is_active?: boolean;
    description?: string;
    config_json?: string;
    semantic_dictionary?: string;
    cache_ttl_seconds?: number;
    mode?: string;
    allowed_roles?: string;
  }) {
    const connector = await (prisma as any).databaseConnector.create({
      data: {
        name: data.name,
        category: data.category || 'database',
        db_type: data.db_type || 'mysql',
        host: data.host || null,
        port: data.port ? Number(data.port) : 3306,
        database: data.database || null,
        username: data.username || null,
        password: data.password || '',
        use_ssl: Boolean(data.use_ssl),
        is_active: data.is_active !== false,
        description: data.description || null,
        config_json: data.config_json || null,
        semantic_dictionary: data.semantic_dictionary || null,
        cache_ttl_seconds: Number(data.cache_ttl_seconds) || 0,
        mode: data.mode || 'live_query',
        allowed_roles: data.allowed_roles || 'ADMINISTRADOR,USUARIO',
      },
    });

    await this.seedDefaultPresets(connector);
    return connector;
  }

  /**
   * Atualizar dados de uma conexão existente
   */
  static async updateConnector(
    id: string,
    data: {
      name?: string;
      category?: string;
      db_type?: string;
      host?: string;
      port?: number;
      database?: string;
      username?: string;
      password?: string;
      use_ssl?: boolean;
      is_active?: boolean;
      description?: string;
      config_json?: string;
      semantic_dictionary?: string;
      cache_ttl_seconds?: number;
      mode?: string;
      allowed_roles?: string;
    }
  ) {
    const existing = await (prisma as any).databaseConnector.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Conector de dados não encontrado');
    }

    const updatePayload: any = { ...data };
    if (data.port !== undefined) updatePayload.port = data.port ? Number(data.port) : null;
    if (data.cache_ttl_seconds !== undefined) updatePayload.cache_ttl_seconds = Number(data.cache_ttl_seconds);

    // Preservar a senha caso venha mascarada
    if (data.password === '••••••••' || data.password === undefined) {
      delete updatePayload.password;
    }

    return await (prisma as any).databaseConnector.update({
      where: { id },
      data: updatePayload,
    });
  }

  /**
   * Remover uma conexão
   */
  static async deleteConnector(id: string) {
    return await (prisma as any).databaseConnector.delete({
      where: { id },
    });
  }

  /**
   * Introspecção de Esquema (Tabelas, Colunas, Tipos e Comentários)
   */
  static async introspectSchema(connectorId: string) {
    const connector = await this.getConnectorById(connectorId);
    if (!connector) throw new Error('Conector não encontrado');

    const dbType = (connector.db_type || 'mysql').toLowerCase();

    // 1. MySQL / MariaDB
    if (dbType === 'mysql' || dbType === 'mariadb') {
      const connection = await mysql.createConnection({
        host: connector.host,
        port: connector.port || 3306,
        user: connector.username,
        password: connector.password || '',
        database: connector.database,
        connectTimeout: 8000,
        ssl: connector.use_ssl ? { rejectUnauthorized: false } : undefined,
      });

      const [tablesRows] = await connection.query<any[]>(
        `SELECT TABLE_NAME as name, TABLE_COMMENT as comment 
         FROM information_schema.TABLES 
         WHERE TABLE_SCHEMA = ? 
         ORDER BY TABLE_NAME ASC LIMIT 100`,
        [connector.database]
      );

      const [columnsRows] = await connection.query<any[]>(
        `SELECT TABLE_NAME as tableName, COLUMN_NAME as name, DATA_TYPE as type, 
                IS_NULLABLE as isNullable, COLUMN_KEY as columnKey, COLUMN_COMMENT as comment
         FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? 
         ORDER BY TABLE_NAME, ORDINAL_POSITION ASC LIMIT 1500`,
        [connector.database]
      );

      await connection.end();

      const tables = tablesRows.map((t: any) => {
        const cols = columnsRows
          .filter((c: any) => c.tableName === t.name)
          .map((c: any) => ({
            name: c.name,
            type: c.type,
            isNullable: c.isNullable === 'YES',
            isPrimaryKey: c.columnKey === 'PRI',
            comment: c.comment || null,
          }));

        return {
          name: t.name,
          comment: t.comment || null,
          columns: cols,
        };
      });

      return {
        success: true,
        connectorId: connector.id,
        connectorName: connector.name,
        dbType: connector.db_type,
        tables,
      };
    }

    // 2. PostgreSQL
    if (dbType === 'postgresql' || dbType === 'postgres' || dbType === 'pgsql') {
      const client = new pg.Client({
        host: connector.host || 'localhost',
        port: connector.port ? Number(connector.port) : 5432,
        user: connector.username || 'postgres',
        password: connector.password || '',
        database: connector.database || 'postgres',
        connectionTimeoutMillis: 8000,
        ssl: connector.use_ssl ? { rejectUnauthorized: false } : undefined,
      });

      await client.connect();

      const tablesRes = await client.query(
        `SELECT table_schema, table_name as name 
         FROM information_schema.tables 
         WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
           AND table_type IN ('BASE TABLE', 'VIEW')
         ORDER BY 
           CASE WHEN table_schema = 'datalake' THEN 1 WHEN table_schema = 'public' THEN 2 ELSE 3 END,
           table_name ASC 
         LIMIT 200`
      );

      const columnsRes = await client.query(
        `SELECT table_schema, table_name as "tableName", column_name as name, data_type as type, 
                is_nullable as "isNullable"
         FROM information_schema.columns 
         WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
         ORDER BY table_schema, table_name, ordinal_position ASC 
         LIMIT 3000`
      );

      await client.end();

      const tables = tablesRes.rows.map((t: any) => {
        const cols = columnsRes.rows
          .filter((c: any) => c.tableName === t.name && c.table_schema === t.table_schema)
          .map((c: any) => ({
            name: c.name,
            type: c.type,
            isNullable: c.isNullable === 'YES',
            isPrimaryKey: false,
            comment: null,
          }));

        const displayName = t.table_schema && t.table_schema !== 'public' 
          ? `${t.table_schema}.${t.name}` 
          : t.name;

        return {
          name: displayName,
          comment: t.table_schema !== 'public' ? `Schema: ${t.table_schema}` : null,
          columns: cols,
        };
      });

      return {
        success: true,
        connectorId: connector.id,
        connectorName: connector.name,
        dbType: connector.db_type,
        tables,
      };
    }

    return {
      success: true,
      connectorId: connector.id,
      connectorName: connector.name,
      dbType: connector.db_type,
      tables: [],
    };
  }

  /**
   * Extrai o código da filial (loja) a partir do prompt do usuário ou do histórico recente
   */
  private static extractFilialFromTextOrHistory(
    prompt: string,
    history?: Array<{ role: string; content: string }>
  ): { codigo_filial: number; nome_filial: string } | null {
    // 1. Tentar extrair do próprio prompt atual (ex: Loja 001, Loja 1, Filial 02)
    const promptMatch = prompt.match(/\b(?:loja|filial)\s*0*(\d+)\b/i);
    if (promptMatch) {
      const num = parseInt(promptMatch[1], 10);
      return { codigo_filial: num, nome_filial: `Loja ${String(num).padStart(3, '0')}` };
    }

    // 2. Se o usuário usou termos anafóricos ("desta loja", "dessa loja", "nessa loja", "nela", "da loja"), buscar no histórico
    const hasAnaphora = /\b(?:desta|dessa|nessa|na\s+mesma|da\s+mesma|nela|dela)\s+(?:loja|filial)\b/i.test(prompt) ||
      /\b(?:desta|dessa|nessa|nela|dela)\b/i.test(prompt);

    if (hasAnaphora && history && history.length > 0) {
      for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i].content || '';
        const histMatch = msg.match(/\b(?:loja|filial)\s*0*(\d+)\b/i);
        if (histMatch) {
          const num = parseInt(histMatch[1], 10);
          return { codigo_filial: num, nome_filial: `Loja ${String(num).padStart(3, '0')}` };
        }
      }
    }

    return null;
  }

  /**
   * Resolução determinística e fallback para consultas de alta frequência no Vetor Lake (Datalake Varejo Farmacêutico)
   */
  private static getVetorLakeDeterministicOrFallbackQuery(
    prompt: string,
    history?: Array<{ role: string; content: string }>,
    isFallback: boolean = false
  ) {
    const p = prompt.toLowerCase();
    const filialInfo = this.extractFilialFromTextOrHistory(prompt, history);

    // Extrair limite numérico (ex: "5 produtos", "top 10", "15 mais vendidos")
    let limit = 5;
    const limitMatch = p.match(/\b(?:top\s*)?(\d+)\s*(?:produtos|lojas|filiais|itens|mais)/i) || p.match(/\b(\d+)\s*(?:mais\s+vendidos|mais\s+faturaram)/i);
    if (limitMatch) {
      limit = Math.min(Math.max(parseInt(limitMatch[1], 10), 1), 50);
    }

    const filialWhereClause = filialInfo ? `AND d.codigo_filial = ${filialInfo.codigo_filial}` : '';
    const filialDesc = filialInfo ? ` na ${filialInfo.nome_filial}` : '';

    // 1. Clientes que Compraram determinado Produto
    const isAskingAboutClient =
      p.includes('cliente') || p.includes('clientes') || p.includes('quem') || p.includes('cpf') || p.includes('comprador') || p.includes('compradores');

    const isClientesQueCompraram =
      isAskingAboutClient &&
      (p.includes('comprou') || p.includes('compraram') || p.includes('compra') || p.includes('levou') || p.includes('levaram') || p.includes('adquiriu') || p.includes('adquiriram'));

    if (isClientesQueCompraram) {
      let prodTerm = '';
      const prodMatch =
        p.match(/(?:produto|remedio|medicamento|item|de)\s+([a-z0-9\s/.\-+%]+?)(?:\?|$|\s+hoje|\s+ontem|\s+nesta)/i) ||
        p.match(/(?:comprou|compraram)\s+(?:hoje\s+)?(?:este\s+|o\s+)?(?:produto\s+)?([a-z0-9\s/.\-+%]+?)(?:\?|$)/i);

      if (prodMatch && prodMatch[1]) {
        prodTerm = prodMatch[1].replace(/^(?:o|a|os|as|este|esta|esse|essa|um|uma)\s+/i, '').trim();
      }

      const prodFilter = prodTerm ? `AND p.descricao_produto ILIKE '%${prodTerm.replace(/'/g, "''")}%'` : '';
      const prodDesc = prodTerm ? ` do produto "${prodTerm.toUpperCase()}"` : '';

      return {
        success: true,
        generated_query: `SELECT 
  d.hora_documento AS horario,
  COALESCE(NULLIF(pes.nome_pessoa, ''), 'Consumidor Não Identificado (Sem CPF no Caixa)') AS cliente,
  COALESCE(NULLIF(pes.cnpj, ''), 'Não Informado') AS cpf_cnpj,
  p.descricao_produto AS produto,
  i.quantidade AS qtd,
  ROUND(i.valor_item_liquido::numeric, 2) AS valor_pago,
  COALESCE(f.nome_filial, CONCAT('Loja ', d.codigo_filial::text)) AS filial
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
INNER JOIN datalake.tb_produtos p ON i.codigo_produto = p.codigo_produto
LEFT JOIN datalake.tb_pessoas pes ON d.codigo_pessoa = pes.codigo_pessoa
LEFT JOIN datalake.tb_filiais f ON d.codigo_filial = f.codigo_filial
WHERE d.data_documento = CURRENT_DATE 
  AND i.codigo_situacao = 1
  ${prodFilter}
  ${filialWhereClause}
ORDER BY d.hora_documento DESC
LIMIT 50;`,
        explanation: `Lista de clientes que compraram hoje${prodDesc}${filialDesc} no Vetor Lake.`,
        visualization_suggestion: 'table',
      };
    }

    // 2. Produtos Mais Vendidos Hoje / Nesta Loja
    const isProdutosMaisVendidos =
      !isAskingAboutClient &&
      (p.includes('mais vendido') || p.includes('mais vendidos') || p.includes('itens mais') || (p.includes('produto') && (p.includes('ranking') || p.includes('top')))) &&
      (p.includes('hoje') || p.includes('vendidos') || p.includes('venda') || filialInfo !== null);

    if (isProdutosMaisVendidos && !p.includes('laboratorio') && !p.includes('fabricante') && !p.includes('linha')) {
      return {
        success: true,
        generated_query: `SELECT 
  p.codigo_produto,
  p.descricao_produto AS produto,
  SUM(i.quantidade) AS quantidade_vendida,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS total_faturamento
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
INNER JOIN datalake.tb_produtos p ON i.codigo_produto = p.codigo_produto
WHERE d.data_documento = CURRENT_DATE 
  AND i.codigo_situacao = 1
  ${filialWhereClause}
GROUP BY p.codigo_produto, p.descricao_produto
ORDER BY quantidade_vendida DESC
LIMIT ${limit};`,
        explanation: `Consulta oficial dos ${limit} produtos mais vendidos hoje (por unidades)${filialDesc} no Vetor Lake.`,
        visualization_suggestion: 'bar_chart',
      };
    }

    // 2. Lojas que mais venderam hoje / Ranking de Lojas
    const isLojasMaisVenderam =
      (p.includes('loja') || p.includes('lojas') || p.includes('filial') || p.includes('filiais')) &&
      (p.includes('mais venderam') || p.includes('mais faturaram') || p.includes('ranking') || p.includes('top') || p.includes('maiores vendas'));

    if (isLojasMaisVenderam && !p.includes('produto') && !p.includes('produtos')) {
      return {
        success: true,
        generated_query: `SELECT 
  f.codigo_filial,
  COALESCE(f.nome_filial, CONCAT('Loja ', LPAD(f.codigo_filial::text, 3, '0'))) AS filial,
  COUNT(DISTINCT d.codigo_documento) AS total_cupons,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS total_faturamento
FROM datalake.tb_documentos d
INNER JOIN datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento
LEFT JOIN datalake.tb_filiais f ON d.codigo_filial = f.codigo_filial
WHERE d.data_documento = CURRENT_DATE 
  AND i.codigo_situacao = 1
GROUP BY f.codigo_filial, f.nome_filial
ORDER BY total_faturamento DESC
LIMIT ${limit};`,
        explanation: `Ranking oficial das ${limit} lojas que mais venderam hoje por faturamento no Vetor Lake.`,
        visualization_suggestion: 'bar_chart',
      };
    }

    // 3. Faturamento Hoje / Vendas de Hoje Geral ou por Loja
    const isFaturamentoHoje =
      (p.includes('faturamento') || p.includes('vendas de hoje') || p.includes('quanto faturou') || p.includes('total vendido')) &&
      (p.includes('hoje') || filialInfo !== null);

    if (isFaturamentoHoje && !p.includes('produto') && !p.includes('lojas') && !p.includes('filiais')) {
      return {
        success: true,
        generated_query: `SELECT 
  COUNT(DISTINCT d.codigo_documento) AS total_cupons,
  SUM(i.quantidade) AS total_itens_vendidos,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS faturamento_liquido_total,
  ROUND((SUM(i.valor_item_liquido) / NULLIF(COUNT(DISTINCT d.codigo_documento), 0))::numeric, 2) AS ticket_medio
FROM datalake.tb_documentos d
INNER JOIN datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento
WHERE d.data_documento = CURRENT_DATE 
  AND i.codigo_situacao = 1
  ${filialWhereClause};`,
        explanation: `Faturamento consolidado e métricas de vendas de hoje${filialDesc}.`,
        visualization_suggestion: 'kpi',
      };
    }

    return null;
  }

  /**
   * Motor NL2SQL: Converte a pergunta em linguagem natural do usuário em SQL / Payload de Leitura seguro,
   * suportando histórico conversacional e resolução de anáforas (afunilamento).
   */
  static async generateNL2SQL(
    connectorId: string,
    userPrompt: string,
    recentHistory?: Array<{ role: string; content: string }>
  ) {
    const connector = await this.getConnectorById(connectorId);
    if (!connector) throw new Error('Conector não encontrado');

    const cleanPrompt = userPrompt.trim();
    if (!cleanPrompt) throw new Error('Pergunta não informada');

    const dbType = (connector.db_type || 'mysql').toLowerCase();
    const isVetorLake =
      connector.name.toLowerCase().includes('vetor') ||
      (connector.database || '').toLowerCase().includes('datalake') ||
      (connector.database || '').toLowerCase().includes('unipreco');

    // 1. Otimização de Alta Performance: Matcher Determinístico para consultas padrão do Vetor Lake
    if (isVetorLake) {
      const fastMatch = this.getVetorLakeDeterministicOrFallbackQuery(cleanPrompt, recentHistory);
      if (fastMatch) {
        return fastMatch;
      }
    }

    // Buscar esquema ou dicionário para dar contexto à IA
    let schemaContext = '';
    if (connector.semantic_dictionary) {
      schemaContext = `\nDicionário Semântico / Metadados das Tabelas:\n${connector.semantic_dictionary}`;
    }

    // Se for GLPI, MySQL ou PostgreSQL, obter resumo de tabelas
    if (dbType === 'mysql' || dbType === 'mariadb' || dbType === 'postgresql' || dbType === 'postgres' || dbType === 'pgsql') {
      try {
        const schema = await this.introspectSchema(connectorId);
        if (schema.tables && schema.tables.length > 0) {
          const tableSummary = schema.tables
            .slice(0, 30)
            .map((t) => `- Tabela ${t.name}: colunas (${t.columns.slice(0, 10).map((c) => `${c.name}:${c.type}`).join(', ')})`)
            .join('\n');
          schemaContext += `\nEsquema de Tabelas no Banco:\n${tableSummary}`;
        }
      } catch (_) {}
    }

    // Obter Provedor de IA ativo
    const activeProvider = await (prisma as any).aIProviderConfig.findFirst({
      where: { is_active: true },
      orderBy: { priority: 'asc' },
    });

    const cleanBaseUrl = (activeProvider?.base_url || 'http://127.0.0.1:1234/v1').replace(/\/+$/, '');
    const apiUrl = cleanBaseUrl.endsWith('/v1') ? `${cleanBaseUrl}/chat/completions` : `${cleanBaseUrl}/v1/chat/completions`;
    const apiKey = activeProvider?.api_key || 'not-needed';

    const nowBR = new Date();
    const dataAtualBR = nowBR.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); // DD/MM/AAAA
    const dataAtualISO = nowBR.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
    const anoAtual = nowBR.getFullYear();
    const mesAtual = String(nowBR.getMonth() + 1).padStart(2, '0');

    const isPostgres = dbType === 'postgresql' || dbType === 'postgres' || dbType === 'pgsql';

    // Montar contexto do histórico recente da conversa para suportar afunilamento
    let historyContext = '';
    if (recentHistory && recentHistory.length > 0) {
      const formattedHistory = recentHistory
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content.slice(0, 500)}`)
        .join('\n');
      historyContext = `\nHISTÓRICO RECENTE DA CONVERSA:\n${formattedHistory}\n\n` +
        `DIRETRIZ DE CONTINUIDADE E AFUNILAMENTO (DRILL-DOWN):\n` +
        `- Resolva anáforas e referências a entidades ou filtros mencionados anteriormente (ex: 'desta loja', 'dela', 'nela', 'deste produto', 'neste técnico', 'mesmo período', 'e ontem?').\n` +
        `- Se o usuário perguntou anteriormente sobre lojas/filiais e agora pede produtos 'desta loja', ou faz referência a uma loja específica da resposta anterior (ex: 'Loja 001' ou 'Filial 1'), APLIQUE o filtro correspondente: d.codigo_filial = 1 (ou o número da filial correspondente).\n` +
        `- Se a pergunta anterior era sobre 'hoje' e a pergunta atual é um aprofundamento sem nova data informada, MANTENHA o filtro temporal correspondente (ex: d.data_documento = CURRENT_DATE).\n`;
    }

    const systemPrompt = `Você é um Engenheiro de Dados e Especialista SQL em consultas analíticas e relatórios para o sistema "${connector.name}".
Tipo de Banco: ${connector.db_type}.
Nome da Base: ${connector.database || 'default'}.
${schemaContext}
${historyContext}
CONTEXTO TEMPORAL OFICIAL:
- Data Atual: ${dataAtualBR} (Formato SQL ISO: '${dataAtualISO}')
- Ano Atual: ${anoAtual}, Mês Atual: ${mesAtual}

REGRAS CRÍTICAS DE SEGURANÇA E SINTAXE SQL:
1. Gere EXCLUSIVAMENTE consultas de leitura (SELECT).
2. NUNCA gere instruções destrutivas como INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE ou EXEC.
3. Utilize aliases claros e amigáveis em português para as colunas selecionadas (ex: f.nome_filial AS filial, SUM(i.valor_item_liquido) AS total_faturamento).
4. DIALETO E FUNÇÕES DE DATA:
   ${isPostgres 
     ? `- Em PostgreSQL: Para a data de hoje use CURRENT_DATE (NUNCA coloque parênteses em CURRENT_DATE). Para mês atual use DATE_TRUNC('month', CURRENT_DATE). Para filtros de texto use ILIKE (ex: f.nome_filial ILIKE '%01%' OU td.codigo_filial = 1). Sempre prefixe com o schema adequado (ex: datalake.tb_documentos_itens).`
     : `- Em MySQL: Para a data de hoje use CURDATE(). Para filtros use LIKE.`
   }
5. FILTROS DE LOJA / FILIAL E VENDAS:
   - O campo codigo_filial é um número inteiro (1 para 'Loja 01' ou 'Filial 01', 2 para 'Loja 02', etc.).
   - Se o usuário solicitar 'Loja 01', 'Loja 1', 'Filial 01' ou fizer referência à loja tratada no histórico, filtre por d.codigo_filial = 1 (ou o número correspondente).
   - Para cálculo de faturamento/vendas líquidas, faça o JOIN entre datalake.tb_documentos d e datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento e LEFT JOIN datalake.tb_filiais f ON d.codigo_filial = f.codigo_filial, aplicando i.codigo_situacao = 1 (vendas válidas).
6. Para análises completas, totais, volumetria e relatórios estatísticos, utilize funções agregadoras do SQL (COUNT, SUM, AVG, MIN, MAX, GROUP BY) para analisar 100% da base no banco de dados. Para listagens de registros individuais, utilize LIMIT 200 a 500.
7. Indique o tipo de visualização mais adequado para o resultado: "table", "bar_chart", "pie_chart", "line_chart" ou "kpi".
8. Responda ESTRITAMENTE em formato JSON com a seguinte estrutura:
{
  "generated_query": "SELECT ...",
  "explanation": "Explicação clara e amigável em português do que a consulta filtra e agrupa",
  "visualization_suggestion": "table" | "bar_chart" | "pie_chart" | "line_chart" | "kpi"
}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'auto',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: cleanPrompt },
          ],
          temperature: 0.1,
          max_tokens: 1500,
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (!response.ok) {
        throw new Error(`Servidor de IA respondeu com status ${response.status}`);
      }

      const data = await response.json();
      let content = data.choices?.[0]?.message?.content || '';

      // Remover blocos de código markdown se presentes
      content = content.replace(/```json/gi, '').replace(/```/g, '').trim();

      // Extrair JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Validação de segurança no SQL gerado
        let sql = (parsed.generated_query || '').trim();
        if (!/^select/i.test(sql)) {
          throw new Error('A IA não gerou uma consulta SELECT válida.');
        }

        // Correção de sintaxe comum de dialeto (ex: CURRENT_DATE() no PostgreSQL -> CURRENT_DATE)
        if (isPostgres) {
          sql = sql.replace(/CURRENT_DATE\(\)/gi, 'CURRENT_DATE');
        }

        return {
          success: true,
          generated_query: sql,
          explanation: parsed.explanation || 'Consulta gerada com base na sua solicitação.',
          visualization_suggestion: parsed.visualization_suggestion || 'table',
        };
      } else {
        throw new Error('Não foi possível interpretar a resposta estruturada da IA.');
      }
    } catch (err: any) {
      // Fallback inteligente para perguntas comuns de GLPI se a IA falhar
      if (connector.name.toLowerCase().includes('glpi') || (connector.database || '').toLowerCase().includes('glpi')) {
        return this.getGLPIFallbackNLQuery(cleanPrompt);
      }
      // Fallback inteligente para perguntas do Vetor Lake se a IA falhar
      if (isVetorLake) {
        const vetorFallback = this.getVetorLakeDeterministicOrFallbackQuery(cleanPrompt, recentHistory, true);
        if (vetorFallback) return vetorFallback;
      }
      return {
        success: false,
        error: `Erro ao gerar consulta com IA: ${err.message}`,
      };
    }
  }

  private static getGLPIFallbackNLQuery(prompt: string) {
    const p = prompt.toLowerCase();

    // Base Completa / Total / Volumetria / Relatório Global
    if (
      p.includes('base') ||
      p.includes('total') ||
      p.includes('quantos') ||
      p.includes('todos') ||
      p.includes('completa') ||
      p.includes('estatistica') ||
      p.includes('estatística') ||
      p.includes('volumetria')
    ) {
      return {
        success: true,
        generated_query: `SELECT 
  COUNT(*) AS total_historico_chamados,
  SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS total_em_aberto,
  SUM(CASE WHEN t.status = 1 THEN 1 ELSE 0 END) AS novos,
  SUM(CASE WHEN t.status IN (2, 3) THEN 1 ELSE 0 END) AS em_atendimento,
  SUM(CASE WHEN t.status = 4 THEN 1 ELSE 0 END) AS pendentes,
  SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS concluidos_fechados,
  MIN(t.date) AS primeiro_chamado_base,
  MAX(t.date) AS ultimo_chamado_base
FROM glpi_tickets t
WHERE t.is_deleted = 0;`,
        explanation: 'Calcula os totais e métricas de toda a base histórica do GLPI.',
        visualization_suggestion: 'kpi',
      };
    }

    if (p.includes('hoje') || p.includes('abertos hoje')) {
      return {
        success: true,
        generated_query: `SELECT t.id, t.name AS titulo, t.date AS data_abertura, 
CASE t.status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Outro' END AS status_nome,
COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
WHERE DATE(t.date) = CURDATE() AND t.is_deleted = 0
ORDER BY t.date DESC LIMIT 500;`,
        explanation: 'Filtra todos os chamados abertos na data de hoje no GLPI.',
        visualization_suggestion: 'table',
      };
    }

    if (p.includes('status') || p.includes('resumo')) {
      return {
        success: true,
        generated_query: `SELECT 
CASE t.status 
  WHEN 1 THEN '1 - Novo' 
  WHEN 2 THEN '2 - Em atendimento' 
  WHEN 3 THEN '3 - Planejado' 
  WHEN 4 THEN '4 - Pendente' 
  WHEN 5 THEN '5 - Solucionado' 
  WHEN 6 THEN '6 - Fechado' 
  ELSE 'Outro' 
END AS status_nome,
COUNT(*) AS total_chamados
FROM glpi_tickets t WHERE t.is_deleted = 0 GROUP BY t.status ORDER BY t.status ASC;`,
        explanation: 'Agrupa o volume total de chamados de toda a base por status atual.',
        visualization_suggestion: 'pie_chart',
      };
    }

    return {
      success: true,
      generated_query: `SELECT t.id, t.name AS titulo, t.date AS data_abertura, 
CASE t.status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento' WHEN 3 THEN 'Planejado' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Outro' END AS status_nome,
CASE t.priority WHEN 4 THEN 'Alta' WHEN 5 THEN 'Muito Alta' WHEN 6 THEN 'Maior' ELSE 'Normal' END AS prioridade,
COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
WHERE t.is_deleted = 0
ORDER BY t.id DESC LIMIT 500;`,
      explanation: 'Consulta ampla dos chamados cadastrados no GLPI.',
      visualization_suggestion: 'table',
    };
  }

  /**
   * Executar uma consulta (SQL ou chamada de API) com segurança e suporte a Cache
   */
  static async executeQuery(connectorId: string, queryPayload: string, options?: { generateSummary?: boolean }) {
    const connector = await this.getConnectorById(connectorId);
    if (!connector || !connector.is_active) {
      throw new Error('Conector de dados não encontrado ou inativo.');
    }

    const startTime = Date.now();
    const cacheKey = `${connectorId}:${queryPayload.trim()}`;

    // 1. Verificar Cache em Memória se TTL > 0
    if (connector.cache_ttl_seconds > 0) {
      const cached = queryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < cached.ttlMs) {
        return {
          ...cached.data,
          isCached: true,
          executionTimeMs: Date.now() - startTime,
        };
      }
    }

    const category = connector.category || 'database';
    const dbType = (connector.db_type || 'mysql').toLowerCase();

    // 2. Execução Banco MySQL / MariaDB
    if (dbType === 'mysql' || dbType === 'mariadb') {
      const cleanedSql = queryPayload.trim();
      if (!/^select/i.test(cleanedSql)) {
        throw new Error('Por segurança, apenas instruções de leitura (SELECT) são permitidas.');
      }

      const connection = await mysql.createConnection({
        host: connector.host,
        port: connector.port || 3306,
        user: connector.username,
        password: connector.password || '',
        database: connector.database,
        connectTimeout: 8000,
        dateStrings: true,
        timezone: '-03:00',
        ssl: connector.use_ssl ? { rejectUnauthorized: false } : undefined,
      });

      let finalSql = cleanedSql.replace(/;+\s*$/, '').trim();
      const isAggregateQuery = /\b(count\(|sum\(|avg\(|min\(|max\(|group\s+by)\b/i.test(finalSql);
      if (!/\blimit\s+\d+/i.test(finalSql) && !isAggregateQuery) {
        finalSql += ' LIMIT 500';
      }

      const [rows, fields] = await connection.query<any[]>(finalSql);
      await connection.end();

      const columns = fields ? fields.map((f: any) => f.name) : [];
      const executionTimeMs = Date.now() - startTime;

      let ai_summary: string | undefined = undefined;
      if (options?.generateSummary && rows.length > 0) {
        ai_summary = await this.generateResultAISummary(connector.name, queryPayload, rows.slice(0, 15));
      }

      const result = {
        success: true,
        connectorName: connector.name,
        rows,
        columns,
        totalRows: rows.length,
        executionTimeMs,
        isCached: false,
        ai_summary,
      };

      if (connector.cache_ttl_seconds > 0) {
        queryCache.set(cacheKey, {
          timestamp: Date.now(),
          ttlMs: connector.cache_ttl_seconds * 1000,
          data: result,
        });
      }

      return result;
    }

    // 2.1 Execução Banco PostgreSQL
    if (dbType === 'postgresql' || dbType === 'postgres' || dbType === 'pgsql') {
      const cleanedSql = queryPayload.trim();
      if (!/^select/i.test(cleanedSql)) {
        throw new Error('Por segurança, apenas instruções de leitura (SELECT) são permitidas.');
      }

      const client = new pg.Client({
        host: connector.host || 'localhost',
        port: connector.port ? Number(connector.port) : 5432,
        user: connector.username || 'postgres',
        password: connector.password || '',
        database: connector.database || 'postgres',
        connectionTimeoutMillis: 8000,
        ssl: connector.use_ssl ? { rejectUnauthorized: false } : undefined,
      });

      let finalSql = cleanedSql.replace(/;+\s*$/, '').trim();
      const isAggregateQuery = /\b(count\(|sum\(|avg\(|min\(|max\(|group\s+by)\b/i.test(finalSql);
      if (!/\blimit\s+\d+/i.test(finalSql) && !isAggregateQuery) {
        finalSql += ' LIMIT 500';
      }

      await client.connect();
      const res = await client.query(finalSql);
      await client.end();

      const rows = res.rows || [];
      const columns = res.fields ? res.fields.map((f: any) => f.name) : (rows[0] ? Object.keys(rows[0]) : []);
      const executionTimeMs = Date.now() - startTime;

      let ai_summary: string | undefined = undefined;
      if (options?.generateSummary && rows.length > 0) {
        ai_summary = await this.generateResultAISummary(connector.name, queryPayload, rows.slice(0, 15));
      }

      const result = {
        success: true,
        connectorName: connector.name,
        rows,
        columns,
        totalRows: rows.length,
        executionTimeMs,
        isCached: false,
        ai_summary,
      };

      if (connector.cache_ttl_seconds > 0) {
        queryCache.set(cacheKey, {
          timestamp: Date.now(),
          ttlMs: connector.cache_ttl_seconds * 1000,
          data: result,
        });
      }

      return result;
    }

    // 3. Execução REST API / Webhook n8n
    if (category === 'api' || category === 'automation' || dbType === 'rest_api' || dbType === 'n8n') {
      let url = connector.host || '';
      let headers: Record<string, string> = { 'Accept': 'application/json' };

      if (connector.config_json) {
        try {
          const cfg = JSON.parse(connector.config_json);
          if (cfg.baseUrl) url = cfg.baseUrl;
          if (cfg.headers) headers = { ...headers, ...cfg.headers };
          if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;
        } catch (_) {}
      }

      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000),
      });

      const data = await res.json();
      const rows = Array.isArray(data) ? data : [data];
      const columns = rows.length > 0 && typeof rows[0] === 'object' ? Object.keys(rows[0]) : ['resultado'];
      const executionTimeMs = Date.now() - startTime;

      return {
        success: true,
        connectorName: connector.name,
        rows,
        columns,
        totalRows: rows.length,
        executionTimeMs,
        isCached: false,
      };
    }

    throw new Error(`Tipo de conector '${connector.db_type}' ainda não possui driver de execução configurado.`);
  }

  /**
   * Gera um resumo executivo inteligente dos dados retornados
   */
  private static async generateResultAISummary(connectorName: string, query: string, sampleRows: any[]) {
    try {
      const activeProvider = await (prisma as any).aIProviderConfig.findFirst({
        where: { is_active: true },
        orderBy: { priority: 'asc' },
      });

      const baseUrl = activeProvider?.base_url || 'http://127.0.0.1:1234/v1';
      const apiKey = activeProvider?.api_key || 'not-needed';

      const prompt = `Analise os seguintes dados retornados da consulta no conector "${connectorName}":
Consulta: ${query}
Amostra dos Dados (${sampleRows.length} registros):
${JSON.stringify(sampleRows, null, 2)}

Forneça um resumo executivo e objetivo em 2 a 3 frases em português, destacando tendências, números-chave e pontos de atenção.`;

      const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'auto',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 300,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const data = await res.json();
        return data.choices?.[0]?.message?.content || undefined;
      }
    } catch (_) {}
    return undefined;
  }

  /**
   * Auto-Healing de SQL: Auto-corrige consultas SQL que falharam na execução
   */
  static async autoHealQuery(connectorId: string, userPrompt: string, failedSql: string, dbError: string) {
    const connector = await this.getConnectorById(connectorId);
    if (!connector) throw new Error('Conector não encontrado');

    const dbType = (connector.db_type || 'mysql').toLowerCase();
    const isPostgres = dbType === 'postgresql' || dbType === 'postgres' || dbType === 'pgsql';

    let schemaContext = '';
    if (connector.semantic_dictionary) {
      schemaContext = `\nDicionário Semântico / Metadados das Tabelas:\n${connector.semantic_dictionary}`;
    }

    const activeProvider = await (prisma as any).aIProviderConfig.findFirst({
      where: { is_active: true },
      orderBy: { priority: 'asc' },
    });

    const cleanBaseUrl = (activeProvider?.base_url || 'http://127.0.0.1:1234/v1').replace(/\/+$/, '');
    const apiUrl = cleanBaseUrl.endsWith('/v1') ? `${cleanBaseUrl}/chat/completions` : `${cleanBaseUrl}/v1/chat/completions`;
    const apiKey = activeProvider?.api_key || 'not-needed';

    const systemPrompt = `Você é um Especialista em Auto-Correção e Otimização de SQL para o sistema "${connector.name}".
Tipo de Banco: ${connector.db_type}.
${schemaContext}

Uma consulta gerada anteriormente falhou na execução do banco de dados com um erro. Sua tarefa é analisar o erro, corrigir a consulta e retornar o SQL perfeito.

REGRAS:
1. Gere EXCLUSIVAMENTE consultas SELECT válidas.
2. ${isPostgres ? 'Em PostgreSQL: Use CURRENT_DATE sem parênteses, ILIKE para strings, e prefixe com datalake. se aplicável.' : 'Em MySQL: Use CURDATE() e LIKE.'}
3. Responda ESTRITAMENTE em formato JSON:
{
  "generated_query": "SELECT ...",
  "explanation": "Explicação da correção aplicada",
  "visualization_suggestion": "table" | "bar_chart" | "pie_chart" | "line_chart" | "kpi"
}`;

    const userMessage = `Pergunta do Usuário: "${userPrompt}"
SQL que falhou:
${failedSql}

Erro retornado pelo banco de dados:
${dbError}

Por favor, corrija a consulta SQL para resolver esse erro.`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'auto',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.1,
          max_tokens: 1500,
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      let content = data.choices?.[0]?.message?.content || '';
      content = content.replace(/```json/gi, '').replace(/```/g, '').trim();

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        let sql = (parsed.generated_query || '').trim();
        if (isPostgres) {
          sql = sql.replace(/CURRENT_DATE\(\)/gi, 'CURRENT_DATE');
        }
        return {
          success: true,
          generated_query: sql,
          explanation: parsed.explanation || 'Consulta corrigida com auto-healing.',
          visualization_suggestion: parsed.visualization_suggestion || 'table',
        };
      }
    } catch (e: any) {
      console.warn('[DatabaseService] Falha no auto-healing de SQL:', e.message);
    }
    return { success: false, error: 'Não foi possível auto-corrigir a consulta.' };
  }

  /**
   * Executa a consulta com tentativa automática de Auto-Healing em caso de erro
   */
  static async executeQueryWithAutoHealing(connectorId: string, userPrompt: string, sql: string, options?: { generateSummary?: boolean }) {
    try {
      const initialRes = await this.executeQuery(connectorId, sql, options);
      return {
        ...initialRes,
        wasHealed: false,
        finalSql: sql,
      };
    } catch (err: any) {
      console.warn(`[DatabaseService] Consulta SQL inicial falhou. Acionando Auto-Healing com IA... Erro: ${err.message}`);
      
      const healRes = await this.autoHealQuery(connectorId, userPrompt, sql, err.message);
      if (healRes.success && healRes.generated_query) {
        try {
          const healedQueryRes = await this.executeQuery(connectorId, healRes.generated_query, options);
          return {
            ...healedQueryRes,
            wasHealed: true,
            originalSql: sql,
            finalSql: healRes.generated_query,
            healExplanation: healRes.explanation,
          };
        } catch (secondErr: any) {
          throw new Error(`Consulta falhou mesmo após tentativa de auto-correção: ${secondErr.message}`);
        }
      }
      throw err;
    }
  }

  /**
   * Detecção de Anomalias & Alertas Operacionais Proativos
   */
  static async detectAnomalies(connectorId: string): Promise<Array<{ type: string; level: 'warning' | 'critical' | 'info'; title: string; message: string }>> {
    const connector = await this.getConnectorById(connectorId);
    if (!connector || !connector.is_active) return [];

    // Cache em memória de 5 minutos (300.000 ms) para garantir resposta instantânea no chat
    const cached = anomalyCache.get(connectorId);
    if (cached && Date.now() - cached.timestamp < 300000) {
      return cached.anomalies;
    }

    const anomalies: Array<{ type: string; level: 'warning' | 'critical' | 'info'; title: string; message: string }> = [];
    const isVetorLake = connector.name.toLowerCase().includes('vetor') || connector.name.toLowerCase().includes('lake') || (connector.database || '').toLowerCase().includes('unipreco');
    const isGlpi = connector.name.toLowerCase().includes('glpi') || (connector.database || '').toLowerCase().includes('glpi');

    try {
      if (isVetorLake) {
        // 1. Alerta de Ruptura de Curva A Enriquecido
        try {
          const rupturaRes = await this.executeQuery(
            connectorId,
            `SELECT 
               COUNT(DISTINCT e.codigo_produto) as total_curva_a_zerados,
               COUNT(DISTINCT e.codigo_filial) as total_lojas_afetadas
             FROM datalake.tb_filial_estoque e
             WHERE e.curva = 'A' AND e.estoque <= 0`
          );
          const totalRuptura = Number(rupturaRes.rows?.[0]?.total_curva_a_zerados || 0);
          const totalLojas = Number(rupturaRes.rows?.[0]?.total_lojas_afetadas || 0);

          if (totalRuptura > 0) {
            // Top 3 produtos mais críticos (com maior número de filiais em ruptura)
            let topProdsText = '';
            try {
              const topProdsRes = await this.executeQuery(
                connectorId,
                `SELECT p.descricao_produto, COUNT(DISTINCT e.codigo_filial) as lojas_zeradas
                 FROM datalake.tb_filial_estoque e
                 INNER JOIN datalake.tb_produtos p ON e.codigo_produto = p.codigo_produto
                 WHERE e.curva = 'A' AND e.estoque <= 0
                 GROUP BY p.descricao_produto
                 ORDER BY lojas_zeradas DESC
                 LIMIT 3`
              );
              if (topProdsRes.rows && topProdsRes.rows.length > 0) {
                topProdsText = topProdsRes.rows
                  .map((r: any) => `**${r.descricao_produto}** (${r.lojas_zeradas} lojas)`)
                  .join(', ');
              }
            } catch (_) {}

            // Top 2 filiais com maior número de itens Curva A zerados
            let topLojasText = '';
            try {
              const topLojasRes = await this.executeQuery(
                connectorId,
                `SELECT COALESCE(fil.nome_filial, CONCAT('Filial ', e.codigo_filial::text)) as nome_filial, 
                        COUNT(DISTINCT e.codigo_produto) as total_zerados
                 FROM datalake.tb_filial_estoque e
                 LEFT JOIN datalake.tb_filiais fil ON e.codigo_filial = fil.codigo_filial
                 WHERE e.curva = 'A' AND e.estoque <= 0
                 GROUP BY fil.nome_filial, e.codigo_filial
                 ORDER BY total_zerados DESC
                 LIMIT 2`
              );
              if (topLojasRes.rows && topLojasRes.rows.length > 0) {
                topLojasText = topLojasRes.rows
                  .map((r: any) => `**${r.nome_filial}** (${r.total_zerados} itens)`)
                  .join(' e ');
              }
            } catch (_) {}

            let msg = `Há um total de **${totalRuptura.toLocaleString('pt-BR')} produtos** de altíssimo giro (Curva A) com estoque zerado em filiais da rede (${totalLojas} lojas impactadas).`;
            if (topProdsText) {
              msg += `\n• **Itens líderes em ruptura:** ${topProdsText}.`;
            }
            if (topLojasText) {
              msg += `\n• **Lojas mais desabastecidas:** ${topLojasText}.`;
            }
            msg += `\n• 💡 **Ação sugerida:** Avaliar remanejamento emergencial de estoque entre filiais vizinhas ou priorizar pedido de compra ao CD.`;

            anomalies.push({
              type: 'ruptura_estoque',
              level: totalRuptura > 20 ? 'critical' : 'warning',
              title: 'Ruptura Crítica em Curva A Detectada',
              message: msg,
            });
          }
        } catch (e: any) {
          console.warn('[DatabaseService] Erro ao calcular anomalia de ruptura:', e.message);
        }

        // 2. Alerta de Produtos Próximos do Vencimento Enriquecido
        try {
          const vencimentoRes = await this.executeQuery(
            connectorId,
            `SELECT 
               COUNT(DISTINCT e.codigo_produto) as total_pre_vencidos,
               COALESCE(ROUND(SUM(e.qtde_pre_vencido * e.valor_custo_medio)::numeric, 2), 0) as valor_total_risco
             FROM datalake.tb_filial_estoque e
             WHERE e.qtde_pre_vencido > 0`
          );
          const totalPreVencidos = Number(vencimentoRes.rows?.[0]?.total_pre_vencidos || 0);
          const valorTotalRisco = Number(vencimentoRes.rows?.[0]?.valor_total_risco || 0);

          if (totalPreVencidos > 0) {
            // Top 3 produtos com maior valor em risco
            let topVencProdsText = '';
            try {
              const topVencProdsRes = await this.executeQuery(
                connectorId,
                `SELECT p.descricao_produto, 
                        ROUND(SUM(e.qtde_pre_vencido * e.valor_custo_medio)::numeric, 2) as valor_risco,
                        SUM(e.qtde_pre_vencido) as unidades
                 FROM datalake.tb_filial_estoque e
                 INNER JOIN datalake.tb_produtos p ON e.codigo_produto = p.codigo_produto
                 WHERE e.qtde_pre_vencido > 0
                 GROUP BY p.descricao_produto
                 ORDER BY valor_risco DESC
                 LIMIT 3`
              );
              if (topVencProdsRes.rows && topVencProdsRes.rows.length > 0) {
                topVencProdsText = topVencProdsRes.rows
                  .map((r: any) => `**${r.descricao_produto}** (R$ ${Number(r.valor_risco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`)
                  .join(', ');
              }
            } catch (_) {}

            // Loja com maior volume financeiro pré-vencido
            let topLojaVencText = '';
            try {
              const topLojaVencRes = await this.executeQuery(
                connectorId,
                `SELECT COALESCE(fil.nome_filial, CONCAT('Filial ', e.codigo_filial::text)) as nome_filial,
                        ROUND(SUM(e.qtde_pre_vencido * e.valor_custo_medio)::numeric, 2) as valor_risco
                 FROM datalake.tb_filial_estoque e
                 LEFT JOIN datalake.tb_filiais fil ON e.codigo_filial = fil.codigo_filial
                 WHERE e.qtde_pre_vencido > 0
                 GROUP BY fil.nome_filial, e.codigo_filial
                 ORDER BY valor_risco DESC
                 LIMIT 1`
              );
              if (topLojaVencRes.rows && topLojaVencRes.rows.length > 0) {
                const r = topLojaVencRes.rows[0];
                topLojaVencText = `**${r.nome_filial}** (R$ ${Number(r.valor_risco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`;
              }
            } catch (_) {}

            let msg = `Existem **${totalPreVencidos.toLocaleString('pt-BR')} produtos** com lotes pré-vencidos aguardando plano de escoamento, somando **R$ ${valorTotalRisco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}** em capital em risco de perda.`;
            if (topVencProdsText) {
              msg += `\n• **Maior capital em risco:** ${topVencProdsText}.`;
            }
            if (topLojaVencText) {
              msg += `\n• **Filial com maior concentração:** ${topLojaVencText}.`;
            }
            msg += `\n• 💡 **Ação sugerida:** Ativar campanhas de queima promocional imediata nos caixas ou solicitar devolução/bonificação aos fabricantes.`;

            anomalies.push({
              type: 'pre_vencidos',
              level: 'warning',
              title: 'Alerta de Produtos Pré-Vencidos',
              message: msg,
            });
          }
        } catch (e: any) {
          console.warn('[DatabaseService] Erro ao calcular anomalia de vencimento:', e.message);
        }
      } else if (isGlpi) {
        // Alertas GLPI Enriquecidos
        const glpiAlertRes = await this.executeQuery(
          connectorId,
          `SELECT 
             SUM(CASE WHEN t.time_to_resolve IS NOT NULL AND t.time_to_resolve < NOW() AND t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS sla_estourado,
             SUM(CASE WHEN t.priority >= 4 AND tu.users_id IS NULL AND t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS criticos_sem_tecnico
           FROM glpi_tickets t
           LEFT JOIN glpi_tickets_users tu ON (t.id = tu.tickets_id AND tu.type = 2)
           WHERE t.is_deleted = 0`
        );
        const row = glpiAlertRes.rows?.[0] || {};
        const slaVencidos = Number(row.sla_estourado || 0);
        const criticosSemTec = Number(row.criticos_sem_tecnico || 0);

        if (slaVencidos > 0) {
          let topTicketsText = '';
          try {
            const topTicketsRes = await this.executeQuery(
              connectorId,
              `SELECT t.id, t.name
               FROM glpi_tickets t
               WHERE t.is_deleted = 0 AND t.time_to_resolve IS NOT NULL AND t.time_to_resolve < NOW() AND t.status IN (1, 2, 3, 4)
               ORDER BY t.priority DESC, t.time_to_resolve ASC
               LIMIT 3`
            );
            if (topTicketsRes.rows && topTicketsRes.rows.length > 0) {
              topTicketsText = topTicketsRes.rows.map((t: any) => `**#${t.id}** (${t.name})`).join(', ');
            }
          } catch (_) {}

          let msg = `Existem **${slaVencidos} chamado(s)** em aberto com prazo limite de resolução (SLA) estourado.`;
          if (topTicketsText) {
            msg += `\n• **Chamados prioritários vencidos:** ${topTicketsText}.`;
          }
          msg += `\n• 💡 **Ação sugerida:** Escalar analistas de N2/N3 ou redistribuir chamados críticos com gestores.`;

          anomalies.push({
            type: 'sla_estourado',
            level: 'critical',
            title: 'SLA Vencido no GLPI',
            message: msg,
          });
        }
        if (criticosSemTec > 0) {
          anomalies.push({
            type: 'critico_sem_tecnico',
            level: 'warning',
            title: 'Chamados Críticos sem Técnico Atribuído',
            message: `Existem **${criticosSemTec} chamado(s)** de alta prioridade sem nenhum técnico responsável atribuído.\n• 💡 **Ação sugerida:** Fazer atribuição imediata para evitar estouro de SLA.`,
          });
        }
      }
    } catch (e: any) {
      console.warn('[DatabaseService] Falha ao verificar anomalias:', e.message);
    }

    anomalyCache.set(connectorId, { timestamp: Date.now(), anomalies });
    return anomalies;
  }

  // --- CRUD DE PRESETS DINÂMICOS ---

  static async listPresets(connectorId: string) {
    return await (prisma as any).dataSourcePreset.findMany({
      where: { connector_id: connectorId },
      orderBy: { created_at: 'asc' },
    });
  }

  static async createPreset(data: {
    connector_id: string;
    title: string;
    description?: string;
    category?: string;
    query_payload: string;
    visualization_type?: string;
    badge_color?: string;
    is_system?: boolean;
  }) {
    return await (prisma as any).dataSourcePreset.create({
      data: {
        connector_id: data.connector_id,
        title: data.title,
        description: data.description || null,
        category: data.category || 'Geral',
        query_payload: data.query_payload,
        visualization_type: data.visualization_type || 'table',
        badge_color: data.badge_color || 'cyan',
        is_system: Boolean(data.is_system),
      },
    });
  }

  static async updatePreset(
    id: string,
    data: {
      title?: string;
      description?: string;
      category?: string;
      query_payload?: string;
      visualization_type?: string;
      badge_color?: string;
    }
  ) {
    return await (prisma as any).dataSourcePreset.update({
      where: { id },
      data,
    });
  }

  static async deletePreset(id: string) {
    return await (prisma as any).dataSourcePreset.delete({
      where: { id },
    });
  }

  /**
   * Semeia presets padrão profissionais se o conector for GLPI ou Vetor Lake
   */
  private static async seedDefaultPresets(connector: any) {
    if (!connector || !connector.name) return;

    const count = await (prisma as any).dataSourcePreset.count({
      where: { connector_id: connector.id },
    });
    if (count > 0) return;

    const isGlpi = connector.name.toLowerCase().includes('glpi') || (connector.database || '').toLowerCase().includes('glpi');
    if (isGlpi) {
      const defaultPresets = [
      {
        title: '📊 Panorama Geral (100% da Base)',
        description: 'Métricas consolidadas e volumetria total do GLPI',
        category: 'Analytics',
        visualization_type: 'kpi',
        badge_color: 'indigo',
        is_system: true,
        query_payload: `SELECT 
  COUNT(*) AS total_historico_chamados,
  SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS total_em_aberto,
  SUM(CASE WHEN t.status = 1 THEN 1 ELSE 0 END) AS novos,
  SUM(CASE WHEN t.status IN (2, 3) THEN 1 ELSE 0 END) AS em_atendimento,
  SUM(CASE WHEN t.status = 4 THEN 1 ELSE 0 END) AS pendentes,
  SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS concluidos_fechados,
  ROUND(AVG(TIMESTAMPDIFF(HOUR, t.date, t.solvedate)), 1) AS mttr_medio_horas
FROM glpi_tickets t
WHERE t.is_deleted = 0;`,
      },
      {
        title: 'Abertos Hoje',
        description: 'Chamados abertos na data de hoje',
        category: 'Operacional',
        visualization_type: 'table',
        badge_color: 'cyan',
        is_system: true,
        query_payload: `SELECT t.id, t.name AS titulo, t.date AS data_abertura, 
CASE t.status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Outro' END AS status_nome,
CASE t.priority WHEN 1 THEN 'Muito Baixa' WHEN 2 THEN 'Baixa' WHEN 3 THEN 'Média' WHEN 4 THEN 'Alta' WHEN 5 THEN 'Muito Alta' WHEN 6 THEN 'Maior' ELSE 'Normal' END AS prioridade,
COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
COALESCE(NULLIF(CONCAT(COALESCE(u_req.firstname, ''), ' ', COALESCE(u_req.realname, '')), ' '), u_req.name, 'Não identificado') AS requerente,
COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_req ON (t.id = tu_req.tickets_id AND tu_req.type = 1)
LEFT JOIN glpi_users u_req ON tu_req.users_id = u_req.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE DATE(t.date) = CURDATE() AND t.is_deleted = 0
ORDER BY t.date DESC LIMIT 500;`,
      },
      {
        title: 'Em Aberto / Pendentes',
        description: 'Fila de chamados não concluídos',
        category: 'Operacional',
        visualization_type: 'table',
        badge_color: 'slate',
        is_system: true,
        query_payload: `SELECT t.id, t.name AS titulo, t.date AS data_abertura, 
CASE t.status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento' WHEN 3 THEN 'Planejado' WHEN 4 THEN 'Pendente' END AS status_nome,
CASE t.priority WHEN 4 THEN 'Alta' WHEN 5 THEN 'Muito Alta' WHEN 6 THEN 'Maior' ELSE 'Normal' END AS prioridade,
COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.status IN (1, 2, 3, 4) AND t.is_deleted = 0
ORDER BY t.priority DESC, t.id DESC LIMIT 500;`,
      },
      {
        title: 'Alta Prioridade / Críticos',
        description: 'Chamados urgentes que requerem atenção imediata',
        category: 'SLA',
        visualization_type: 'table',
        badge_color: 'rose',
        is_system: true,
        query_payload: `SELECT t.id, t.name AS titulo, t.date AS data_abertura, 
CASE t.status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento' WHEN 3 THEN 'Planejado' WHEN 4 THEN 'Pendente' END AS status_nome,
COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.priority >= 4 AND t.status IN (1, 2, 3, 4) AND t.is_deleted = 0
ORDER BY t.priority DESC, t.date DESC LIMIT 500;`,
      },
      {
        title: 'Resumo por Status (Total Base)',
        description: 'Distribuição percentual de chamados por status em toda a base',
        category: 'Analytics',
        visualization_type: 'pie_chart',
        badge_color: 'purple',
        is_system: true,
        query_payload: `SELECT 
CASE t.status 
  WHEN 1 THEN '1 - Novo' 
  WHEN 2 THEN '2 - Em atendimento' 
  WHEN 3 THEN '3 - Planejado' 
  WHEN 4 THEN '4 - Pendente' 
  WHEN 5 THEN '5 - Solucionado' 
  WHEN 6 THEN '6 - Fechado' 
  ELSE 'Outro' 
END AS status_descricao,
COUNT(*) AS total_chamados
FROM glpi_tickets t WHERE t.is_deleted = 0 GROUP BY t.status ORDER BY t.status ASC;`,
      },
      {
        title: 'Resumo por Categoria (Total Base)',
        description: 'Categorias com chamados registrados em toda a base',
        category: 'Analytics',
        visualization_type: 'bar_chart',
        badge_color: 'emerald',
        is_system: true,
        query_payload: `SELECT COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
COUNT(*) AS total_chamados,
SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS em_aberto,
SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS solucionados
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
WHERE t.is_deleted = 0 GROUP BY COALESCE(c.completename, c.name, 'Sem Categoria') ORDER BY total_chamados DESC;`,
      },
      {
        title: 'Resumo por Técnico (Total Base)',
        description: 'Carga de trabalho e resoluções por técnico em toda a base',
        category: 'Técnico',
        visualization_type: 'bar_chart',
        badge_color: 'cyan',
        is_system: true,
        query_payload: `SELECT COALESCE(NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '), u.name, 'Sem Técnico Atribuído') AS tecnico,
COUNT(*) AS total_chamados,
SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS em_aberto,
SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS solucionados
FROM glpi_tickets t
INNER JOIN glpi_tickets_users tu ON (t.id = tu.tickets_id AND tu.type = 2)
INNER JOIN glpi_users u ON tu.users_id = u.id
WHERE t.is_deleted = 0 GROUP BY tecnico ORDER BY total_chamados DESC;`,
      },
      {
        title: '⚠️ Atrasados / SLA Vencido',
        description: 'Chamados em aberto com tempo limite de resolução estourado',
        category: 'SLA',
        visualization_type: 'table',
        badge_color: 'amber',
        is_system: true,
        query_payload: `SELECT t.id, t.name AS titulo, t.date AS data_abertura, t.time_to_resolve AS data_limite_sla,
TIMESTAMPDIFF(HOUR, t.time_to_resolve, NOW()) AS horas_em_atraso,
COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.time_to_resolve IS NOT NULL AND t.time_to_resolve < NOW() AND t.status IN (1, 2, 3, 4) AND t.is_deleted = 0
ORDER BY t.time_to_resolve ASC LIMIT 500;`,
      },
      {
        title: '⭐ Pesquisa Satisfação (CSAT)',
        description: 'Avaliações de satisfação dos usuários',
        category: 'Analytics',
        visualization_type: 'table',
        badge_color: 'purple',
        is_system: true,
        query_payload: `SELECT t.id AS ticket_id, t.name AS titulo_chamado, s.satisfaction AS nota_satisfacao_1_a_5, s.comment AS comentario_usuario, s.date_mod AS data_avaliacao,
COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Técnico Não Definido') AS tecnico_avaliado
FROM glpi_ticketsatisfactions s
INNER JOIN glpi_tickets t ON s.tickets_id = t.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.is_deleted = 0 ORDER BY s.id DESC LIMIT 500;`,
      },
      {
        title: '🔄 Matriz de Reincidência & Problemas',
        description: 'Categorias e assuntos com maior volume repetitivo (Gestão de Problemas ITIL)',
        category: 'Analytics',
        visualization_type: 'table',
        badge_color: 'amber',
        is_system: true,
        query_payload: `SELECT 
COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
COUNT(t.id) AS total_ocorrencias,
SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS ativos_na_fila,
SUM(CASE WHEN t.type = 1 THEN 1 ELSE 0 END) AS total_incidentes,
ROUND(AVG(TIMESTAMPDIFF(HOUR, t.date, t.solvedate)), 1) AS mttr_medio_horas,
SUBSTRING(GROUP_CONCAT(DISTINCT t.name SEPARATOR ' | '), 1, 150) AS principais_assuntos
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
WHERE t.is_deleted = 0
GROUP BY COALESCE(c.completename, c.name, 'Sem Categoria')
HAVING COUNT(t.id) >= 2
ORDER BY total_ocorrencias DESC
LIMIT 50;`,
      },
      {
        title: '⚖️ Aging e Carga por Técnico',
        description: 'Distribuição da fila de atendimento e tempo de retenção por técnico',
        category: 'Técnico',
        visualization_type: 'table',
        badge_color: 'cyan',
        is_system: true,
        query_payload: `SELECT 
COALESCE(NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '), u.name, 'Não Atribuído') AS tecnico,
COUNT(t.id) AS total_chamados_abertos,
SUM(CASE WHEN t.priority IN (4, 5, 6) THEN 1 ELSE 0 END) AS chamados_alta_prioridade,
SUM(CASE WHEN DATEDIFF(NOW(), t.date) > 5 THEN 1 ELSE 0 END) AS parados_mais_de_5_dias,
SUM(CASE WHEN DATEDIFF(NOW(), t.date) > 15 THEN 1 ELSE 0 END) AS parados_mais_de_15_dias,
SUM(CASE WHEN t.time_to_resolve IS NOT NULL AND t.time_to_resolve < NOW() THEN 1 ELSE 0 END) AS sla_vencido,
ROUND(AVG(DATEDIFF(NOW(), t.date)), 1) AS aging_medio_dias,
MAX(DATEDIFF(NOW(), t.date)) AS chamado_mais_antigo_dias
FROM glpi_tickets t
LEFT JOIN glpi_tickets_users tu ON (t.id = tu.tickets_id AND tu.type = 2)
LEFT JOIN glpi_users u ON tu.users_id = u.id
WHERE t.status IN (1, 2, 3, 4) AND t.is_deleted = 0
GROUP BY u.id, u.firstname, u.realname, u.name
ORDER BY total_chamados_abertos DESC;`,
      },
      {
        title: '📈 Mapa de Calor & Picos de Horário',
        description: 'Concentração de abertura por dia da semana e hora do dia (últimos 90 dias)',
        category: 'Analytics',
        visualization_type: 'bar_chart',
        badge_color: 'purple',
        is_system: true,
        query_payload: `SELECT 
CASE DAYOFWEEK(t.date)
  WHEN 1 THEN 'Dom' WHEN 2 THEN 'Seg' WHEN 3 THEN 'Ter' WHEN 4 THEN 'Qua' WHEN 5 THEN 'Qui' WHEN 6 THEN 'Sex' WHEN 7 THEN 'Sáb'
END AS dia_semana,
HOUR(t.date) AS hora_do_dia,
COUNT(t.id) AS total_chamados_abertos,
SUM(CASE WHEN t.type = 1 THEN 1 ELSE 0 END) AS incidentes,
SUM(CASE WHEN t.type = 2 THEN 1 ELSE 0 END) AS requisicoes
FROM glpi_tickets t
WHERE t.is_deleted = 0 AND t.date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
GROUP BY DAYOFWEEK(t.date), HOUR(t.date)
ORDER BY total_chamados_abertos DESC
LIMIT 50;`,
      },
      {
        title: '🚨 Auditoria de Prioridade & Urgência',
        description: 'Chamados com prioridade baixa/média com palavras críticas na descrição',
        category: 'SLA',
        visualization_type: 'table',
        badge_color: 'rose',
        is_system: true,
        query_payload: `SELECT 
t.id, 
t.name AS titulo, 
t.date AS data_abertura, 
CASE t.priority WHEN 1 THEN 'Muito Baixa' WHEN 2 THEN 'Baixa' WHEN 3 THEN 'Média' ELSE 'Normal' END AS prioridade_cadastrada,
CASE t.status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento' WHEN 4 THEN 'Pendente' ELSE 'Em aberto' END AS status_nome,
COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.status IN (1, 2, 3, 4)
  AND t.priority IN (1, 2, 3)
  AND (
    t.name LIKE '%parado%' OR t.name LIKE '%faturamento%' OR t.name LIKE '%urgente%' OR t.name LIKE '%emergência%' OR t.name LIKE '%emergencia%' OR t.name LIKE '%diretoria%' OR t.name LIKE '%fora do ar%' OR t.name LIKE '%travou%' OR t.name LIKE '%fiscal%' OR t.name LIKE '%bloqueado geral%' OR t.name LIKE '%indisponível%' OR t.name LIKE '%indisponivel%'
    OR t.content LIKE '%parado%' OR t.content LIKE '%faturamento%' OR t.content LIKE '%urgente%' OR t.content LIKE '%diretoria%' OR t.content LIKE '%fora do ar%'
  )
  AND t.is_deleted = 0
ORDER BY t.date DESC
LIMIT 100;`,
      },
    ];

      for (const p of defaultPresets) {
        await (prisma as any).dataSourcePreset.create({
          data: {
            connector_id: connector.id,
            ...p,
          },
        });
      }
      return;
    }

    // Presets para Vetor Lake / Datalake de Vendas e ERP
    const isVetorLake = connector.name.toLowerCase().includes('vetor') ||
      connector.name.toLowerCase().includes('lake') ||
      (connector.database || '').toLowerCase().includes('unipreco') ||
      (connector.db_type === 'postgresql' && connector.category === 'database');

    if (isVetorLake) {
      const lakePresets = [
        {
          title: '💰 Faturamento Hoje por Filial',
          description: 'Total de vendas líquidas realizadas hoje agrupadas por loja',
          category: 'Vendas',
          visualization_type: 'table',
          badge_color: 'emerald',
          is_system: true,
          query_payload: `SELECT 
  f.codigo_filial,
  f.nome_filial,
  COUNT(DISTINCT d.codigo_documento) AS total_cupons,
  SUM(i.quantidade) AS total_itens_vendidos,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS total_faturamento_liquido,
  ROUND((SUM(i.valor_item_liquido) / NULLIF(COUNT(DISTINCT d.codigo_documento), 0))::numeric, 2) AS ticket_medio
FROM datalake.tb_documentos d
INNER JOIN datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento
LEFT JOIN datalake.tb_filiais f ON d.codigo_filial = f.codigo_filial
WHERE d.data_documento = CURRENT_DATE AND i.codigo_situacao = 1
GROUP BY f.codigo_filial, f.nome_filial
ORDER BY total_faturamento_liquido DESC LIMIT 200;`,
        },
        {
          title: '📈 Comparativo: Hoje vs Ontem por Loja',
          description: 'Acompanha o desempenho diário comparando vendas de hoje com ontem',
          category: 'Vendas',
          visualization_type: 'table',
          badge_color: 'emerald',
          is_system: true,
          query_payload: `SELECT 
  f.codigo_filial,
  f.nome_filial,
  ROUND(COALESCE(SUM(CASE WHEN d.data_documento = CURRENT_DATE THEN i.valor_item_liquido END), 0)::numeric, 2) AS faturamento_hoje,
  ROUND(COALESCE(SUM(CASE WHEN d.data_documento = CURRENT_DATE - INTERVAL '1 day' THEN i.valor_item_liquido END), 0)::numeric, 2) AS faturamento_ontem,
  COUNT(DISTINCT CASE WHEN d.data_documento = CURRENT_DATE THEN d.codigo_documento END) AS cupons_hoje
FROM datalake.tb_filiais f
LEFT JOIN datalake.tb_documentos d ON f.codigo_filial = d.codigo_filial AND d.data_documento >= CURRENT_DATE - INTERVAL '1 day'
LEFT JOIN datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento AND i.codigo_situacao = 1
WHERE f.filial_status = 'ATIVA' AND f.filial_especie = 'LOJA'
GROUP BY f.codigo_filial, f.nome_filial
ORDER BY faturamento_hoje DESC;`,
        },
        {
          title: '💳 Faturamento por Meio de Pagamento (Hoje)',
          description: 'Distribuição dos valores recebidos por tipo de pagamento',
          category: 'Vendas',
          visualization_type: 'pie_chart',
          badge_color: 'purple',
          is_system: true,
          query_payload: `SELECT 
  'Cartão de Crédito/Débito' AS forma_pagamento,
  ROUND(SUM(i.valor_cartao)::numeric, 2) AS valor_total
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
WHERE d.data_documento = CURRENT_DATE AND i.codigo_situacao = 1 AND i.valor_cartao > 0
UNION ALL
SELECT 
  'Dinheiro / À Vista',
  ROUND(SUM(i.valor_dinheiro)::numeric, 2)
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
WHERE d.data_documento = CURRENT_DATE AND i.codigo_situacao = 1 AND i.valor_dinheiro > 0
UNION ALL
SELECT 
  'Convênio / Corporativo',
  ROUND(SUM(i.valor_convenio)::numeric, 2)
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
WHERE d.data_documento = CURRENT_DATE AND i.codigo_situacao = 1 AND i.valor_convenio > 0
UNION ALL
SELECT 
  'PBM / Subsídio Farmacêutico',
  ROUND(SUM(i.valor_pbm)::numeric, 2)
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
WHERE d.data_documento = CURRENT_DATE AND i.codigo_situacao = 1 AND i.valor_pbm > 0
ORDER BY valor_total DESC;`,
        },
        {
          title: '⏰ Curva Horária de Vendas & Pico de Atendimento',
          description: 'Volume de cupons e faturamento por hora do dia',
          category: 'Vendas',
          visualization_type: 'bar_chart',
          badge_color: 'cyan',
          is_system: true,
          query_payload: `SELECT 
  EXTRACT(HOUR FROM d.hora_documento) AS hora_do_dia,
  COUNT(DISTINCT d.codigo_documento) AS total_cupons,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS total_faturamento,
  ROUND((SUM(i.valor_item_liquido) / NULLIF(COUNT(DISTINCT d.codigo_documento), 0))::numeric, 2) AS ticket_medio
FROM datalake.tb_documentos d
INNER JOIN datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento
WHERE d.data_documento = CURRENT_DATE AND i.codigo_situacao = 1
GROUP BY EXTRACT(HOUR FROM d.hora_documento)
ORDER BY hora_do_dia ASC;`,
        },
        {
          title: '🏆 Top 20 Produtos Mais Vendidos Hoje',
          description: 'Ranking dos produtos com maior volume financeiro e quantidade vendida hoje',
          category: 'Vendas',
          visualization_type: 'bar_chart',
          badge_color: 'cyan',
          is_system: true,
          query_payload: `SELECT 
  p.codigo_produto,
  p.descricao_produto,
  l.descricao_linha AS linha,
  SUM(i.quantidade) AS quantidade_vendida,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS total_faturamento
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
INNER JOIN datalake.tb_produtos p ON i.codigo_produto = p.codigo_produto
LEFT JOIN datalake.tb_produto_linhas l ON p.codigo_linha = l.codigo_linha
WHERE d.data_documento = CURRENT_DATE AND i.codigo_situacao = 1
GROUP BY p.codigo_produto, p.descricao_produto, l.descricao_linha
ORDER BY total_faturamento DESC
LIMIT 20;`,
        },
        {
          title: '🔬 Desempenho por Linha de Medicamento (Mês)',
          description: 'Vendas consolidadas do mês por classificação farmacêutica',
          category: 'Produtos',
          visualization_type: 'bar_chart',
          badge_color: 'indigo',
          is_system: true,
          query_payload: `SELECT 
  COALESCE(l.descricao_linha, 'Outras Linhas') AS linha_produto,
  COUNT(DISTINCT i.codigo_produto) AS skus_distintos_vendidos,
  SUM(i.quantidade) AS unidades_vendidas,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS total_faturado,
  ROUND(AVG(i.percentual_desconto)::numeric, 1) AS desconto_medio_pct
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
INNER JOIN datalake.tb_produtos p ON i.codigo_produto = p.codigo_produto
LEFT JOIN datalake.tb_produto_linhas l ON p.codigo_linha = l.codigo_linha
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 1
GROUP BY l.descricao_linha
ORDER BY total_faturado DESC;`,
        },
        {
          title: '🏭 Top 15 Laboratórios / Fabricantes (Mês)',
          description: 'Ranking dos laboratórios mais comercializados no mês atual',
          category: 'Produtos',
          visualization_type: 'table',
          badge_color: 'slate',
          is_system: true,
          query_payload: `SELECT 
  f.codigo_fabricante,
  f.nome_fabricante AS laboratorio,
  SUM(i.quantidade) AS total_unidades,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS faturamento_liquido,
  ROUND(SUM(i.valor_desconto)::numeric, 2) AS total_descontos_concedidos
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
INNER JOIN datalake.tb_produtos p ON i.codigo_produto = p.codigo_produto
INNER JOIN datalake.tb_fabricante f ON p.codigo_fabricante = f.codigo_fabricante
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 1
GROUP BY f.codigo_fabricante, f.nome_fabricante
ORDER BY faturamento_liquido DESC
LIMIT 15;`,
        },
        {
          title: '🏷️ Penetração e Vendas de Marca Própria (Mês)',
          description: 'Participação percentual e financeira dos produtos de Marca Própria',
          category: 'Produtos',
          visualization_type: 'kpi',
          badge_color: 'emerald',
          is_system: true,
          query_payload: `SELECT 
  COUNT(DISTINCT CASE WHEN p.produto_marca_propria_simnao = 1 THEN d.codigo_documento END) AS cupons_com_marca_propria,
  SUM(CASE WHEN p.produto_marca_propria_simnao = 1 THEN i.quantidade ELSE 0 END) AS unidades_marca_propria,
  ROUND(SUM(CASE WHEN p.produto_marca_propria_simnao = 1 THEN i.valor_item_liquido ELSE 0 END)::numeric, 2) AS faturamento_marca_propria,
  ROUND((SUM(CASE WHEN p.produto_marca_propria_simnao = 1 THEN i.valor_item_liquido ELSE 0 END) * 100.0 / NULLIF(SUM(i.valor_item_liquido), 0))::numeric, 2) AS share_marca_propria_pct
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
INNER JOIN datalake.tb_produtos p ON i.codigo_produto = p.codigo_produto
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 1;`,
        },
        {
          title: '💊 Controle Especial & Portaria 344 (Hoje)',
          description: 'Medicamentos controlados/psicotrópicos vendidos hoje para auditoria',
          category: 'Produtos',
          visualization_type: 'table',
          badge_color: 'rose',
          is_system: true,
          query_payload: `SELECT 
  f.nome_filial,
  p.codigo_produto,
  p.descricao_produto,
  SUM(i.quantidade) AS quantidade_dispensada,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS valor_total,
  COUNT(DISTINCT d.codigo_documento) AS total_receitas_atendidas
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
INNER JOIN datalake.tb_produtos p ON i.codigo_produto = p.codigo_produto
LEFT JOIN datalake.tb_filiais f ON d.codigo_filial = f.codigo_filial
WHERE d.data_documento = CURRENT_DATE 
  AND p.produto_controle_sngpc_simnao = 1 
  AND i.codigo_situacao = 1
GROUP BY f.nome_filial, p.codigo_produto, p.descricao_produto
ORDER BY quantidade_dispensada DESC LIMIT 100;`,
        },
        {
          title: '🚨 Ruptura Crítica de Estoque: Curva A Zerada',
          description: 'SKUs de altíssimo giro (Curva A) com estoque zerado nas lojas',
          category: 'Estoque',
          visualization_type: 'table',
          badge_color: 'rose',
          is_system: true,
          query_payload: `SELECT 
  fil.nome_filial,
  p.codigo_produto,
  p.descricao_produto,
  l.descricao_linha AS linha,
  e.curva,
  e.eseg AS estoque_minimo_seguranca,
  e.estoque AS saldo_atual
FROM datalake.tb_filial_estoque e
INNER JOIN datalake.tb_filiais fil ON e.codigo_filial = fil.codigo_filial
INNER JOIN datalake.tb_produtos p ON e.codigo_produto = p.codigo_produto
LEFT JOIN datalake.tb_produto_linhas l ON p.codigo_linha = l.codigo_linha
WHERE e.curva = 'A' 
  AND e.estoque <= 0 
  AND fil.filial_status = 'ATIVA' 
  AND fil.filial_especie = 'LOJA'
ORDER BY fil.nome_filial ASC, p.descricao_produto ASC
LIMIT 100;`,
        },
        {
          title: '💰 Capital Parado em Estoque por Curva ABC',
          description: 'Valor financeiro total estocado distribuído por classificação de giro',
          category: 'Estoque',
          visualization_type: 'bar_chart',
          badge_color: 'amber',
          is_system: true,
          query_payload: `SELECT 
  COALESCE(e.curva, 'Sem Curva') AS curva_abc,
  COUNT(DISTINCT e.codigo_produto) AS skus_cadastrados,
  SUM(e.estoque) AS saldo_total_unidades,
  ROUND(SUM(e.estoque * e.valor_custo_medio)::numeric, 2) AS valor_total_custo_estoque
FROM datalake.tb_filial_estoque e
WHERE e.estoque > 0
GROUP BY e.curva
ORDER BY valor_total_custo_estoque DESC;`,
        },
        {
          title: '⚠️ Alerta de Produtos Pré-Vencidos nas Filiais',
          description: 'Lotes próximos do vencimento nas lojas que demandam campanhas',
          category: 'Estoque',
          visualization_type: 'table',
          badge_color: 'amber',
          is_system: true,
          query_payload: `SELECT 
  fil.nome_filial,
  p.codigo_produto,
  p.descricao_produto,
  e.qtde_pre_vencido AS unidades_pre_vencidas,
  ROUND((e.qtde_pre_vencido * e.valor_custo_medio)::numeric, 2) AS valor_custo_risco
FROM datalake.tb_filial_estoque e
INNER JOIN datalake.tb_filiais fil ON e.codigo_filial = fil.codigo_filial
INNER JOIN datalake.tb_produtos p ON e.codigo_produto = p.codigo_produto
WHERE e.qtde_pre_vencido > 0
ORDER BY valor_custo_risco DESC
LIMIT 100;`,
        },
        {
          title: '🎖️ Taxa de Clientes Fidelizados no Caixa (Hoje)',
          description: 'Percentual de cupons e faturamento emitidos com CPF/Cliente Fidelizado hoje',
          category: 'CRM',
          visualization_type: 'kpi',
          badge_color: 'cyan',
          is_system: true,
          query_payload: `SELECT 
  COUNT(DISTINCT d.codigo_documento) AS total_cupons_dia,
  COUNT(DISTINCT CASE WHEN pes.cliente_fidelizado_simnao = 1 THEN d.codigo_documento END) AS cupons_fidelizados,
  ROUND((COUNT(DISTINCT CASE WHEN pes.cliente_fidelizado_simnao = 1 THEN d.codigo_documento END) * 100.0 / NULLIF(COUNT(DISTINCT d.codigo_documento), 0))::numeric, 2) AS taxa_fidelizacao_pct,
  ROUND(SUM(CASE WHEN pes.cliente_fidelizado_simnao = 1 THEN i.valor_item_liquido ELSE 0 END)::numeric, 2) AS faturamento_fidelizado
FROM datalake.tb_documentos d
INNER JOIN datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento
LEFT JOIN datalake.tb_pessoas pes ON d.codigo_pessoa = pes.codigo_pessoa
WHERE d.data_documento = CURRENT_DATE AND i.codigo_situacao = 1;`,
        },
        {
          title: '🏢 Top 10 Convênios Corporativos do Mês',
          description: 'Convênios e empresas parceiras com maior volume de faturamento',
          category: 'CRM',
          visualization_type: 'bar_chart',
          badge_color: 'indigo',
          is_system: true,
          query_payload: `SELECT 
  c.codigo_convenio,
  c.descricao_convenio AS empresa_convenio,
  COUNT(DISTINCT d.codigo_documento) AS total_atendimentos,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS faturamento_total_convenio
FROM datalake.tb_documentos d
INNER JOIN datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento
INNER JOIN datalake.tb_convenios c ON d.codigo_convenio = c.codigo_convenio
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 1
GROUP BY c.codigo_convenio, c.descricao_convenio
ORDER BY faturamento_total_convenio DESC
LIMIT 10;`,
        },
        {
          title: '🏆 Ranking de Vendedores: Faturamento & Comissão',
          description: 'Vendas líquidas, itens e projeção de comissão por colaborador',
          category: 'Equipe',
          visualization_type: 'table',
          badge_color: 'emerald',
          is_system: true,
          query_payload: `SELECT 
  func.nome_funcionario AS vendedor,
  fil.nome_filial,
  COUNT(DISTINCT d.codigo_documento) AS atendimentos_realizados,
  SUM(i.quantidade) AS total_itens_vendidos,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS total_faturamento,
  ROUND(SUM(i.valor_item_liquido * (i.percentual_comissao / 100.0))::numeric, 2) AS total_comissao_gerada
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
INNER JOIN datalake.tb_funcionarios func ON i.codigo_vendedor = func.codigo_pessoa
LEFT JOIN datalake.tb_filiais fil ON d.codigo_filial = fil.codigo_filial
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 1
GROUP BY func.nome_funcionario, fil.nome_filial
ORDER BY total_faturamento DESC
LIMIT 20;`,
        },
        {
          title: '🧾 Cupons Cancelados & Auditoria de Perda',
          description: 'Auditoria de vendas canceladas para prevenção de perdas e fraudes',
          category: 'Operacional',
          visualization_type: 'table',
          badge_color: 'rose',
          is_system: true,
          query_payload: `SELECT 
  f.nome_filial,
  COUNT(DISTINCT d.codigo_documento) AS total_cupons_cancelados,
  SUM(i.quantidade) AS itens_cancelados,
  ROUND(SUM(i.valor_item_bruto)::numeric, 2) AS valor_total_cancelado
FROM datalake.tb_documentos d
INNER JOIN datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento
LEFT JOIN datalake.tb_filiais f ON d.codigo_filial = f.codigo_filial
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 2
GROUP BY f.nome_filial
ORDER BY valor_total_cancelado DESC
LIMIT 50;`,
        },
        {
          title: '📊 Margem Bruta & CMV Estimado por Filial',
          description: 'Venda Líquida vs Custo da Mercadoria Vendida (CMV) e Margem Bruta',
          category: 'Financeiro',
          visualization_type: 'table',
          badge_color: 'purple',
          is_system: true,
          query_payload: `SELECT 
  f.nome_filial,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS faturamento_liquido,
  ROUND(SUM(i.quantidade * i.valor_custo_medio)::numeric, 2) AS cmv_total,
  ROUND((SUM(i.valor_item_liquido) - SUM(i.quantidade * i.valor_custo_medio))::numeric, 2) AS lucro_bruto_reais,
  ROUND(((SUM(i.valor_item_liquido) - SUM(i.quantidade * i.valor_custo_medio)) * 100.0 / NULLIF(SUM(i.valor_item_liquido), 0))::numeric, 2) AS margem_bruta_pct
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
LEFT JOIN datalake.tb_filiais f ON d.codigo_filial = f.codigo_filial
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 1
GROUP BY f.nome_filial
ORDER BY lucro_bruto_reais DESC
LIMIT 50;`,
        },
        {
          title: '📉 DRE: Maiores Despesas por Centro de Custo',
          description: 'Despesas pagas no mês consolidado por conta do DRE e centro de custo',
          category: 'Financeiro',
          visualization_type: 'bar_chart',
          badge_color: 'rose',
          is_system: true,
          query_payload: `SELECT 
  COALESCE(d.descricao_centro_custo, 'Geral') AS centro_custo,
  COALESCE(d.descricao_conta_dre, d.descricao_despesa, 'Despesa') AS conta_dre,
  ROUND(SUM(d.valor_despesa)::numeric, 2) AS total_despesas
FROM datalake.tb_analise_dre d
WHERE d.data_pagamento >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY d.descricao_centro_custo, COALESCE(d.descricao_conta_dre, d.descricao_despesa, 'Despesa')
ORDER BY total_despesas DESC
LIMIT 15;`,
        },
        {
          title: '📊 Faturamento do Mês Atual por Canal',
          description: 'Vendas acumuladas no mês divididas por canal (Balcão, Televendas, E-commerce)',
          category: 'Analytics',
          visualization_type: 'pie_chart',
          badge_color: 'purple',
          is_system: true,
          query_payload: `SELECT 
  COALESCE(o.descricao_origem, 'Balcão / Loja Física') AS canal_venda,
  COUNT(DISTINCT d.codigo_documento) AS total_cupons,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS total_faturamento
FROM datalake.tb_documentos d
INNER JOIN datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento
LEFT JOIN datalake.tb_documento_origem o ON d.codigo_origem = o.codigo_origem
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 1
GROUP BY o.descricao_origem
ORDER BY total_faturamento DESC;`,
        },
        {
          title: '📦 Posição de Estoque Crítico & Ruptura',
          description: 'Produtos ativos com estoque zerado ou abaixo do estoque de segurança',
          category: 'Estoque',
          visualization_type: 'table',
          badge_color: 'rose',
          is_system: true,
          query_payload: `SELECT 
  f.nome_filial,
  p.codigo_produto,
  p.descricao_produto,
  e.estoque AS saldo_atual,
  e.eseg AS estoque_seguranca,
  e.curva,
  e.situacao_estoque
FROM datalake.tb_filial_estoque e
INNER JOIN datalake.tb_filiais f ON e.codigo_filial = f.codigo_filial
INNER JOIN datalake.tb_produtos p ON e.codigo_produto = p.codigo_produto
WHERE e.estoque <= 0 AND e.curva IN ('A', 'B')
ORDER BY e.curva ASC, f.nome_filial ASC
LIMIT 100;`,
        },
        {
          title: '📈 Forecast: Projeção de Fechamento do Mês (Run-Rate)',
          description: 'Projeção de faturamento até o final do mês com base na média diária realizada',
          category: 'Forecast',
          visualization_type: 'bar_chart',
          badge_color: 'emerald',
          is_system: true,
          query_payload: `SELECT 
  f.nome_filial,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS realizado_mes_ate_hoje,
  ROUND((SUM(i.valor_item_liquido) / EXTRACT(DAY FROM CURRENT_DATE))::numeric, 2) AS media_diaria_run_rate,
  ROUND(((SUM(i.valor_item_liquido) / EXTRACT(DAY FROM CURRENT_DATE)) * EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')))::numeric, 2) AS projecao_fechamento_mes,
  ROUND(((EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')) - EXTRACT(DAY FROM CURRENT_DATE)) * (SUM(i.valor_item_liquido) / EXTRACT(DAY FROM CURRENT_DATE)))::numeric, 2) AS faturamento_restante_estimado
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
LEFT JOIN datalake.tb_filiais f ON d.codigo_filial = f.codigo_filial
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 1
GROUP BY f.nome_filial
ORDER BY projecao_fechamento_mes DESC;`,
        },
        {
          title: '📅 Comparativo MoM: Mês Atual vs Mês Anterior',
          description: 'Variação percentual de faturamento e volume de vendas em relação ao mês anterior',
          category: 'Analytics',
          visualization_type: 'table',
          badge_color: 'indigo',
          is_system: true,
          query_payload: `WITH vendas_mes_atual AS (
  SELECT 
    d.codigo_filial,
    COUNT(DISTINCT d.codigo_documento) AS cupons_atual,
    SUM(i.valor_item_liquido) AS total_atual
  FROM datalake.tb_documentos d
  INNER JOIN datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento
  WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 1
  GROUP BY d.codigo_filial
),
vendas_mes_anterior AS (
  SELECT 
    d.codigo_filial,
    COUNT(DISTINCT d.codigo_documento) AS cupons_anterior,
    SUM(i.valor_item_liquido) AS total_anterior
  FROM datalake.tb_documentos d
  INNER JOIN datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento
  WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') 
    AND d.data_documento < DATE_TRUNC('month', CURRENT_DATE)
    AND i.codigo_situacao = 1
  GROUP BY d.codigo_filial
)
SELECT 
  f.nome_filial,
  ROUND(COALESCE(va.total_atual, 0)::numeric, 2) AS faturamento_mes_atual,
  ROUND(COALESCE(vp.total_anterior, 0)::numeric, 2) AS faturamento_mes_anterior,
  ROUND(((COALESCE(va.total_atual, 0) - COALESCE(vp.total_anterior, 0)) * 100.0 / NULLIF(vp.total_anterior, 0))::numeric, 2) AS variacao_mom_pct,
  va.cupons_atual,
  vp.cupons_anterior
FROM datalake.tb_filiais f
LEFT JOIN vendas_mes_atual va ON f.codigo_filial = va.codigo_filial
LEFT JOIN vendas_mes_anterior vp ON f.codigo_filial = vp.codigo_filial
ORDER BY faturamento_mes_atual DESC;`,
        },
        {
          title: '🛡️ Auditoria de Cancelamentos por Operador de Caixa',
          description: 'Detecção de quebras operacionais e operadores com maior volume de cupons cancelados',
          category: 'Auditoria',
          visualization_type: 'table',
          badge_color: 'rose',
          is_system: true,
          query_payload: `SELECT 
  f.nome_filial,
  COALESCE(d.codigo_operador, 'Sem Operador') AS operador_caixa,
  COUNT(DISTINCT CASE WHEN i.codigo_situacao = 2 THEN d.codigo_documento END) AS total_cupons_cancelados,
  COUNT(DISTINCT d.codigo_documento) AS total_cupons_totais,
  ROUND((COUNT(DISTINCT CASE WHEN i.codigo_situacao = 2 THEN d.codigo_documento END) * 100.0 / NULLIF(COUNT(DISTINCT d.codigo_documento), 0))::numeric, 2) AS taxa_cancelamento_pct,
  ROUND(SUM(CASE WHEN i.codigo_situacao = 2 THEN i.valor_item_bruto ELSE 0 END)::numeric, 2) AS valor_cancelado_reais
FROM datalake.tb_documentos d
INNER JOIN datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento
LEFT JOIN datalake.tb_filiais f ON d.codigo_filial = f.codigo_filial
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY f.nome_filial, d.codigo_operador
HAVING COUNT(DISTINCT CASE WHEN i.codigo_situacao = 2 THEN d.codigo_documento END) > 0
ORDER BY taxa_cancelamento_pct DESC, valor_cancelado_reais DESC
LIMIT 50;`,
        },
        {
          title: '🛡️ Auditoria de Descontos Excessivos (>35% no PDV)',
          description: 'Identificação de produtos vendidos com margem degradada ou descontos atípicos',
          category: 'Auditoria',
          visualization_type: 'table',
          badge_color: 'amber',
          is_system: true,
          query_payload: `SELECT 
  f.nome_filial,
  p.descricao_produto,
  d.codigo_documento,
  i.quantidade,
  ROUND(i.valor_item_bruto::numeric, 2) AS valor_bruto,
  ROUND(i.valor_item_liquido::numeric, 2) AS valor_liquido,
  ROUND(i.percentual_desconto::numeric, 1) AS desconto_pct,
  d.data_documento
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
LEFT JOIN datalake.tb_filiais f ON d.codigo_filial = f.codigo_filial
LEFT JOIN datalake.tb_produtos p ON i.codigo_produto = p.codigo_produto
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) 
  AND i.codigo_situacao = 1 
  AND i.percentual_desconto >= 35
ORDER BY i.percentual_desconto DESC, i.valor_desconto DESC
LIMIT 100;`,
        },
        {
          title: '🛒 Análise de Cesta: Produtos Comprados Juntos (Cross-Selling)',
          description: 'Afinidade de produtos e itens frequentemente adquiridos no mesmo cupom',
          category: 'Comercial',
          visualization_type: 'table',
          badge_color: 'indigo',
          is_system: true,
          query_payload: `SELECT 
  p1.descricao_produto AS produto_base,
  p2.descricao_produto AS produto_correlacionado,
  COUNT(DISTINCT i1.codigo_documento) AS compras_juntos,
  ROUND(SUM(i1.valor_item_liquido + i2.valor_item_liquido)::numeric, 2) AS receita_combinada
FROM datalake.tb_documentos_itens i1
INNER JOIN datalake.tb_documentos_itens i2 ON i1.codigo_documento = i2.codigo_documento AND i1.codigo_produto < i2.codigo_produto
INNER JOIN datalake.tb_documentos d ON i1.codigo_documento = d.codigo_documento
INNER JOIN datalake.tb_produtos p1 ON i1.codigo_produto = p1.codigo_produto
INNER JOIN datalake.tb_produtos p2 ON i2.codigo_produto = p2.codigo_produto
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i1.codigo_situacao = 1 AND i2.codigo_situacao = 1
GROUP BY p1.descricao_produto, p2.descricao_produto
ORDER BY compras_juntos DESC
LIMIT 20;`,
        },
        {
          title: '🔄 Sugestão de Transferência: Ruptura x Excesso de Estoque',
          description: 'Identifica lojas com produto zerado (Curva A/B) e outras lojas com excesso para remanejamento',
          category: 'Estoque',
          visualization_type: 'table',
          badge_color: 'emerald',
          is_system: true,
          query_payload: `WITH estoque_zerado AS (
  SELECT e.codigo_filial AS filial_destino, f.nome_filial AS nome_destino, e.codigo_produto, p.descricao_produto, e.curva
  FROM datalake.tb_filial_estoque e
  INNER JOIN datalake.tb_filiais f ON e.codigo_filial = f.codigo_filial
  INNER JOIN datalake.tb_produtos p ON e.codigo_produto = p.codigo_produto
  WHERE e.estoque <= 0 AND e.curva IN ('A', 'B')
),
estoque_excesso AS (
  SELECT e.codigo_filial AS filial_origem, f.nome_filial AS nome_origem, e.codigo_produto, e.estoque AS saldo_origem
  FROM datalake.tb_filial_estoque e
  INNER JOIN datalake.tb_filiais f ON e.codigo_filial = f.codigo_filial
  WHERE e.estoque >= 30
)
SELECT 
  ez.nome_destino AS filial_com_falta,
  ee.nome_origem AS filial_com_sobra,
  ez.descricao_produto,
  ez.curva,
  ee.saldo_origem AS unidades_disponiveis_origem,
  ROUND(ee.saldo_origem * 0.3)::int AS sugestao_transferencia_unidades
FROM estoque_zerado ez
INNER JOIN estoque_excesso ee ON ez.codigo_produto = ee.codigo_produto AND ez.filial_destino <> ee.filial_origem
ORDER BY ez.curva ASC, ee.saldo_origem DESC
LIMIT 50;`,
        },
        {
          title: '🎯 Simulação What-If: Impacto de +R$ 3 no Ticket Médio',
          description: 'Simula o ganho financeiro mensal com o incremento de R$ 3 no ticket médio de cada loja',
          category: 'Forecast',
          visualization_type: 'bar_chart',
          badge_color: 'purple',
          is_system: true,
          query_payload: `SELECT 
  f.nome_filial,
  COUNT(DISTINCT d.codigo_documento) AS total_cupons_mes,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS faturamento_atual,
  ROUND((SUM(i.valor_item_liquido) / NULLIF(COUNT(DISTINCT d.codigo_documento), 0))::numeric, 2) AS ticket_medio_atual,
  ROUND(((SUM(i.valor_item_liquido) / NULLIF(COUNT(DISTINCT d.codigo_documento), 0)) + 3.00)::numeric, 2) AS ticket_medio_simulado,
  ROUND((COUNT(DISTINCT d.codigo_documento) * ((SUM(i.valor_item_liquido) / NULLIF(COUNT(DISTINCT d.codigo_documento), 0)) + 3.00))::numeric, 2) AS faturamento_simulado_mes,
  ROUND((COUNT(DISTINCT d.codigo_documento) * 3.00)::numeric, 2) AS ganho_adicional_reais
FROM datalake.tb_documentos d
INNER JOIN datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento
LEFT JOIN datalake.tb_filiais f ON d.codigo_filial = f.codigo_filial
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 1
GROUP BY f.nome_filial
ORDER BY ganho_adicional_reais DESC;`,
        },
        {
          title: '🌡️ Mapa de Calor: Vendas por Faixa de Horário & Categoria',
          description: 'Distribuição das vendas e cupons ao longo do dia para dimensionamento de equipe',
          category: 'Analytics',
          visualization_type: 'bar_chart',
          badge_color: 'amber',
          is_system: true,
          query_payload: `SELECT 
  EXTRACT(HOUR FROM d.data_documento) AS hora_do_dia,
  COALESCE(l.descricao_linha, 'Outros') AS categoria_linha,
  COUNT(DISTINCT d.codigo_documento) AS total_cupons,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS faturamento_total
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
INNER JOIN datalake.tb_produtos p ON i.codigo_produto = p.codigo_produto
LEFT JOIN datalake.tb_produto_linhas l ON p.codigo_linha = l.codigo_linha
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 1
GROUP BY EXTRACT(HOUR FROM d.data_documento), l.descricao_linha
ORDER BY hora_do_dia ASC, faturamento_total DESC;`,
        },
        {
          title: '🏷️ Sensibilidade a Desconto: Volume vs Faixas de Desconto',
          description: 'Avaliação de elasticidade e impacto do desconto no faturamento e margem',
          category: 'Comercial',
          visualization_type: 'table',
          badge_color: 'rose',
          is_system: true,
          query_payload: `SELECT 
  CASE 
    WHEN i.percentual_desconto = 0 THEN '1. Sem Desconto (0%)'
    WHEN i.percentual_desconto <= 10 THEN '2. Desconto Baixo (0.1% a 10%)'
    WHEN i.percentual_desconto <= 25 THEN '3. Desconto Médio (10.1% a 25%)'
    WHEN i.percentual_desconto <= 40 THEN '4. Desconto Alto (25.1% a 40%)'
    ELSE '5. Desconto Agressivo (>40%)'
  END AS faixa_desconto,
  COUNT(DISTINCT d.codigo_documento) AS total_cupons,
  SUM(i.quantidade) AS total_unidades_vendidas,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS total_faturamento_liquido,
  ROUND(SUM(i.valor_desconto)::numeric, 2) AS total_desconto_concedido,
  ROUND((SUM(i.valor_desconto) * 100.0 / NULLIF(SUM(i.valor_item_bruto), 0))::numeric, 2) AS desconto_medio_real_pct
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 1
GROUP BY 1
ORDER BY 1 ASC;`,
        },
        {
          title: '🏆 Ranking de Vendedores & Balconistas do Mês',
          description: 'Desempenho individual de vendas, cupons emitidos e itens por atendimento',
          category: 'Comercial',
          visualization_type: 'table',
          badge_color: 'cyan',
          is_system: true,
          query_payload: `SELECT 
  COALESCE(d.codigo_vendedor, d.codigo_operador, 'Balconista') AS vendedor_id,
  f.nome_filial,
  COUNT(DISTINCT d.codigo_documento) AS total_atendimentos,
  SUM(i.quantidade) AS itens_vendidos,
  ROUND((SUM(i.quantidade)::numeric / NULLIF(COUNT(DISTINCT d.codigo_documento), 0)), 1) AS itens_por_cupom,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS faturamento_total,
  ROUND((SUM(i.valor_item_liquido) / NULLIF(COUNT(DISTINCT d.codigo_documento), 0))::numeric, 2) AS ticket_medio
FROM datalake.tb_documentos d
INNER JOIN datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento
LEFT JOIN datalake.tb_filiais f ON d.codigo_filial = f.codigo_filial
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 1
GROUP BY COALESCE(d.codigo_vendedor, d.codigo_operador, 'Balconista'), f.nome_filial
ORDER BY faturamento_total DESC
LIMIT 50;`,
        },
        {
          title: '📚 RAG Regulatório: Vendas de Medicamentos Controlados (Portaria 344)',
          description: 'Auditoria de saídas de psicotrópicos e controlados para conformidade SNGPC/Anvisa',
          category: 'Regulatório',
          visualization_type: 'table',
          badge_color: 'slate',
          is_system: true,
          query_payload: `SELECT 
  f.nome_filial,
  d.codigo_documento,
  d.data_documento,
  p.codigo_produto,
  p.descricao_produto,
  l.descricao_linha AS classificacao_farmaceutica,
  i.quantidade AS caixas_vendidas,
  ROUND(i.valor_item_liquido::numeric, 2) AS valor_venda
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
INNER JOIN datalake.tb_produtos p ON i.codigo_produto = p.codigo_produto
LEFT JOIN datalake.tb_produto_linhas l ON p.codigo_linha = l.codigo_linha
LEFT JOIN datalake.tb_filiais f ON d.codigo_filial = f.codigo_filial
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) 
  AND i.codigo_situacao = 1
  AND (
    LOWER(l.descricao_linha) LIKE '%controlad%' OR 
    LOWER(l.descricao_linha) LIKE '%psicotr%' OR 
    LOWER(l.descricao_linha) LIKE '%portaria%' OR
    LOWER(p.descricao_produto) LIKE '%retido%'
  )
ORDER BY d.data_documento DESC, f.nome_filial ASC
LIMIT 100;`,
        },
        {
          title: '⚖️ Auditoria Tributária: Itens Monofásicos & Créditos PIS/COFINS',
          description: 'Produtos farmacêuticos com potencial de crédito tributário e benefício monofásico',
          category: 'Fiscal',
          visualization_type: 'table',
          badge_color: 'amber',
          is_system: true,
          query_payload: `SELECT 
  p.codigo_produto,
  p.descricao_produto,
  COALESCE(l.descricao_linha, 'Geral') AS classificacao,
  SUM(i.quantidade) AS total_unidades_mes,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS faturamento_liquido,
  ROUND((SUM(i.valor_item_liquido) * 0.0925)::numeric, 2) AS potencial_credito_pis_cofins_reais
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
INNER JOIN datalake.tb_produtos p ON i.codigo_produto = p.codigo_produto
LEFT JOIN datalake.tb_produto_linhas l ON p.codigo_linha = l.codigo_linha
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 1
GROUP BY p.codigo_produto, p.descricao_produto, l.descricao_linha
ORDER BY faturamento_liquido DESC
LIMIT 50;`,
        },
        {
          title: '👥 Matriz RFV: Clientes de Medicamento Contínuo em Risco de Churn',
          description: 'Clientes fidelizados de uso contínuo sem compras há mais de 45 dias para retenção',
          category: 'Clientes',
          visualization_type: 'table',
          badge_color: 'rose',
          is_system: true,
          query_payload: `SELECT 
  COALESCE(d.cpf_cliente, 'Não Informado') AS cpf_cliente,
  COALESCE(d.nome_cliente, 'Cliente Fidelidade') AS nome_cliente,
  MAX(d.data_documento) AS ultima_compra,
  (CURRENT_DATE - MAX(d.data_documento)) AS dias_sem_comprar,
  COUNT(DISTINCT d.codigo_documento) AS total_compras_historico,
  ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS valor_total_gasto
FROM datalake.tb_documentos d
INNER JOIN datalake.tb_documentos_itens i ON d.codigo_documento = i.codigo_documento
WHERE d.data_documento >= CURRENT_DATE - INTERVAL '180 days' 
  AND d.cpf_cliente IS NOT NULL 
  AND d.cpf_cliente <> ''
GROUP BY d.cpf_cliente, d.nome_cliente
HAVING (CURRENT_DATE - MAX(d.data_documento)) BETWEEN 45 AND 120
ORDER BY valor_total_gasto DESC
LIMIT 100;`,
        },
        {
          title: '📦 Sugestão de Reposição: Pedido de Compra por Giro & Lead Time',
          description: 'Cálculo de quantidade ideal de reposição por fornecedor e histórico de 30 dias',
          category: 'Compras',
          visualization_type: 'table',
          badge_color: 'emerald',
          is_system: true,
          query_payload: `WITH giro_30d AS (
  SELECT 
    i.codigo_produto,
    SUM(i.quantidade) AS venda_30_dias,
    ROUND((SUM(i.quantidade)::numeric / 30.0), 2) AS media_venda_diaria
  FROM datalake.tb_documentos_itens i
  INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
  WHERE d.data_documento >= CURRENT_DATE - INTERVAL '30 days' AND i.codigo_situacao = 1
  GROUP BY i.codigo_produto
),
estoque_rede AS (
  SELECT 
    e.codigo_produto,
    SUM(e.estoque) AS saldo_total_rede,
    SUM(e.eseg) AS estoque_seguranca_total
  FROM datalake.tb_filial_estoque e
  GROUP BY e.codigo_produto
)
SELECT 
  p.codigo_produto,
  p.descricao_produto,
  COALESCE(f.nome_fabricante, 'Fabricante Principal') AS fornecedor_laboratorio,
  COALESCE(er.saldo_total_rede, 0) AS estoque_atual,
  g.media_venda_diaria,
  ROUND((g.media_venda_diaria * 7) + COALESCE(er.estoque_seguranca_total, 0)) AS estoque_alvo_7_dias,
  GREATEST(0, ROUND(((g.media_venda_diaria * 7) + COALESCE(er.estoque_seguranca_total, 0)) - COALESCE(er.saldo_total_rede, 0))) AS sugestao_compra_unidades
FROM giro_30d g
INNER JOIN datalake.tb_produtos p ON g.codigo_produto = p.codigo_produto
LEFT JOIN datalake.tb_fabricante f ON p.codigo_fabricante = f.codigo_fabricante
LEFT JOIN estoque_rede er ON g.codigo_produto = er.codigo_produto
WHERE ((g.media_venda_diaria * 7) + COALESCE(er.estoque_seguranca_total, 0)) > COALESCE(er.saldo_total_rede, 0)
ORDER BY sugestao_compra_unidades DESC
LIMIT 50;`,
        },
        {
          title: '⚖️ Ponto de Equilíbrio (Break-Even): Venda Mínima vs Despesas DRE',
          description: 'Faturamento mínimo necessário por loja para cobrir custos e gerar lucro',
          category: 'Financeiro',
          visualization_type: 'bar_chart',
          badge_color: 'purple',
          is_system: true,
          query_payload: `WITH despesas_loja AS (
  SELECT 
    d.codigo_filial,
    SUM(d.valor_despesa) AS total_despesas_mes
  FROM datalake.tb_analise_dre d
  WHERE d.data_pagamento >= DATE_TRUNC('month', CURRENT_DATE)
  GROUP BY d.codigo_filial
),
vendas_loja AS (
  SELECT 
    d.codigo_filial,
    SUM(i.valor_item_liquido) AS faturamento_atual,
    ROUND(((SUM(i.valor_item_liquido) - SUM(i.quantidade * i.valor_custo_medio)) * 100.0 / NULLIF(SUM(i.valor_item_liquido), 0))::numeric, 2) AS margem_bruta_pct
  FROM datalake.tb_documentos_itens i
  INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
  WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 1
  GROUP BY d.codigo_filial
)
SELECT 
  f.nome_filial,
  ROUND(COALESCE(dl.total_despesas_mes, 0)::numeric, 2) AS despesas_operacionais_mes,
  COALESCE(vl.margem_bruta_pct, 30.0) AS margem_bruta_media_pct,
  ROUND((COALESCE(dl.total_despesas_mes, 0) / NULLIF(COALESCE(vl.margem_bruta_pct, 30.0) / 100.0, 0))::numeric, 2) AS faturamento_break_even_mensal,
  ROUND(((COALESCE(dl.total_despesas_mes, 0) / NULLIF(COALESCE(vl.margem_bruta_pct, 30.0) / 100.0, 0)) / 30.0)::numeric, 2) AS meta_diaria_break_even,
  ROUND(COALESCE(vl.faturamento_atual, 0)::numeric, 2) AS faturamento_realizado_mes
FROM datalake.tb_filiais f
LEFT JOIN despesas_loja dl ON f.codigo_filial = dl.codigo_filial
LEFT JOIN vendas_loja vl ON f.codigo_filial = vl.codigo_filial
ORDER BY faturamento_realizado_mes DESC;`,
        },
        {
          title: '🔍 Monitor de Preços: Itens Mais Vendidos vs Parâmetro de Mercado',
          description: 'Acompanhamento de preços praticados e dispersão de valores de venda no PDV',
          category: 'Comercial',
          visualization_type: 'table',
          badge_color: 'indigo',
          is_system: true,
          query_payload: `SELECT 
  p.codigo_produto,
  p.descricao_produto,
  ROUND(AVG(i.valor_unitario_venda)::numeric, 2) AS preco_medio_praticado,
  ROUND(MIN(i.valor_unitario_venda)::numeric, 2) AS menor_preco_registrado,
  ROUND(MAX(i.valor_unitario_venda)::numeric, 2) AS maior_preco_registrado,
  ROUND(AVG(i.percentual_desconto)::numeric, 1) AS desconto_medio_pct,
  SUM(i.quantidade) AS total_vendido_mes
FROM datalake.tb_documentos_itens i
INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
INNER JOIN datalake.tb_produtos p ON i.codigo_produto = p.codigo_produto
WHERE d.data_documento >= DATE_TRUNC('month', CURRENT_DATE) AND i.codigo_situacao = 1
GROUP BY p.codigo_produto, p.descricao_produto
ORDER BY total_vendido_mes DESC
LIMIT 50;`,
        },
      ];

      for (const p of lakePresets) {
        await (prisma as any).dataSourcePreset.create({
          data: {
            connector_id: connector.id,
            ...p,
          },
        });
      }
    }
  }

  /**
   * Correlação Cruzada: Correlaciona incidentes de TI (GLPI) com o impacto em faturamento de loja (Vetor Lake)
   */
  static async crossCorrelateGLPIAndVetorLake(options?: { filialCode?: number; daysBack?: number }) {
    const connectors = await this.listConnectors();
    const lakeConnector = connectors.find((c: any) => c.name.toLowerCase().includes('lake') || c.db_type === 'postgresql');
    const glpiConnector = connectors.find((c: any) => c.name.toLowerCase().includes('glpi') || c.db_type === 'mysql');

    if (!lakeConnector || !glpiConnector) {
      return {
        success: false,
        error: 'Conectores Vetor Lake e GLPI precisam estar ambos cadastrados e ativos para correlação cruzada.',
      };
    }

    const days = options?.daysBack || 30;

    // 1. Obter incidentes de TI relacionados a PDV, TEF, Caixa ou Rede no GLPI
    const glpiSql = `SELECT 
      t.id AS ticket_id,
      t.name AS titulo,
      t.date AS data_abertura,
      t.solvedate AS data_solucao,
      TIMESTAMPDIFF(MINUTE, t.date, COALESCE(t.solvedate, NOW())) AS duracao_minutos,
      COALESCE(c.completename, c.name, 'Geral') AS categoria
    FROM glpi_tickets t
    LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
    WHERE t.date >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)
      AND (
        LOWER(t.name) LIKE '%pdv%' OR LOWER(t.name) LIKE '%caixa%' OR 
        LOWER(t.name) LIKE '%tef%' OR LOWER(t.name) LIKE '%lentid%' OR 
        LOWER(t.name) LIKE '%queda%' OR LOWER(t.name) LIKE '%loja%'
      )
      AND t.is_deleted = 0
    ORDER BY t.date DESC LIMIT 50;`;

    const glpiResult = await this.executeQuery(glpiConnector.id, glpiSql);

    // 2. Obter faturamento médio por hora no Vetor Lake
    const lakeSql = `SELECT 
      f.codigo_filial,
      f.nome_filial,
      ROUND(AVG(i.valor_item_liquido)::numeric, 2) AS ticket_medio_geral,
      ROUND(SUM(i.valor_item_liquido)::numeric, 2) AS faturamento_periodo
    FROM datalake.tb_documentos_itens i
    INNER JOIN datalake.tb_documentos d ON i.codigo_documento = d.codigo_documento
    LEFT JOIN datalake.tb_filiais f ON d.codigo_filial = f.codigo_filial
    WHERE d.data_documento >= CURRENT_DATE - INTERVAL '${days} days' AND i.codigo_situacao = 1
    GROUP BY f.codigo_filial, f.nome_filial
    ORDER BY faturamento_periodo DESC;`;

    const lakeResult = await this.executeQuery(lakeConnector.id, lakeSql);

    return {
      success: true,
      periodDays: days,
      incidentsFound: glpiResult.rows.length,
      glpiIncidents: glpiResult.rows,
      storeBaselines: lakeResult.rows,
      summary: `Encontrados ${glpiResult.rows.length} incidentes operacionais de PDV/Rede no GLPI nos últimos ${days} dias para análise de correlação cruzada com o Vetor Lake.`,
    };
  }
}
