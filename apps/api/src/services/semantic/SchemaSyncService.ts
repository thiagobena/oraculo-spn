import mysql from 'mysql2/promise';
import pg from 'pg';
import { prisma } from '../../db/prisma.js';
import { DatabaseService } from '../DatabaseService.js';

export interface SyncResult {
  success: boolean;
  dataSourceId: string;
  dataSourceName: string;
  tablesSynced: number;
  tablesCreated: number;
  tablesUpdated: number;
  columnsSynced: number;
  relationshipsDetected: number;
  missingTablesCount: number;
  errors?: string[];
  executionTimeMs: number;
}

export interface IntrospectedCol {
  tableName: string;
  columnName: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  comment?: string | null;
  schemaName: string;
}

export interface IntrospectedFK {
  constraintName: string;
  sourceSchema: string;
  sourceTable: string;
  sourceColumn: string;
  targetSchema: string;
  targetTable: string;
  targetColumn: string;
}

export interface DriftTableItem {
  schemaName: string;
  tableName: string;
  comment?: string | null;
}

export interface DriftColumnItem {
  schemaName: string;
  tableName: string;
  columnName: string;
  dataType: string;
  existingDataType?: string;
}

export interface SchemaDriftResult {
  success: boolean;
  dataSourceId: string;
  dataSourceName: string;
  hasDrift: boolean;
  checkedAt: string;
  addedTables: DriftTableItem[];
  removedTables: DriftTableItem[];
  addedColumns: DriftColumnItem[];
  removedColumns: DriftColumnItem[];
  modifiedColumns: DriftColumnItem[];
  summary: {
    addedTablesCount: number;
    removedTablesCount: number;
    addedColumnsCount: number;
    removedColumnsCount: number;
    modifiedColumnsCount: number;
  };
}

export class SchemaSyncService {
  /**
   * Introspecção física do banco de dados (MySQL / MariaDB / PostgreSQL)
   */
  public static async introspectPhysical(connector: any): Promise<{
    tables: Array<{ schemaName: string; tableName: string; comment?: string | null }>;
    columns: IntrospectedCol[];
    fks: IntrospectedFK[];
  }> {
    const dbType = (connector.db_type || 'mysql').toLowerCase();
    let introspectedTables: Array<{ schemaName: string; tableName: string; comment?: string | null }> = [];
    let introspectedColumns: IntrospectedCol[] = [];
    let introspectedFKs: IntrospectedFK[] = [];

    if (dbType === 'mysql' || dbType === 'mariadb') {
      const connection = await mysql.createConnection({
        host: connector.host,
        port: connector.port || 3306,
        user: connector.username,
        password: connector.password || '',
        database: connector.database,
        connectTimeout: 10000,
        ssl: connector.use_ssl ? { rejectUnauthorized: false } : undefined,
      });

      try {
        const [tablesRows] = await connection.query<any[]>(
          `SELECT TABLE_SCHEMA as schemaName, TABLE_NAME as tableName, TABLE_COMMENT as comment
           FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = ?
           ORDER BY TABLE_NAME ASC`,
          [connector.database]
        );

        const [columnsRows] = await connection.query<any[]>(
          `SELECT TABLE_SCHEMA as schemaName, TABLE_NAME as tableName, COLUMN_NAME as columnName, 
                  DATA_TYPE as dataType, IS_NULLABLE as isNullable, COLUMN_KEY as columnKey, COLUMN_COMMENT as comment
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = ?
           ORDER BY TABLE_NAME, ORDINAL_POSITION ASC`,
          [connector.database]
        );

        const [fkRows] = await connection.query<any[]>(
          `SELECT CONSTRAINT_NAME as constraintName,
                  TABLE_SCHEMA as sourceSchema,
                  TABLE_NAME as sourceTable,
                  COLUMN_NAME as sourceColumn,
                  REFERENCED_TABLE_SCHEMA as targetSchema,
                  REFERENCED_TABLE_NAME as targetTable,
                  REFERENCED_COLUMN_NAME as targetColumn
           FROM information_schema.KEY_COLUMN_USAGE
           WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
          [connector.database]
        );

        introspectedTables = tablesRows.map((t) => ({
          schemaName: t.schemaName || 'public',
          tableName: t.tableName,
          comment: t.comment || null,
        }));

        introspectedColumns = columnsRows.map((c) => ({
          schemaName: c.schemaName || 'public',
          tableName: c.tableName,
          columnName: c.columnName,
          dataType: c.dataType,
          isNullable: c.isNullable === 'YES',
          isPrimaryKey: c.columnKey === 'PRI',
          comment: c.comment || null,
        }));

        introspectedFKs = fkRows.map((fk) => ({
          constraintName: fk.constraintName,
          sourceSchema: fk.sourceSchema || 'public',
          sourceTable: fk.sourceTable,
          sourceColumn: fk.sourceColumn,
          targetSchema: fk.targetSchema || 'public',
          targetTable: fk.targetTable,
          targetColumn: fk.targetColumn,
        }));
      } finally {
        await connection.end();
      }
    } else if (dbType === 'postgresql' || dbType === 'postgres' || dbType === 'pgsql') {
      const client = new pg.Client({
        host: connector.host || 'localhost',
        port: connector.port ? Number(connector.port) : 5432,
        user: connector.username || 'postgres',
        password: connector.password || '',
        database: connector.database || 'postgres',
        connectionTimeoutMillis: 10000,
        ssl: connector.use_ssl ? { rejectUnauthorized: false } : undefined,
      });

      await client.connect();
      try {
        const tablesRes = await client.query(
          `SELECT table_schema as "schemaName", table_name as "tableName"
           FROM information_schema.tables
           WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
             AND table_type IN ('BASE TABLE', 'VIEW')
           ORDER BY table_name ASC`
        );

        const columnsRes = await client.query(
          `SELECT c.table_schema as "schemaName", c.table_name as "tableName", c.column_name as "columnName",
                  c.data_type as "dataType", (c.is_nullable = 'YES') as "isNullable",
                  CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as "isPrimaryKey"
           FROM information_schema.columns c
           LEFT JOIN (
             SELECT kcu.table_schema, kcu.table_name, kcu.column_name
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema = kcu.table_schema
             WHERE tc.constraint_type = 'PRIMARY KEY'
           ) pk ON pk.table_schema = c.table_schema AND pk.table_name = c.table_name AND pk.column_name = c.column_name
           WHERE c.table_schema NOT IN ('information_schema', 'pg_catalog')
           ORDER BY c.table_name, c.ordinal_position ASC`
        );

        const fkRes = await client.query(
          `SELECT
             tc.constraint_name as "constraintName",
             tc.table_schema as "sourceSchema",
             tc.table_name as "sourceTable",
             kcu.column_name as "sourceColumn",
             ccu.table_schema AS "targetSchema",
             ccu.table_name AS "targetTable",
             ccu.column_name AS "targetColumn"
           FROM information_schema.table_constraints AS tc
           JOIN information_schema.key_column_usage AS kcu
             ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
           JOIN information_schema.constraint_column_usage AS ccu
             ON ccu.constraint_name = tc.constraint_name
             AND ccu.table_schema = tc.table_schema
           WHERE tc.constraint_type = 'FOREIGN KEY'
             AND tc.table_schema NOT IN ('information_schema', 'pg_catalog')`
        );

        introspectedTables = tablesRes.rows;
        introspectedColumns = columnsRes.rows;
        introspectedFKs = fkRes.rows;
      } finally {
        await client.end();
      }
    } else {
      throw new Error(`Tipo de fonte [${dbType}] ainda não suporta introspecção automática de schema.`);
    }

    return {
      tables: introspectedTables,
      columns: introspectedColumns,
      fks: introspectedFKs,
    };
  }

  /**
   * Detecta divergências proativamente (Schema Drift) sem alterar dados salvos.
   */
  static async detectSchemaDrift(dataSourceId: string): Promise<SchemaDriftResult> {
    const connector = await DatabaseService.getConnectorById(dataSourceId);
    if (!connector) {
      throw new Error(`Conector de dados [${dataSourceId}] não encontrado.`);
    }

    const { tables: physicalTables, columns: physicalColumns } = await this.introspectPhysical(connector);

    const catalogTables = await (prisma as any).semanticTable.findMany({
      where: { data_source_id: dataSourceId },
      include: { columns: true },
    });

    const physicalTableMap = new Map<string, { schemaName: string; tableName: string; comment?: string | null }>();
    for (const t of physicalTables) {
      physicalTableMap.set(`${t.schemaName}.${t.tableName}`.toLowerCase(), t);
    }

    const catalogTableMap = new Map<string, any>();
    for (const t of catalogTables) {
      catalogTableMap.set(`${t.schema_name}.${t.table_name}`.toLowerCase(), t);
    }

    const addedTables: DriftTableItem[] = [];
    const removedTables: DriftTableItem[] = [];
    const addedColumns: DriftColumnItem[] = [];
    const removedColumns: DriftColumnItem[] = [];
    const modifiedColumns: DriftColumnItem[] = [];

    // 1. Tabelas físicas ausentes ou marcadas como missing no catálogo
    for (const [key, physTable] of physicalTableMap.entries()) {
      const catTable = catalogTableMap.get(key);
      if (!catTable || catTable.status === 'missing') {
        addedTables.push({
          schemaName: physTable.schemaName,
          tableName: physTable.tableName,
          comment: physTable.comment,
        });
      }
    }

    // 2. Tabelas no catálogo que não existem mais no banco físico
    for (const [key, catTable] of catalogTableMap.entries()) {
      if (!physicalTableMap.has(key) && catTable.status !== 'missing') {
        removedTables.push({
          schemaName: catTable.schema_name,
          tableName: catTable.table_name,
        });
      }
    }

    // 3. Colunas adicionadas, removidas ou com tipo modificado
    const physicalColMap = new Map<string, IntrospectedCol>();
    for (const c of physicalColumns) {
      physicalColMap.set(`${c.schemaName}.${c.tableName}.${c.columnName}`.toLowerCase(), c);
    }

    const catalogColMap = new Map<string, { col: any; table: any }>();
    for (const t of catalogTables) {
      for (const c of t.columns) {
        catalogColMap.set(`${t.schema_name}.${t.table_name}.${c.column_name}`.toLowerCase(), {
          col: c,
          table: t,
        });
      }
    }

    // Colunas novas ou tipos divergentes
    for (const [key, physCol] of physicalColMap.entries()) {
      const catEntry = catalogColMap.get(key);
      if (!catEntry || catEntry.col.status === 'missing') {
        // Apenas reportar coluna nova se a tabela já existir no catálogo (se a tabela for nova, já entra em addedTables)
        const tableKey = `${physCol.schemaName}.${physCol.tableName}`.toLowerCase();
        if (catalogTableMap.has(tableKey)) {
          addedColumns.push({
            schemaName: physCol.schemaName,
            tableName: physCol.tableName,
            columnName: physCol.columnName,
            dataType: physCol.dataType,
          });
        }
      } else {
        const catCol = catEntry.col;
        if (catCol.data_type && physCol.dataType && catCol.data_type.toLowerCase() !== physCol.dataType.toLowerCase()) {
          modifiedColumns.push({
            schemaName: physCol.schemaName,
            tableName: physCol.tableName,
            columnName: physCol.columnName,
            dataType: physCol.dataType,
            existingDataType: catCol.data_type,
          });
        }
      }
    }

    // Colunas removidas no banco físico
    for (const [key, catEntry] of catalogColMap.entries()) {
      if (!physicalColMap.has(key) && catEntry.col.status !== 'missing') {
        const tableKey = `${catEntry.table.schema_name}.${catEntry.table.table_name}`.toLowerCase();
        if (physicalTableMap.has(tableKey)) {
          removedColumns.push({
            schemaName: catEntry.table.schema_name,
            tableName: catEntry.table.table_name,
            columnName: catEntry.col.column_name,
            dataType: catEntry.col.data_type,
          });
        }
      }
    }

    const hasDrift =
      addedTables.length > 0 ||
      removedTables.length > 0 ||
      addedColumns.length > 0 ||
      removedColumns.length > 0 ||
      modifiedColumns.length > 0;

    return {
      success: true,
      dataSourceId,
      dataSourceName: connector.name,
      hasDrift,
      checkedAt: new Date().toISOString(),
      addedTables,
      removedTables,
      addedColumns,
      removedColumns,
      modifiedColumns,
      summary: {
        addedTablesCount: addedTables.length,
        removedTablesCount: removedTables.length,
        addedColumnsCount: addedColumns.length,
        removedColumnsCount: removedColumns.length,
        modifiedColumnsCount: modifiedColumns.length,
      },
    };
  }

  /**
   * Sincroniza a estrutura técnica de um DataSource com a Camada Semântica.
   * Preserva todo o conhecimento empresarial (descrições, sinônimos, métricas e notas de negócio).
   */
  static async syncSchema(dataSourceId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const connector = await DatabaseService.getConnectorById(dataSourceId);
    if (!connector) {
      throw new Error(`Conector de dados [${dataSourceId}] não encontrado.`);
    }

    let tablesCreated = 0;
    let tablesUpdated = 0;
    let columnsSynced = 0;
    let relationshipsDetected = 0;

    const {
      tables: introspectedTables,
      columns: introspectedColumns,
      fks: introspectedFKs,
    } = await this.introspectPhysical(connector);

    // ==========================================
    // 3. PERSISTÊNCIA NA CAMADA SEMÂNTICA
    // ==========================================
    const currentTableKeys = new Set(
      introspectedTables.map((t) => `${t.schemaName}.${t.tableName}`)
    );

    // Mapeador para rápida resolução de colunas e PKs/FKs
    const tableIdMap = new Map<string, string>(); // "schema.table" -> SemanticTable.id
    const columnIdMap = new Map<string, string>(); // "schema.table.column" -> SemanticColumn.id

    // Upsert das Tabelas
    for (const t of introspectedTables) {
      const existing = await (prisma as any).semanticTable.findUnique({
        where: {
          data_source_id_schema_name_table_name: {
            data_source_id: dataSourceId,
            schema_name: t.schemaName,
            table_name: t.tableName,
          },
        },
      });

      let tableRecord;
      if (!existing) {
        tableRecord = await (prisma as any).semanticTable.create({
          data: {
            data_source_id: dataSourceId,
            schema_name: t.schemaName,
            table_name: t.tableName,
            display_name: t.tableName,
            technical_description: t.comment || null,
            status: 'active',
            ai_enabled: true,
          },
        });
        tablesCreated++;
      } else {
        tableRecord = await (prisma as any).semanticTable.update({
          where: { id: existing.id },
          data: {
            technical_description: t.comment || existing.technical_description,
            status: 'active',
          },
        });
        tablesUpdated++;
      }

      tableIdMap.set(`${t.schemaName}.${t.tableName}`, tableRecord.id);
    }

    // Upsert das Colunas
    for (const c of introspectedColumns) {
      const tableId = tableIdMap.get(`${c.schemaName}.${c.tableName}`);
      if (!tableId) continue;

      // Verificar se essa coluna é FK física
      const matchingFk = introspectedFKs.find(
        (fk) =>
          fk.sourceSchema === c.schemaName &&
          fk.sourceTable === c.tableName &&
          fk.sourceColumn === c.columnName
      );

      const existingCol = await (prisma as any).semanticColumn.findUnique({
        where: {
          semantic_table_id_column_name: {
            semantic_table_id: tableId,
            column_name: c.columnName,
          },
        },
      });

      // Inferência inicial de classificação semântica
      const lowerCol = c.columnName.toLowerCase();
      let inferredClassification = 'dimension';
      if (c.isPrimaryKey || lowerCol === 'id' || lowerCol.endsWith('_id') || lowerCol.startsWith('id_')) {
        inferredClassification = 'identifier';
      } else if (
        c.dataType.includes('date') ||
        c.dataType.includes('time') ||
        lowerCol.includes('data') ||
        lowerCol.includes('created')
      ) {
        inferredClassification = 'date';
      } else if (
        c.dataType.includes('int') ||
        c.dataType.includes('numeric') ||
        c.dataType.includes('decimal') ||
        c.dataType.includes('float') ||
        c.dataType.includes('double')
      ) {
        inferredClassification = 'measure';
      } else if (lowerCol.includes('status') || lowerCol.includes('tipo') || lowerCol.includes('state')) {
        inferredClassification = 'status';
      }

      let colRecord;
      if (!existingCol) {
        colRecord = await (prisma as any).semanticColumn.create({
          data: {
            semantic_table_id: tableId,
            column_name: c.columnName,
            display_name: c.columnName,
            data_type: c.dataType,
            is_nullable: c.isNullable,
            is_pk: c.isPrimaryKey,
            is_fk: !!matchingFk,
            fk_target_table: matchingFk ? matchingFk.targetTable : null,
            fk_target_column: matchingFk ? matchingFk.targetColumn : null,
            classification: inferredClassification,
            status: 'active',
            ai_enabled: true,
          },
        });
      } else {
        colRecord = await (prisma as any).semanticColumn.update({
          where: { id: existingCol.id },
          data: {
            data_type: c.dataType,
            is_nullable: c.isNullable,
            is_pk: c.isPrimaryKey,
            is_fk: !!matchingFk,
            fk_target_table: matchingFk ? matchingFk.targetTable : existingCol.fk_target_table,
            fk_target_column: matchingFk ? matchingFk.targetColumn : existingCol.fk_target_column,
            status: 'active',
          },
        });
      }

      columnsSynced++;
      columnIdMap.set(`${c.schemaName}.${c.tableName}.${c.columnName}`, colRecord.id);
    }

    // ==========================================
    // 4. PERSISTÊNCIA DAS FOREIGN KEYS FÍSICAS COMO RELACIONAMENTOS
    // ==========================================
    for (const fk of introspectedFKs) {
      const sourceTableId = tableIdMap.get(`${fk.sourceSchema}.${fk.sourceTable}`);
      const sourceColId = columnIdMap.get(`${fk.sourceSchema}.${fk.sourceTable}.${fk.sourceColumn}`);
      const targetTableId = tableIdMap.get(`${fk.targetSchema}.${fk.targetTable}`);
      const targetColId = columnIdMap.get(`${fk.targetSchema}.${fk.targetTable}.${fk.targetColumn}`);

      if (sourceTableId && sourceColId && targetTableId && targetColId) {
        // Verificar se relacionamento já existe
        const existingRel = await (prisma as any).semanticRelationship.findFirst({
          where: {
            data_source_id: dataSourceId,
            source_table_id: sourceTableId,
            source_column_id: sourceColId,
            target_table_id: targetTableId,
            target_column_id: targetColId,
          },
        });

        const joinExpr = `${fk.sourceTable}.${fk.sourceColumn} = ${fk.targetTable}.${fk.targetColumn}`;

        if (!existingRel) {
          await (prisma as any).semanticRelationship.create({
            data: {
              data_source_id: dataSourceId,
              source_table_id: sourceTableId,
              source_column_id: sourceColId,
              target_table_id: targetTableId,
              target_column_id: targetColId,
              cardinality: 'N:1',
              rel_type: 'physical_fk',
              join_type: 'INNER',
              join_expression: joinExpr,
              business_description: `Chave estrangeira física: ${fk.constraintName}`,
              confidence: 'automatic',
              status: 'validated',
              priority: 'high',
            },
          });
          relationshipsDetected++;
        }
      }
    }

    // ==========================================
    // 5. DETECÇÃO DE TABELAS/COLUNAS REMOVIDAS (MARCAR COMO 'missing')
    // ==========================================
    const allDbTables = await (prisma as any).semanticTable.findMany({
      where: { data_source_id: dataSourceId },
    });

    let missingTablesCount = 0;
    for (const table of allDbTables) {
      const key = `${table.schema_name}.${table.table_name}`;
      if (!currentTableKeys.has(key) && table.status !== 'missing') {
        await (prisma as any).semanticTable.update({
          where: { id: table.id },
          data: { status: 'missing' },
        });
        missingTablesCount++;
      }
    }

    const executionTimeMs = Date.now() - startTime;

    return {
      success: true,
      dataSourceId,
      dataSourceName: connector.name,
      tablesSynced: introspectedTables.length,
      tablesCreated,
      tablesUpdated,
      columnsSynced,
      relationshipsDetected,
      missingTablesCount,
      executionTimeMs,
    };
  }
}
