export interface ValidationResult {
  isValid: boolean;
  sanitizedSql: string;
  violations: string[];
  warnings: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  estimatedMaxRows: number;
}

export class SQLValidator {
  private static FORBIDDEN_KEYWORDS = [
    /\b(insert\s+into)\b/i,
    /\b(update\s+[a-z0-9_.]+)\b/i,
    /\b(delete\s+from)\b/i,
    /\b(drop\s+table|drop\s+database|drop\s+view|drop\s+schema)\b/i,
    /\b(alter\s+table|alter\s+database)\b/i,
    /\b(truncate\s+table|truncate)\b/i,
    /\b(create\s+table|create\s+database|create\s+view)\b/i,
    /\b(grant\s+|revoke\s+)\b/i,
    /\b(exec\s+|execute\s+|sp_executesql)\b/i,
    /\b(information_schema\.user_privileges)\b/i,
    /\b(into\s+outfile|into\s+dumpfile)\b/i,
    /\b(xp_cmdshell)\b/i,
  ];

  /**
   * Valida com rigor se a consulta SQL gerada é estritamente segura para leitura
   */
  static validate(sql: string, maxRowsAllowed: number = 1000): ValidationResult {
    const violations: string[] = [];
    const warnings: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    let trimmed = sql.trim();

    // 1. Deve iniciar estritamente com SELECT ou WITH (Common Table Expression)
    if (!/^(select|with)\b/i.test(trimmed)) {
      violations.push('A consulta deve iniciar estritamente com SELECT ou WITH.');
      riskLevel = 'critical';
    }

    // 2. Proibir comandos destrutivos ou de mutação
    for (const pattern of this.FORBIDDEN_KEYWORDS) {
      const match = trimmed.match(pattern);
      if (match) {
        violations.push(`Comando destrutivo ou proibido detectado: ${match[0].toUpperCase()}`);
        riskLevel = 'critical';
      }
    }

    // 3. Proibir consultas encadeadas com múltiplos comandos (SQL Injection multi-statement)
    // Remove strings literais entre aspas antes de buscar ponto-e-vírgula intermediário
    const sqlWithoutLiterals = trimmed.replace(/'(?:''|[^'])*'/g, "''");
    const semicolonMatches = sqlWithoutLiterals.match(/;/g);
    if (semicolonMatches && semicolonMatches.length > 1) {
      violations.push('Múltiplas instruções encadeadas com ponto e vírgula não são permitidas.');
      riskLevel = 'critical';
    }

    // 4. Prevenção contra produto cartesiano não autorizado (CROSS JOIN explícito ou FROM t1, t2)
    if (/\bcross\s+join\b/i.test(trimmed)) {
      violations.push('CROSS JOIN não autorizado detectado.');
      riskLevel = 'high';
    } else if (/\bfrom\s+[a-z0-9_.]+\s*,\s*[a-z0-9_.]+/i.test(trimmed)) {
      violations.push('Produto cartesiano implícito (múltiplas tabelas separadas por vírgula no FROM) não é permitido. Utilize JOIN explícito.');
      riskLevel = 'high';
    }

    // 5. Garantir limite de linhas seguro (LIMIT ou TOP)
    let sanitizedSql = trimmed.replace(/;+\s*$/, '').trim();
    const hasLimit = /\blimit\s+\d+/i.test(sanitizedSql);
    const hasTop = /\bselect\s+top\s+\d+/i.test(sanitizedSql);
    const isAggregate = /\b(count\(|sum\(|avg\(|min\(|max\(|group\s+by)\b/i.test(sanitizedSql);

    let estimatedMaxRows = maxRowsAllowed;

    if (!hasLimit && !hasTop) {
      if (!isAggregate) {
        // Injeta LIMIT seguro
        sanitizedSql += ` LIMIT ${maxRowsAllowed}`;
        warnings.push(`LIMIT automático de ${maxRowsAllowed} linhas injetado para proteção de memória.`);
      } else {
        // Agregações podem ter LIMIT para agrupamentos volumosos
        sanitizedSql += ` LIMIT ${maxRowsAllowed}`;
      }
    } else if (hasLimit) {
      const match = sanitizedSql.match(/\blimit\s+(\d+)/i);
      if (match) {
        const reqLimit = parseInt(match[1], 10);
        if (reqLimit > maxRowsAllowed) {
          sanitizedSql = sanitizedSql.replace(/\blimit\s+\d+/i, `LIMIT ${maxRowsAllowed}`);
          warnings.push(`Limite reduzido de ${reqLimit} para o teto de segurança de ${maxRowsAllowed} linhas.`);
        }
        estimatedMaxRows = Math.min(reqLimit, maxRowsAllowed);
      }
    }

    return {
      isValid: violations.length === 0,
      sanitizedSql,
      violations,
      warnings,
      riskLevel: violations.length > 0 ? 'critical' : riskLevel,
      estimatedMaxRows,
    };
  }
}
