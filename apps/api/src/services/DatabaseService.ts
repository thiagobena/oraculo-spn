import mysql from 'mysql2/promise';
import { prisma } from '../db/prisma.js';

export interface DatabaseTestParams {
  db_type: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  use_ssl?: boolean;
}

export class DatabaseService {
  /**
   * Testar a conexão com o banco de dados especificado (ex: GLPI MySQL/MariaDB)
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

    try {
      if (dbType === 'mysql' || dbType === 'mariadb') {
        const connection = await mysql.createConnection({
          host: params.host,
          port: params.port || 3306,
          user: params.username,
          password: params.password || '',
          database: params.database,
          connectTimeout: 5000,
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
      } else {
        return {
          success: false,
          error: `Tipo de banco de dados '${params.db_type}' ainda não possui driver de teste configurado. Suportado no momento: MySQL e MariaDB (GLPI).`,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erro ao conectar ao banco de dados',
      };
    }
  }

  /**
   * Listar todas as conexões cadastradas com a senha mascarada por segurança
   */
  static async listConnectors() {
    const connectors = await (prisma as any).databaseConnector.findMany({
      orderBy: { created_at: 'desc' },
    });

    return connectors.map((c: any) => ({
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
    });
  }

  /**
   * Criar uma nova conexão de banco de dados
   */
  static async createConnector(data: {
    name: string;
    db_type: string;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    use_ssl?: boolean;
    is_active?: boolean;
    description?: string;
  }) {
    return await (prisma as any).databaseConnector.create({
      data: {
        name: data.name,
        db_type: data.db_type || 'mysql',
        host: data.host,
        port: Number(data.port) || 3306,
        database: data.database,
        username: data.username,
        password: data.password || '',
        use_ssl: Boolean(data.use_ssl),
        is_active: data.is_active !== false,
        description: data.description || null,
      },
    });
  }

  /**
   * Atualizar dados de uma conexão de banco existente
   */
  static async updateConnector(
    id: string,
    data: {
      name?: string;
      db_type?: string;
      host?: string;
      port?: number;
      database?: string;
      username?: string;
      password?: string;
      use_ssl?: boolean;
      is_active?: boolean;
      description?: string;
    }
  ) {
    const existing = await (prisma as any).databaseConnector.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Conector de banco de dados não encontrado');
    }

    const updatePayload: any = { ...data };
    if (data.port) updatePayload.port = Number(data.port);
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
   * Remover uma conexão de banco
   */
  static async deleteConnector(id: string) {
    return await (prisma as any).databaseConnector.delete({
      where: { id },
    });
  }

  /**
   * Executar uma consulta SQL de leitura (SELECT) com segurança em um banco cadastrado
   */
  static async executeQuery(connectorId: string, sqlQuery: string) {
    const connector = await (prisma as any).databaseConnector.findUnique({
      where: { id: connectorId },
    });

    if (!connector || !connector.is_active) {
      throw new Error('Conector de banco de dados não encontrado ou inativo.');
    }

    const cleanedSql = sqlQuery.trim();
    if (!/^select/i.test(cleanedSql)) {
      throw new Error('Por segurança, apenas instruções de leitura (SELECT) são permitidas.');
    }

    const dbType = (connector.db_type || 'mysql').toLowerCase();

    if (dbType === 'mysql' || dbType === 'mariadb') {
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

      // Garantir limite de segurança
      let finalSql = cleanedSql;
      if (!/\blimit\b/i.test(finalSql)) {
        finalSql += ' LIMIT 100';
      }

      const [rows, fields] = await connection.query<any[]>(finalSql);
      await connection.end();

      const columns = fields ? fields.map((f: any) => f.name) : [];
      return {
        success: true,
        connectorName: connector.name,
        rows,
        columns,
        totalRows: rows.length,
      };
    } else {
      throw new Error(`O tipo de banco '${connector.db_type}' ainda não possui driver de execução configurado.`);
    }
  }
}

