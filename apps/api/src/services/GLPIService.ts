import { DatabaseService } from './DatabaseService.js';
import { GLPIApiClient } from './GLPIApiClient.js';

export interface GLPIQueryDefinition {
  queryType: string;
  description: string;
  richSql: string;
  fallbackSql: string;
}

// Cache em memória de curto prazo (30s) para as estatísticas globais e contadores do GLPI
const macroStatsCache = new Map<string, { timestamp: number; data: any }>();
const MACRO_CACHE_TTL_MS = 30000;

export class GLPIService {
  /**
   * Sanitiza strings para uso seguro em cláusulas LIKE
   */
  private static sanitizeForLike(str: string): string {
    return str.replace(/['"\\%_;]/g, '').trim();
  }

  /**
   * Constrói a instrução SQL otimizada com base na intenção da pergunta do usuário.
   * Sistema de decisão em camadas:
   * 1. Busca por ID específico de chamado (#123)
   * 2. Filtro Dinâmico por Nome de Técnico Específico
   * 3. Filtro Dinâmico por Categoria / Assunto Específico
   * 4. Recortes Temporais Específicos (Hoje, Ontem, Esta Semana, Este Mês, Mês Passado, Este Ano)
   * 5. Recortes por Tipo ITIL (Incidentes vs Requisições)
   * 6. Recortes por Status Unitário (Novos, Em Atendimento, Pendentes, Solucionados, Fechados)
   * 7. Métricas e KPIs Operacionais (SLA, Críticos, MTTR, Técnicos, Categorias, Custos, etc.)
   * 8. Panorama Geral e Base Completa
   */
  static selectGLPIQuery(userText: string): GLPIQueryDefinition {
    const textLower = userText.toLowerCase().trim();

    // 1. Busca Direta por ID de Chamado (ex: "chamado 123", "ticket #456", "ver chamado 789")
    const idMatch = textLower.match(/(?:chamado|ticket|id)\s*#?\s*(\d{1,9})/i);
    if (idMatch && idMatch[1]) {
      const ticketId = parseInt(idMatch[1], 10);
      return {
        queryType: 'detalhe_chamado',
        description: `Detalhes e Histórico Completo do Chamado #${ticketId}`,
        richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.content AS descricao_inicial,
  t.date AS data_abertura, 
  t.solvedate AS data_solucao,
  t.closedate AS data_fechamento,
  t.time_to_resolve AS prazo_sla,
  CASE t.status 
    WHEN 1 THEN 'Novo' 
    WHEN 2 THEN 'Em atendimento (Atribuído)' 
    WHEN 3 THEN 'Em atendimento (Planejado)' 
    WHEN 4 THEN 'Pendente' 
    WHEN 5 THEN 'Solucionado' 
    WHEN 6 THEN 'Fechado' 
    ELSE 'Outro' 
  END AS status_nome,
  CASE t.priority 
    WHEN 1 THEN 'Muito Baixa' WHEN 2 THEN 'Baixa' WHEN 3 THEN 'Média' WHEN 4 THEN 'Alta' WHEN 5 THEN 'Muito Alta' WHEN 6 THEN 'Maior' ELSE 'Normal' 
  END AS prioridade,
  CASE t.type WHEN 1 THEN 'Incidente' WHEN 2 THEN 'Requisição' ELSE 'Geral' END AS tipo,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_req.firstname, ''), ' ', COALESCE(u_req.realname, '')), ' '), u_req.name, 'Não identificado') AS requerente,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_req ON (t.id = tu_req.tickets_id AND tu_req.type = 1)
LEFT JOIN glpi_users u_req ON tu_req.users_id = u_req.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.id = ${ticketId} AND t.is_deleted = 0;`,
        fallbackSql: `SELECT id, name AS titulo, date AS data_abertura, status, content AS descricao FROM glpi_tickets WHERE id = ${ticketId} AND is_deleted = 0;`,
      };
    }

    // 2. Filtro Dinâmico por Técnico Específico (ex: "chamados do técnico Lucas", "atribuídos ao Thiago", "atendido por Carlos")
    const techRegex = /(?:t[ée]cnico|atribu[íi]dos?\s+a[o]?|atendid[oa]s?\s+por|respons[áa]vel)\s+([a-zA-ZÀ-ÿ]{3,25})/i;
    const techMatch = textLower.match(techRegex);
    if (techMatch && techMatch[1] && !['geral', 'todos', 'hoje', 'ontem', 'aberto', 'fechado', 'novo', 'pendente'].includes(techMatch[1].toLowerCase())) {
      const techName = this.sanitizeForLike(techMatch[1]);
      return {
        queryType: 'filtro_tecnico_especifico',
        description: `Chamados atribuídos ao Técnico "${techName}"`,
        richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  t.solvedate AS data_solucao,
  CASE t.status 
    WHEN 1 THEN 'Novo' 
    WHEN 2 THEN 'Em atendimento (Atribuído)' 
    WHEN 3 THEN 'Em atendimento (Planejado)' 
    WHEN 4 THEN 'Pendente' 
    WHEN 5 THEN 'Solucionado' 
    WHEN 6 THEN 'Fechado' 
    ELSE 'Outro' 
  END AS status_nome,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
INNER JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
INNER JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE (u_tech.firstname LIKE '%${techName}%' OR u_tech.realname LIKE '%${techName}%' OR u_tech.name LIKE '%${techName}%')
  AND t.is_deleted = 0
ORDER BY t.date DESC
LIMIT 500;`,
        fallbackSql: `SELECT t.id, t.name AS titulo, t.date, t.status FROM glpi_tickets t 
INNER JOIN glpi_tickets_users tu ON (t.id = tu.tickets_id AND tu.type = 2) 
INNER JOIN glpi_users u ON tu.users_id = u.id 
WHERE (u.firstname LIKE '%${techName}%' OR u.realname LIKE '%${techName}%' OR u.name LIKE '%${techName}%') AND t.is_deleted = 0 
ORDER BY t.date DESC LIMIT 500;`,
      };
    }

    // 3. Filtro Dinâmico por Categoria ou Assunto Específico (ex: "chamados de impressora", "categoria financeiro", "chamados de rede", "vpn", "sap", "email")
    const catKeywords = ['impressora', 'rede', 'internet', 'wifi', 'wi-fi', 'email', 'e-mail', 'vpn', 'sap', 'erp', 'financeiro', 'rh', 'hardware', 'software', 'acesso', 'senha', 'bloqueio', 'servidor', 'backup'];
    const foundKeyword = catKeywords.find((k) => textLower.includes(k));
    const catExplicitMatch = textLower.match(/categoria\s+([a-zA-ZÀ-ÿ0-9]{3,25})/i);
    const targetCategory = catExplicitMatch ? this.sanitizeForLike(catExplicitMatch[1]) : foundKeyword;

    if (targetCategory && !textLower.includes('categorias') && !textLower.includes('todas as categorias')) {
      return {
        queryType: 'filtro_categoria_especifica',
        description: `Chamados vinculados à Categoria/Assunto "${targetCategory}"`,
        richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  CASE t.status 
    WHEN 1 THEN 'Novo' 
    WHEN 2 THEN 'Em atendimento (Atribuído)' 
    WHEN 3 THEN 'Em atendimento (Planejado)' 
    WHEN 4 THEN 'Pendente' 
    WHEN 5 THEN 'Solucionado' 
    WHEN 6 THEN 'Fechado' 
    ELSE 'Outro' 
  END AS status_nome,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE (c.name LIKE '%${targetCategory}%' OR c.completename LIKE '%${targetCategory}%' OR t.name LIKE '%${targetCategory}%')
  AND t.is_deleted = 0
ORDER BY t.date DESC
LIMIT 500;`,
        fallbackSql: `SELECT id, name AS titulo, date, status FROM glpi_tickets WHERE (name LIKE '%${targetCategory}%' OR content LIKE '%${targetCategory}%') AND is_deleted = 0 ORDER BY date DESC LIMIT 500;`,
      };
    }

    // 4. Chamados Abertos Hoje (Alta Prioridade Temporal)
    if (
      textLower.includes('hoje') ||
      textLower.includes('entrantes hoje') ||
      textLower.includes('abertos hoje') ||
      textLower.includes('do dia')
    ) {
      return {
        queryType: 'hoje',
        description: 'Chamados abertos na data de hoje',
        richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  CASE t.status 
    WHEN 1 THEN 'Novo' 
    WHEN 2 THEN 'Em atendimento (Atribuído)' 
    WHEN 3 THEN 'Em atendimento (Planejado)' 
    WHEN 4 THEN 'Pendente' 
    WHEN 5 THEN 'Solucionado' 
    WHEN 6 THEN 'Fechado' 
    ELSE 'Outro' 
  END AS status_nome,
  CASE t.priority 
    WHEN 1 THEN 'Muito Baixa' 
    WHEN 2 THEN 'Baixa' 
    WHEN 3 THEN 'Média' 
    WHEN 4 THEN 'Alta' 
    WHEN 5 THEN 'Muito Alta' 
    WHEN 6 THEN 'Maior' 
    ELSE 'Normal' 
  END AS prioridade,
  CASE t.type WHEN 1 THEN 'Incidente' WHEN 2 THEN 'Requisição' ELSE 'Geral' END AS tipo,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_req.firstname, ''), ' ', COALESCE(u_req.realname, '')), ' '), u_req.name, 'Não identificado') AS requerente,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_req ON (t.id = tu_req.tickets_id AND tu_req.type = 1)
LEFT JOIN glpi_users u_req ON tu_req.users_id = u_req.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE (DATE(t.date) = CURDATE() OR DATE(t.date) = CURRENT_DATE()) AND t.is_deleted = 0
ORDER BY t.date DESC
LIMIT 500;`,
        fallbackSql: `SELECT id, name AS titulo, date AS data_abertura, 
CASE status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento (Atribuído)' WHEN 3 THEN 'Em atendimento (Planejado)' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Outro' END AS status_nome,
CASE priority WHEN 1 THEN 'Muito Baixa' WHEN 2 THEN 'Baixa' WHEN 3 THEN 'Média' WHEN 4 THEN 'Alta' WHEN 5 THEN 'Muito Alta' WHEN 6 THEN 'Maior' ELSE 'Normal' END AS prioridade
FROM glpi_tickets WHERE DATE(date) = CURDATE() AND is_deleted = 0 ORDER BY date DESC LIMIT 500;`,
      };
    }

    // 5. Chamados Abertos Ontem
    if (textLower.includes('ontem') || textLower.includes('abertos ontem')) {
      return {
        queryType: 'ontem',
        description: 'Chamados abertos na data de ontem',
        richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  CASE t.status 
    WHEN 1 THEN 'Novo' 
    WHEN 2 THEN 'Em atendimento (Atribuído)' 
    WHEN 3 THEN 'Em atendimento (Planejado)' 
    WHEN 4 THEN 'Pendente' 
    WHEN 5 THEN 'Solucionado' 
    WHEN 6 THEN 'Fechado' 
    ELSE 'Outro' 
  END AS status_nome,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE DATE(t.date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND t.is_deleted = 0
ORDER BY t.date DESC
LIMIT 500;`,
        fallbackSql: `SELECT id, name AS titulo, date AS data_abertura, status FROM glpi_tickets WHERE DATE(date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND is_deleted = 0 ORDER BY date DESC LIMIT 500;`,
      };
    }

    // 6. Chamados Desta Semana / Últimos 7 Dias
    if (
      textLower.includes('esta semana') ||
      textLower.includes('desta semana') ||
      textLower.includes('últimos 7 dias') ||
      textLower.includes('ultimos 7 dias')
    ) {
      return {
        queryType: 'esta_semana',
        description: 'Chamados abertos nos últimos 7 dias (Esta Semana)',
        richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  CASE t.status 
    WHEN 1 THEN 'Novo' 
    WHEN 2 THEN 'Em atendimento (Atribuído)' 
    WHEN 3 THEN 'Em atendimento (Planejado)' 
    WHEN 4 THEN 'Pendente' 
    WHEN 5 THEN 'Solucionado' 
    WHEN 6 THEN 'Fechado' 
    ELSE 'Outro' 
  END AS status_nome,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND t.is_deleted = 0
ORDER BY t.date DESC
LIMIT 500;`,
        fallbackSql: `SELECT id, name AS titulo, date, status FROM glpi_tickets WHERE date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND is_deleted = 0 ORDER BY date DESC LIMIT 500;`,
      };
    }

    // 7. Chamados do Mês Passado
    if (textLower.includes('mês passado') || textLower.includes('mes passado') || textLower.includes('último mês') || textLower.includes('ultimo mes')) {
      return {
        queryType: 'mes_passado',
        description: 'Chamados registrados no mês anterior',
        richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  CASE t.status 
    WHEN 1 THEN 'Novo' 
    WHEN 2 THEN 'Em atendimento (Atribuído)' 
    WHEN 3 THEN 'Em atendimento (Planejado)' 
    WHEN 4 THEN 'Pendente' 
    WHEN 5 THEN 'Solucionado' 
    WHEN 6 THEN 'Fechado' 
    ELSE 'Outro' 
  END AS status_nome,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE MONTH(t.date) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) 
  AND YEAR(t.date) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) 
  AND t.is_deleted = 0
ORDER BY t.date DESC
LIMIT 500;`,
        fallbackSql: `SELECT id, name AS titulo, date FROM glpi_tickets WHERE MONTH(date) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND is_deleted = 0 ORDER BY date DESC LIMIT 500;`,
      };
    }

    // 8. Chamados Deste Mês / Mês Atual / Últimos 30 Dias
    if (
      textLower.includes('este mês') ||
      textLower.includes('este mes') ||
      textLower.includes('deste mês') ||
      textLower.includes('deste mes') ||
      textLower.includes('no mês') ||
      textLower.includes('no mes') ||
      textLower.includes('mês atual') ||
      textLower.includes('mes atual') ||
      textLower.includes('últimos 30 dias') ||
      textLower.includes('ultimos 30 dias')
    ) {
      return {
        queryType: 'mes_atual',
        description: 'Chamados registrados no mês atual',
        richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  CASE t.status 
    WHEN 1 THEN 'Novo' 
    WHEN 2 THEN 'Em atendimento (Atribuído)' 
    WHEN 3 THEN 'Em atendimento (Planejado)' 
    WHEN 4 THEN 'Pendente' 
    WHEN 5 THEN 'Solucionado' 
    WHEN 6 THEN 'Fechado' 
    ELSE 'Outro' 
  END AS status_nome,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE MONTH(t.date) = MONTH(CURDATE()) AND YEAR(t.date) = YEAR(CURDATE()) AND t.is_deleted = 0
ORDER BY t.date DESC
LIMIT 500;`,
        fallbackSql: `SELECT id, name AS titulo, date FROM glpi_tickets WHERE MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE()) AND is_deleted = 0 ORDER BY date DESC LIMIT 500;`,
      };
    }

    // 9. Chamados Deste Ano / Ano Atual
    if (textLower.includes('este ano') || textLower.includes('deste ano') || textLower.includes('no ano') || textLower.includes('ano atual')) {
      return {
        queryType: 'ano_atual',
        description: 'Chamados registrados no ano atual',
        richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  CASE t.status 
    WHEN 1 THEN 'Novo' 
    WHEN 2 THEN 'Em atendimento (Atribuído)' 
    WHEN 3 THEN 'Em atendimento (Planejado)' 
    WHEN 4 THEN 'Pendente' 
    WHEN 5 THEN 'Solucionado' 
    WHEN 6 THEN 'Fechado' 
    ELSE 'Outro' 
  END AS status_nome,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE YEAR(t.date) = YEAR(CURDATE()) AND t.is_deleted = 0
ORDER BY t.date DESC
LIMIT 500;`,
        fallbackSql: `SELECT id, name AS titulo, date FROM glpi_tickets WHERE YEAR(date) = YEAR(CURDATE()) AND is_deleted = 0 ORDER BY date DESC LIMIT 500;`,
      };
    }

    // 10. Incidentes (Tipo 1)
    if (textLower.includes('incidente') || textLower.includes('incidentes')) {
      return {
        queryType: 'incidentes',
        description: 'Chamados do Tipo Incidente',
        richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  CASE t.status 
    WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento (Atribuído)' WHEN 3 THEN 'Em atendimento (Planejado)' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Outro' 
  END AS status_nome,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.type = 1 AND t.is_deleted = 0
ORDER BY t.id DESC
LIMIT 500;`,
        fallbackSql: `SELECT id, name AS titulo, date, status FROM glpi_tickets WHERE type = 1 AND is_deleted = 0 ORDER BY id DESC LIMIT 500;`,
      };
    }

    // 11. Requisições de Serviço (Tipo 2)
    if (textLower.includes('requisição') || textLower.includes('requisicao') || textLower.includes('requisições') || textLower.includes('requisicoes')) {
      return {
        queryType: 'requisicoes',
        description: 'Chamados do Tipo Requisição de Serviço',
        richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  CASE t.status 
    WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento (Atribuído)' WHEN 3 THEN 'Em atendimento (Planejado)' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Outro' 
  END AS status_nome,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.type = 2 AND t.is_deleted = 0
ORDER BY t.id DESC
LIMIT 500;`,
        fallbackSql: `SELECT id, name AS titulo, date, status FROM glpi_tickets WHERE type = 2 AND is_deleted = 0 ORDER BY id DESC LIMIT 500;`,
      };
    }

    // 12. Evolução Mensal / Histórico por Mês
    if (
      textLower.includes('por mês') ||
      textLower.includes('por mes') ||
      textLower.includes('mensal') ||
      textLower.includes('evolução') ||
      textLower.includes('evolucao') ||
      textLower.includes('histórico mensal') ||
      textLower.includes('historico mensal') ||
      textLower.includes('tendência')
    ) {
      return {
        queryType: 'evolucao_mensal',
        description: 'Evolução Histórica Mensal de Aberturas e Fechamentos em Toda a Base',
        richSql: `SELECT 
  DATE_FORMAT(t.date, '%Y-%m') AS mes_ano,
  COUNT(t.id) AS total_abertos,
  SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS total_concluidos,
  SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS ainda_em_aberto,
  SUM(CASE WHEN t.type = 1 THEN 1 ELSE 0 END) AS incidentes,
  SUM(CASE WHEN t.type = 2 THEN 1 ELSE 0 END) AS requisicoes,
  ROUND(AVG(TIMESTAMPDIFF(HOUR, t.date, t.solvedate)), 1) AS mttr_medio_horas
FROM glpi_tickets t
WHERE t.is_deleted = 0
GROUP BY DATE_FORMAT(t.date, '%Y-%m')
ORDER BY mes_ano DESC;`,
        fallbackSql: `SELECT DATE_FORMAT(date, '%Y-%m') AS mes_ano, COUNT(*) AS total FROM glpi_tickets WHERE is_deleted = 0 GROUP BY mes_ano ORDER BY mes_ano DESC;`,
      };
    }

    // 13. Horas Trabalhadas por Técnico (Apontamentos de Horas / Tasks)
    if (
      textLower.includes('horas') ||
      textLower.includes('tempo trabalhado') ||
      textLower.includes('apontamento') ||
      textLower.includes('esforço') ||
      textLower.includes('esforco')
    ) {
      return {
        queryType: 'horas_tecnico',
        description: 'Total de Horas Trabalhadas por Técnico em Tarefas (Base Completa)',
        richSql: `SELECT 
  COALESCE(NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '), u.name, 'Técnico Não Definido') AS tecnico,
  COUNT(tk.id) AS total_tarefas,
  ROUND(SUM(tk.actiontime) / 3600.0, 2) AS total_horas_trabalhadas
FROM glpi_tickettasks tk
INNER JOIN glpi_users u ON tk.users_id = u.id
GROUP BY tecnico
ORDER BY total_horas_trabalhadas DESC;`,
        fallbackSql: `SELECT users_id, SUM(actiontime)/3600 AS total_horas FROM glpi_tickettasks GROUP BY users_id ORDER BY total_horas DESC;`,
      };
    }

    // 14. SLA / Atrasos
    if (
      textLower.includes('sla') ||
      textLower.includes('atraso') ||
      textLower.includes('atrasado') ||
      textLower.includes('estourado') ||
      textLower.includes('prazo')
    ) {
      return {
        queryType: 'sla_atraso',
        description: 'Chamados Em Aberto com Prazo/SLA Vencido',
        richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  t.time_to_resolve AS data_limite_sla,
  TIMESTAMPDIFF(HOUR, t.time_to_resolve, NOW()) AS horas_em_atraso,
  CASE t.status 
    WHEN 1 THEN 'Novo' 
    WHEN 2 THEN 'Em atendimento (Atribuído)' 
    WHEN 3 THEN 'Em atendimento (Planejado)' 
    WHEN 4 THEN 'Pendente' 
    ELSE 'Em aberto' 
  END AS status_nome,
  CASE t.priority 
    WHEN 1 THEN 'Muito Baixa' WHEN 2 THEN 'Baixa' WHEN 3 THEN 'Média' WHEN 4 THEN 'Alta' WHEN 5 THEN 'Muito Alta' WHEN 6 THEN 'Maior' ELSE 'Normal' 
  END AS prioridade,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.time_to_resolve IS NOT NULL 
  AND t.time_to_resolve < NOW() 
  AND t.status IN (1, 2, 3, 4) 
  AND t.is_deleted = 0
ORDER BY t.time_to_resolve ASC
LIMIT 500;`,
        fallbackSql: `SELECT id, name AS titulo, date AS data_abertura, time_to_resolve AS data_limite_sla, status 
FROM glpi_tickets WHERE time_to_resolve IS NOT NULL AND time_to_resolve < NOW() AND status IN (1, 2, 3, 4) AND is_deleted = 0 ORDER BY time_to_resolve ASC LIMIT 500;`,
      };
    }

    // 15. Chamados Críticos / Urgentes / Alta Prioridade
    if (
      textLower.includes('crítico') ||
      textLower.includes('critico') ||
      textLower.includes('urgente') ||
      textLower.includes('alta prioridade') ||
      textLower.includes('prioridade alta')
    ) {
      return {
        queryType: 'criticos',
        description: 'Chamados de Alta Prioridade / Urgentes em Aberto',
        richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  CASE t.status 
    WHEN 1 THEN 'Novo' 
    WHEN 2 THEN 'Em atendimento (Atribuído)' 
    WHEN 3 THEN 'Em atendimento (Planejado)' 
    WHEN 4 THEN 'Pendente' 
    WHEN 5 THEN 'Solucionado' 
    WHEN 6 THEN 'Fechado' 
    ELSE 'Outro' 
  END AS status_nome,
  CASE t.priority 
    WHEN 1 THEN 'Muito Baixa' 
    WHEN 2 THEN 'Baixa' 
    WHEN 3 THEN 'Média' 
    WHEN 4 THEN 'Alta' 
    WHEN 5 THEN 'Muito Alta' 
    WHEN 6 THEN 'Maior' 
    ELSE 'Normal' 
  END AS prioridade,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.priority >= 4 AND t.status IN (1, 2, 3, 4) AND t.is_deleted = 0
ORDER BY t.priority DESC, t.date DESC
LIMIT 500;`,
        fallbackSql: `SELECT id, name AS titulo, date AS data_abertura, status FROM glpi_tickets WHERE priority >= 4 AND status IN (1, 2, 3, 4) AND is_deleted = 0 ORDER BY priority DESC, date DESC LIMIT 500;`,
      };
    }

    // 16. Matriz de Reincidência & Gestão de Problemas (ITIL)
    if (
      textLower.includes('reincidência') ||
      textLower.includes('reincidencia') ||
      textLower.includes('reincidente') ||
      textLower.includes('reincidentes') ||
      textLower.includes('problemas repetitivos') ||
      textLower.includes('chamados repetidos') ||
      textLower.includes('reaberto') ||
      textLower.includes('reabertos')
    ) {
      return {
        queryType: 'reincidencia_problemas',
        description: 'Matriz de Reincidência e Problemas Repetitivos por Categoria e Assunto',
        richSql: `SELECT 
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
        fallbackSql: `SELECT itilcategories_id, COUNT(*) AS total FROM glpi_tickets WHERE is_deleted = 0 GROUP BY itilcategories_id HAVING COUNT(*) >= 2 ORDER BY total DESC LIMIT 50;`,
      };
    }

    // 16.1 Balanceamento de Carga, Aging & Fila dos Técnicos
    if (
      textLower.includes('aging') ||
      textLower.includes('balanceamento') ||
      textLower.includes('distribuição de carga') ||
      textLower.includes('distribuicao de carga') ||
      textLower.includes('carga de trabalho') ||
      textLower.includes('carga da equipe') ||
      textLower.includes('parados há mais') ||
      textLower.includes('parados ha mais') ||
      textLower.includes('chamados antigos') ||
      textLower.includes('tempo de fila')
    ) {
      return {
        queryType: 'aging_tecnicos_balanceamento',
        description: 'Aging e Balanceamento de Carga da Fila de Técnicos (Chamados Parados)',
        richSql: `SELECT 
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
        fallbackSql: `SELECT tu.users_id, COUNT(*) AS total_abertos FROM glpi_tickets t LEFT JOIN glpi_tickets_users tu ON (t.id = tu.tickets_id AND tu.type = 2) WHERE t.status IN (1,2,3,4) AND t.is_deleted = 0 GROUP BY tu.users_id ORDER BY total_abertos DESC;`,
      };
    }

    // 16.2 Mapa de Calor & Picos de Abertura (Horários / Dimensionamento de Demanda)
    if (
      textLower.includes('mapa de calor') ||
      textLower.includes('pico de abertura') ||
      textLower.includes('picos de abertura') ||
      textLower.includes('pico de chamados') ||
      textLower.includes('picos de chamados') ||
      textLower.includes('horário de pico') ||
      textLower.includes('horarios de pico') ||
      textLower.includes('horário de maior') ||
      textLower.includes('dimensionamento') ||
      textLower.includes('faixa horária') ||
      textLower.includes('faixa horaria') ||
      textLower.includes('por turno')
    ) {
      return {
        queryType: 'mapa_calor_horarios',
        description: 'Densidade e Picos de Abertura por Dia da Semana e Faixa Horária (Últimos 90 Dias)',
        richSql: `SELECT 
  CASE DAYOFWEEK(t.date)
    WHEN 1 THEN 'Domingo'
    WHEN 2 THEN 'Segunda-feira'
    WHEN 3 THEN 'Terça-feira'
    WHEN 4 THEN 'Quarta-feira'
    WHEN 5 THEN 'Quinta-feira'
    WHEN 6 THEN 'Sexta-feira'
    WHEN 7 THEN 'Sábado'
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
        fallbackSql: `SELECT DAYOFWEEK(date) AS dia, HOUR(date) AS hora, COUNT(*) AS total FROM glpi_tickets WHERE is_deleted = 0 GROUP BY DAYOFWEEK(date), HOUR(date) ORDER BY total DESC LIMIT 50;`,
      };
    }

    // 16.3 Auditoria de Prioridade & Análise de Urgência Real / Oculta
    if (
      textLower.includes('urgência real') ||
      textLower.includes('urgencia real') ||
      textLower.includes('urgência oculta') ||
      textLower.includes('urgencia oculta') ||
      textLower.includes('auditoria de prioridade') ||
      textLower.includes('prioridade incorreta') ||
      textLower.includes('subclassificado') ||
      textLower.includes('subclassificados') ||
      textLower.includes('falso positivo') ||
      textLower.includes('impacto de negócio')
    ) {
      return {
        queryType: 'auditoria_urgencia_prioridade',
        description: 'Auditoria de Chamados com Prioridade Baixa/Média mas com Termos Críticos de Negócio na Descrição',
        richSql: `SELECT 
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
        fallbackSql: `SELECT id, name AS titulo, priority, status FROM glpi_tickets WHERE status IN (1,2,3,4) AND priority <= 3 AND (name LIKE '%parado%' OR name LIKE '%urgente%') AND is_deleted = 0 LIMIT 100;`,
      };
    }

    // 17. Tempo Médio de Resolução (MTTR - Mean Time to Resolve)
    if (
      textLower.includes('mttr') ||
      textLower.includes('tempo médio') ||
      textLower.includes('tempo medio') ||
      textLower.includes('média de atendimento') ||
      textLower.includes('media de atendimento')
    ) {
      return {
        queryType: 'mttr_categoria',
        description: 'Tempo Médio de Resolução (MTTR em Horas) por Categoria (Toda a Base)',
        richSql: `SELECT 
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COUNT(t.id) AS chamados_solucionados,
  ROUND(AVG(TIMESTAMPDIFF(HOUR, t.date, t.solvedate)), 1) AS mttr_medio_horas
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
WHERE t.status IN (5, 6) AND t.solvedate IS NOT NULL AND t.is_deleted = 0
GROUP BY COALESCE(c.completename, c.name, 'Sem Categoria')
ORDER BY mttr_medio_horas DESC;`,
        fallbackSql: `SELECT itilcategories_id, COUNT(*) AS solucionados, AVG(TIMESTAMPDIFF(HOUR, date, solvedate)) AS mttr_horas FROM glpi_tickets WHERE status IN (5,6) GROUP BY itilcategories_id;`,
      };
    }

    // 18. Origem / Canais de Abertura dos Chamados
    if (
      textLower.includes('origem') ||
      textLower.includes('canal') ||
      textLower.includes('canais') ||
      textLower.includes('email') ||
      textLower.includes('portal')
    ) {
      return {
        queryType: 'origem_chamados',
        description: 'Resumo por Origem / Canal de Entrada de Chamados (Toda a Base)',
        richSql: `SELECT 
  COALESCE(req.name, 'Não informado') AS canal_origem,
  COUNT(t.id) AS total_chamados,
  SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS em_aberto,
  SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS solucionados
FROM glpi_tickets t
LEFT JOIN glpi_requesttypes req ON t.requesttypes_id = req.id
WHERE t.is_deleted = 0
GROUP BY COALESCE(req.name, 'Não informado')
ORDER BY total_chamados DESC;`,
        fallbackSql: `SELECT requesttypes_id AS canal_id, COUNT(*) AS total FROM glpi_tickets WHERE is_deleted = 0 GROUP BY requesttypes_id;`,
      };
    }

    // 19. Pesquisa de Satisfação (CSAT)
    if (
      textLower.includes('satisfação') ||
      textLower.includes('satisfacao') ||
      textLower.includes('csat') ||
      textLower.includes('avaliação') ||
      textLower.includes('avaliac') ||
      textLower.includes('nota')
    ) {
      return {
        queryType: 'csat_satisfaction',
        description: 'Pesquisas de Satisfação de Atendimento (CSAT)',
        richSql: `SELECT 
  t.id AS ticket_id,
  t.name AS titulo_chamado,
  s.satisfaction AS nota_satisfacao_1_a_5,
  s.comment AS comentario_usuario,
  s.date_mod AS data_avaliacao,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Técnico Não Definido') AS tecnico_avaliado
FROM glpi_ticketsatisfactions s
INNER JOIN glpi_tickets t ON s.tickets_id = t.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.is_deleted = 0
ORDER BY s.id DESC
LIMIT 500;`,
        fallbackSql: `SELECT tickets_id AS ticket_id, satisfaction AS nota_1_a_5, comment AS comentario FROM glpi_ticketsatisfactions ORDER BY id DESC LIMIT 500;`,
      };
    }

    // 20. Agrupamento por Técnico Atribuído
    if (textLower.includes('técnico') || textLower.includes('tecnico') || textLower.includes('responsável') || textLower.includes('atribuído')) {
      return {
        queryType: 'resumo_tecnico',
        description: 'Resumo de chamados agrupados por Técnico Responsável (Toda a Base)',
        richSql: `SELECT 
  COALESCE(NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '), u.name, 'Sem Técnico Atribuído') AS tecnico,
  COUNT(*) AS total_chamados,
  SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS em_aberto,
  SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS solucionados
FROM glpi_tickets t
INNER JOIN glpi_tickets_users tu ON (t.id = tu.tickets_id AND tu.type = 2)
INNER JOIN glpi_users u ON tu.users_id = u.id
WHERE t.is_deleted = 0
GROUP BY tecnico
ORDER BY total_chamados DESC;`,
        fallbackSql: `SELECT status, COUNT(*) AS total_chamados FROM glpi_tickets WHERE is_deleted = 0 GROUP BY status ORDER BY status;`,
      };
    }

    // 21. Agrupamento por Categoria
    if (textLower.includes('categoria') || textLower.includes('categorias')) {
      return {
        queryType: 'resumo_categoria',
        description: 'Resumo de chamados agrupados por Categoria ITIL (Toda a Base)',
        richSql: `SELECT 
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COUNT(*) AS total_chamados,
  SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS em_aberto,
  SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS solucionados
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
WHERE t.is_deleted = 0
GROUP BY COALESCE(c.completename, c.name, 'Sem Categoria')
ORDER BY total_chamados DESC;`,
        fallbackSql: `SELECT itilcategories_id AS id_categoria, COUNT(*) AS total_chamados 
FROM glpi_tickets WHERE is_deleted = 0 GROUP BY itilcategories_id ORDER BY total_chamados DESC;`,
      };
    }

    // 22. Top Usuários Requerentes
    if (
      textLower.includes('top usuários') ||
      textLower.includes('top usuarios') ||
      textLower.includes('quem mais abre') ||
      textLower.includes('solicitante') ||
      textLower.includes('requerente')
    ) {
      return {
        queryType: 'top_requerentes',
        description: 'Usuários Requerentes e Volume de Chamados (Toda a Base)',
        richSql: `SELECT 
  COALESCE(NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '), u.name, 'Usuário Não Identificado') AS usuario_requerente,
  COUNT(t.id) AS total_chamados_abertos,
  SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS chamados_em_aberto,
  SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS chamados_solucionados
FROM glpi_tickets t
INNER JOIN glpi_tickets_users tu ON (t.id = tu.tickets_id AND tu.type = 1)
INNER JOIN glpi_users u ON tu.users_id = u.id
WHERE t.is_deleted = 0
GROUP BY usuario_requerente
ORDER BY total_chamados_abertos DESC;`,
        fallbackSql: `SELECT users_id, COUNT(*) AS total FROM glpi_tickets_users WHERE type=1 GROUP BY users_id ORDER BY total DESC;`,
      };
    }

    // 23. Chamados por Grupo / Equipe Técnica
    if (
      textLower.includes('grupo') ||
      textLower.includes('grupos') ||
      textLower.includes('equipe') ||
      textLower.includes('setor')
    ) {
      return {
        queryType: 'resumo_grupo',
        description: 'Resumo de chamados agrupados por Grupo / Equipe Técnica (Toda a Base)',
        richSql: `SELECT 
  COALESCE(g.name, 'Sem Grupo Atribuído') AS grupo_tecnico,
  COUNT(t.id) AS total_chamados,
  SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS em_aberto,
  SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS solucionados
FROM glpi_tickets t
INNER JOIN glpi_groups_tickets gt ON (t.id = gt.tickets_id AND gt.type = 2)
INNER JOIN glpi_groups g ON gt.groups_id = g.id
WHERE t.is_deleted = 0
GROUP BY grupo_tecnico
ORDER BY total_chamados DESC;`,
        fallbackSql: `SELECT status, COUNT(*) AS total FROM glpi_tickets WHERE is_deleted = 0 GROUP BY status;`,
      };
    }

    // 24. Chamados por Localização / Unidade Física
    if (
      textLower.includes('local') ||
      textLower.includes('localização') ||
      textLower.includes('localizacao') ||
      textLower.includes('prédio') ||
      textLower.includes('predio') ||
      textLower.includes('unidade')
    ) {
      return {
        queryType: 'resumo_localizacao',
        description: 'Resumo de chamados agrupados por Localização Física (Toda a Base)',
        richSql: `SELECT 
  COALESCE(l.completename, l.name, 'Sem Localização') AS localizacao,
  COUNT(t.id) AS total_chamados,
  SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS em_aberto,
  SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS solucionados
FROM glpi_tickets t
LEFT JOIN glpi_locations l ON t.locations_id = l.id
WHERE t.is_deleted = 0
GROUP BY COALESCE(l.completename, l.name, 'Sem Localização')
ORDER BY total_chamados DESC;`,
        fallbackSql: `SELECT locations_id AS id_local, COUNT(*) AS total FROM glpi_tickets WHERE is_deleted = 0 GROUP BY locations_id;`,
      };
    }

    // 25. Chamados por Equipamentos / Ativos Afetados (ITAM)
    if (
      textLower.includes('equipamento') ||
      textLower.includes('ativo') ||
      textLower.includes('computador') ||
      textLower.includes('hardware') ||
      textLower.includes('maquina') ||
      textLower.includes('máquina')
    ) {
      return {
        queryType: 'ativos_equipamentos',
        description: 'Chamados vinculados a Equipamentos e Ativos Corporativos',
        richSql: `SELECT 
  t.id AS ticket_id,
  t.name AS titulo_chamado,
  it.itemtype AS tipo_ativo,
  it.items_id AS id_ativo,
  CASE t.status 
    WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento (Atribuído)' WHEN 3 THEN 'Em atendimento (Planejado)' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Outro' 
  END AS status_nome,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria
FROM glpi_tickets t
INNER JOIN glpi_items_tickets it ON t.id = it.tickets_id
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
WHERE t.is_deleted = 0
ORDER BY t.id DESC
LIMIT 500;`,
        fallbackSql: `SELECT id, name AS titulo, date FROM glpi_tickets WHERE is_deleted = 0 ORDER BY id DESC LIMIT 500;`,
      };
    }

    // 26. Gestão de Problemas ITIL (Problem Management)
    if (textLower.includes('problema') || textLower.includes('problemas') || textLower.includes('causa raiz')) {
      return {
        queryType: 'gestao_problemas',
        description: 'Problemas Cadastrados e Incidentes Vinculados (Causa Raiz)',
        richSql: `SELECT 
  p.id AS problem_id,
  p.name AS titulo_problema,
  p.date AS data_registro,
  CASE p.status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Outro' END AS status_problema,
  COUNT(pt.tickets_id) AS total_incidentes_vinculados
FROM glpi_problems p
LEFT JOIN glpi_problems_tickets pt ON p.id = pt.problems_id
WHERE p.is_deleted = 0
GROUP BY p.id, p.name, p.date, p.status
ORDER BY total_incidentes_vinculados DESC, p.id DESC;`,
        fallbackSql: `SELECT id, name AS titulo_problema, status FROM glpi_problems WHERE is_deleted = 0 ORDER BY id DESC;`,
      };
    }

    // 27. Gestão de Mudanças ITIL (Change Management / GMUD)
    if (
      textLower.includes('mudança') ||
      textLower.includes('mudanca') ||
      textLower.includes('mudanças') ||
      textLower.includes('gmud') ||
      textLower.includes('manutenção') ||
      textLower.includes('manutencao')
    ) {
      return {
        queryType: 'gestao_mudancas',
        description: 'Solicitações de Mudança e Janelas de Manutenção (GMUD)',
        richSql: `SELECT 
  c.id AS change_id,
  c.name AS titulo_mudanca,
  c.date AS data_criacao,
  CASE c.status WHEN 1 THEN 'Nova' WHEN 2 THEN 'Em avaliação' WHEN 3 THEN 'Aprovada' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Aplicada' WHEN 6 THEN 'Fechada' ELSE 'Outro' END AS status_mudanca,
  COALESCE(cat.completename, cat.name, 'Geral') AS categoria
FROM glpi_changes c
LEFT JOIN glpi_itilcategories cat ON c.itilcategories_id = cat.id
WHERE c.is_deleted = 0
ORDER BY c.id DESC;`,
        fallbackSql: `SELECT id, name AS titulo_mudanca, status FROM glpi_changes WHERE is_deleted = 0 ORDER BY id DESC;`,
      };
    }

    // 28. Garantias de Computadores / Hardware Expirando
    if (
      textLower.includes('garantia') ||
      textLower.includes('vencimento de hardware') ||
      textLower.includes('patrimônio') ||
      textLower.includes('patrimonio') ||
      textLower.includes('vida útil')
    ) {
      return {
        queryType: 'garantia_hardware',
        description: 'Computadores e Servidores com Garantia de Fábrica Expirando',
        richSql: `SELECT 
  cmp.id AS computer_id,
  cmp.name AS nome_computador,
  cmp.serial AS numero_serie,
  cmp.otherserial AS patrimonio,
  info.buy_date AS data_compra,
  info.warranty_date AS data_fim_garantia,
  TIMESTAMPDIFF(MONTH, NOW(), info.warranty_date) AS meses_para_expirar
FROM glpi_computers cmp
INNER JOIN glpi_infocoms info ON (cmp.id = info.items_id AND info.itemtype = 'Computer')
WHERE cmp.is_deleted = 0 AND info.warranty_date IS NOT NULL
ORDER BY info.warranty_date ASC
LIMIT 500;`,
        fallbackSql: `SELECT id, name, serial FROM glpi_computers WHERE is_deleted = 0 LIMIT 500;`,
      };
    }

    // 29. Chamados Solucionados / Fechados
    if (
      textLower.includes('solucionado') ||
      textLower.includes('fechado') ||
      textLower.includes('resolvido') ||
      textLower.includes('concluído') ||
      textLower.includes('concluido')
    ) {
      return {
        queryType: 'solucionados',
        description: 'Chamados Solucionados / Fechados',
        richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  t.solvedate AS data_solucao,
  CASE t.status WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Finalizado' END AS status_nome,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.status IN (5, 6) AND t.is_deleted = 0
ORDER BY COALESCE(t.solvedate, t.closedate, t.date) DESC
LIMIT 500;`,
        fallbackSql: `SELECT id, name AS titulo, date AS data_abertura, solvedate AS data_solucao FROM glpi_tickets WHERE status IN (5, 6) AND is_deleted = 0 ORDER BY COALESCE(solvedate, closedate, date) DESC LIMIT 500;`,
      };
    }

    // 30. Chamados Pendentes / Em Aberto
    if (
      textLower.includes('pendente') ||
      textLower.includes('aberto') ||
      textLower.includes('andamento') ||
      textLower.includes('não resolvido') ||
      textLower.includes('nao resolvido') ||
      textLower.includes('em atendimento')
    ) {
      return {
        queryType: 'pendentes',
        description: 'Chamados em Aberto / Pendentes de Solução',
        richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  CASE t.status 
    WHEN 1 THEN 'Novo' 
    WHEN 2 THEN 'Em atendimento (Atribuído)' 
    WHEN 3 THEN 'Em atendimento (Planejado)' 
    WHEN 4 THEN 'Pendente' 
    WHEN 5 THEN 'Solucionado' 
    WHEN 6 THEN 'Fechado' 
    ELSE 'Outro' 
  END AS status_nome,
  CASE t.priority 
    WHEN 1 THEN 'Muito Baixa' 
    WHEN 2 THEN 'Baixa' 
    WHEN 3 THEN 'Média' 
    WHEN 4 THEN 'Alta' 
    WHEN 5 THEN 'Muito Alta' 
    WHEN 6 THEN 'Maior' 
    ELSE 'Normal' 
  END AS prioridade,
  CASE t.type WHEN 1 THEN 'Incidente' WHEN 2 THEN 'Requisição' ELSE 'Geral' END AS tipo,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_req.firstname, ''), ' ', COALESCE(u_req.realname, '')), ' '), u_req.name, 'Não identificado') AS requerente,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_req ON (t.id = tu_req.tickets_id AND tu_req.type = 1)
LEFT JOIN glpi_users u_req ON tu_req.users_id = u_req.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.status IN (1, 2, 3, 4) AND t.is_deleted = 0
ORDER BY t.priority DESC, t.id DESC
LIMIT 500;`,
        fallbackSql: `SELECT id, name AS titulo, date AS data_abertura, status FROM glpi_tickets WHERE status IN (1, 2, 3, 4) AND is_deleted = 0 ORDER BY id DESC LIMIT 500;`,
      };
    }

    // 31. Base Completa / Estatísticas Globais / Volumetria Histórica / Panorama Total
    if (
      textLower.includes('toda a base') ||
      textLower.includes('base completa') ||
      textLower.includes('todos os chamados') ||
      textLower.includes('visão completa') ||
      textLower.includes('visao completa') ||
      textLower.includes('estatística') ||
      textLower.includes('estatistica') ||
      textLower.includes('volumetria') ||
      textLower.includes('panorama') ||
      textLower.includes('total de chamados') ||
      textLower.includes('quantos chamados') ||
      textLower.includes('relatório geral') ||
      textLower.includes('relatorio geral') ||
      textLower.includes('analise completa') ||
      textLower.includes('análise completa') ||
      textLower.includes('base de dados')
    ) {
      return {
        queryType: 'base_completa_kpis',
        description: 'Panorama Completo e Indicadores Globais de 100% da Base do GLPI',
        richSql: `SELECT 
  COUNT(*) AS total_historico_chamados,
  SUM(CASE WHEN t.status = 1 THEN 1 ELSE 0 END) AS novos,
  SUM(CASE WHEN t.status = 2 THEN 1 ELSE 0 END) AS em_atendimento_atribuido,
  SUM(CASE WHEN t.status = 3 THEN 1 ELSE 0 END) AS em_atendimento_planejado,
  SUM(CASE WHEN t.status = 4 THEN 1 ELSE 0 END) AS pendentes,
  SUM(CASE WHEN t.status = 5 THEN 1 ELSE 0 END) AS solucionados,
  SUM(CASE WHEN t.status = 6 THEN 1 ELSE 0 END) AS fechados,
  SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS total_em_aberto,
  SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS total_concluidos,
  SUM(CASE WHEN t.type = 1 THEN 1 ELSE 0 END) AS total_incidentes,
  SUM(CASE WHEN t.type = 2 THEN 1 ELSE 0 END) AS total_requisicoes,
  MIN(t.date) AS data_primeiro_chamado_registrado,
  MAX(t.date) AS data_ultimo_chamado_registrado,
  ROUND(AVG(TIMESTAMPDIFF(HOUR, t.date, t.solvedate)), 1) AS mttr_global_medio_horas
FROM glpi_tickets t
WHERE t.is_deleted = 0;`,
        fallbackSql: `SELECT 
  COUNT(*) AS total_chamados,
  SUM(CASE WHEN status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS total_em_aberto,
  SUM(CASE WHEN status IN (5, 6) THEN 1 ELSE 0 END) AS total_fechados_solucionados,
  MIN(date) AS primeiro_chamado,
  MAX(date) AS ultimo_chamado
FROM glpi_tickets WHERE is_deleted = 0;`,
      };
    }

    // 32. Padrão / Geral: Listar chamados com contexto completo e amplo limite
    return {
      queryType: 'geral',
      description: 'Chamados cadastrados no GLPI',
      richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  CASE t.status 
    WHEN 1 THEN 'Novo' 
    WHEN 2 THEN 'Em atendimento (Atribuído)' 
    WHEN 3 THEN 'Em atendimento (Planejado)' 
    WHEN 4 THEN 'Pendente' 
    WHEN 5 THEN 'Solucionado' 
    WHEN 6 THEN 'Fechado' 
    ELSE 'Outro' 
  END AS status_nome,
  CASE t.priority 
    WHEN 1 THEN 'Muito Baixa' 
    WHEN 2 THEN 'Baixa' 
    WHEN 3 THEN 'Média' 
    WHEN 4 THEN 'Alta' 
    WHEN 5 THEN 'Muito Alta' 
    WHEN 6 THEN 'Maior' 
    ELSE 'Normal' 
  END AS prioridade,
  CASE t.type WHEN 1 THEN 'Incidente' WHEN 2 THEN 'Requisição' ELSE 'Geral' END AS tipo,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_req.firstname, ''), ' ', COALESCE(u_req.realname, '')), ' '), u_req.name, 'Não identificado') AS requerente,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_req ON (t.id = tu_req.tickets_id AND tu_req.type = 1)
LEFT JOIN glpi_users u_req ON tu_req.users_id = u_req.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.is_deleted = 0
ORDER BY t.id DESC
LIMIT 500;`,
      fallbackSql: `SELECT id, name AS titulo, date AS data_abertura, 
CASE status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento (Atribuído)' WHEN 3 THEN 'Em atendimento (Planejado)' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Outro' END AS status_nome,
CASE priority WHEN 1 THEN 'Muito Baixa' WHEN 2 THEN 'Baixa' WHEN 3 THEN 'Média' WHEN 4 THEN 'Alta' WHEN 5 THEN 'Muito Alta' WHEN 6 THEN 'Maior' ELSE 'Normal' END AS prioridade
FROM glpi_tickets WHERE is_deleted = 0 ORDER BY id DESC LIMIT 500;`,
    };
  }

  /**
   * Executa a consulta ao GLPI no conector configurado com:
   * - Suporte a Cache de 30s para MacroStats
   * - Alertas proativos de SLA e gargalos
   * - Modo Híbrido: Fallback dinâmico para IA NL2SQL em perguntas ad-hoc complexas
   */
  static async fetchGLPIDataContext(connectorId: string, userText: string, connectorName: string, contextHistory?: string): Promise<string> {
    // 0. Ações Diretas / Write-Back no GLPI (Follow-up, Solução, Prioridade, Atribuição)
    const actionIntent = GLPIApiClient.parseActionIntent(userText, contextHistory);
    if (actionIntent.isAction && actionIntent.ticketId) {
      let actionExecResult: any = null;
      if (actionIntent.actionType === 'add_followup' && actionIntent.content) {
        actionExecResult = await GLPIApiClient.addFollowup(actionIntent.ticketId, actionIntent.content, false, connectorId);
      } else if (actionIntent.actionType === 'solve_ticket' && actionIntent.content) {
        actionExecResult = await GLPIApiClient.solveTicket(actionIntent.ticketId, actionIntent.content, 1, connectorId);
      } else if (actionIntent.actionType === 'update_priority' && actionIntent.priorityValue) {
        actionExecResult = await GLPIApiClient.updateTicket(actionIntent.ticketId, { priority: actionIntent.priorityValue }, connectorId);
      } else if (actionIntent.actionType === 'assign_tech' && actionIntent.techNameOrId) {
        const techIdNum = parseInt(actionIntent.techNameOrId, 10);
        if (!isNaN(techIdNum)) {
          actionExecResult = await GLPIApiClient.assignTechnician(actionIntent.ticketId, techIdNum, connectorId);
        } else {
          try {
            const sanitizedTech = this.sanitizeForLike(actionIntent.techNameOrId);
            const techRows = await DatabaseService.executeQuery(
              connectorId,
              `SELECT id, name, firstname, realname FROM glpi_users WHERE (firstname LIKE '%${sanitizedTech}%' OR realname LIKE '%${sanitizedTech}%' OR name LIKE '%${sanitizedTech}%') LIMIT 1;`
            );
            if (techRows && techRows.rows && techRows.rows.length > 0) {
              const foundUserId = techRows.rows[0].id;
              actionExecResult = await GLPIApiClient.assignTechnician(actionIntent.ticketId, foundUserId, connectorId);
            } else {
              actionExecResult = {
                success: false,
                action: 'assign_technician',
                ticketId: actionIntent.ticketId,
                message: `Não foi possível localizar o técnico "${actionIntent.techNameOrId}" no cadastro de usuários do GLPI.`,
              };
            }
          } catch (e: any) {
            actionExecResult = {
              success: false,
              action: 'assign_technician',
              ticketId: actionIntent.ticketId,
              message: `Erro ao buscar técnico: ${e.message}`,
            };
          }
        }
      }

      if (actionExecResult) {
        return `\n\n[EXECUÇÃO DE AÇÃO DIRETA NO GLPI REST API]:
Resultado da Ação: ${actionExecResult.success ? '✅ SUCESSO' : '❌ AVISO / ATENÇÃO'}
Ação Solicitada: ${actionIntent.actionType} no Chamado #${actionIntent.ticketId}
Mensagem do Sistema: ${actionExecResult.message}
${actionExecResult.data ? `Dados de Retorno: ${JSON.stringify(actionExecResult.data)}` : ''}

INSTRUÇÃO PARA A IA:
1. Responda ao usuário informando o resultado da operação no GLPI com clareza e profissionalismo.
2. Se a operação foi concluída com sucesso, confirme exatamente o que foi executado no chamado #${actionIntent.ticketId}.
3. Se a API REST do GLPI não estiver configurada (ex: ausência de App-Token ou URL da API REST), explique como o administrador pode configurar as credenciais da API REST no Conector do GLPI ou nas variáveis de ambiente.`;
      }
    }

    const queryDef = this.selectGLPIQuery(userText);
    let queryRes: any = null;
    let macroStats: any = null;
    let customExplanation: string | null = null;

    // 1. Obter Estatísticas Globais com Cache de 30s
    try {
      const cached = macroStatsCache.get(connectorId);
      if (cached && Date.now() - cached.timestamp < MACRO_CACHE_TTL_MS) {
        macroStats = cached.data;
      } else {
        const macroSql = `SELECT 
  COUNT(*) AS total_geral_chamados_base,
  SUM(CASE WHEN (DATE(date) = CURDATE() OR DATE(date) = CURRENT_DATE()) THEN 1 ELSE 0 END) AS total_abertos_hoje,
  SUM(CASE WHEN DATE(date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS total_abertos_ontem,
  SUM(CASE WHEN date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS total_abertos_esta_semana,
  SUM(CASE WHEN MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE()) THEN 1 ELSE 0 END) AS total_abertos_este_mes,
  SUM(CASE WHEN MONTH(date) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND YEAR(date) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) THEN 1 ELSE 0 END) AS total_abertos_mes_passado,
  SUM(CASE WHEN YEAR(date) = YEAR(CURDATE()) THEN 1 ELSE 0 END) AS total_abertos_este_ano,
  SUM(CASE WHEN status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS total_em_aberto_geral,
  SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS total_novos,
  SUM(CASE WHEN status IN (2, 3) THEN 1 ELSE 0 END) AS total_em_atendimento,
  SUM(CASE WHEN status = 4 THEN 1 ELSE 0 END) AS total_pendentes,
  SUM(CASE WHEN status IN (5, 6) THEN 1 ELSE 0 END) AS total_concluidos_fechados,
  SUM(CASE WHEN type = 1 THEN 1 ELSE 0 END) AS total_incidentes_base,
  SUM(CASE WHEN type = 2 THEN 1 ELSE 0 END) AS total_requisicoes_base,
  SUM(CASE WHEN time_to_resolve IS NOT NULL AND time_to_resolve < NOW() AND status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS total_sla_vencido,
  MIN(date) AS data_primeiro_chamado_base,
  MAX(date) AS data_ultimo_chamado_base
FROM glpi_tickets 
WHERE is_deleted = 0;`;
        const macroRes = await DatabaseService.executeQuery(connectorId, macroSql);
        if (macroRes && macroRes.success && macroRes.rows && macroRes.rows.length > 0) {
          macroStats = macroRes.rows[0];
          macroStatsCache.set(connectorId, {
            timestamp: Date.now(),
            data: macroStats,
          });
        }
      }
    } catch (macroErr: any) {
      console.warn(`[GLPIService] Falha ao coletar métricas globais do GLPI:`, macroErr.message);
    }

    // 2. Modo Híbrido: Se a consulta caiu em 'geral' mas a pergunta possui complexidade analítica ad-hoc, tentar NL2SQL


    if (queryDef.queryType === 'geral' && userText.length > 15) {
      try {
        const nlRes = await DatabaseService.generateNL2SQL(connectorId, userText);
        if (nlRes.success && nlRes.generated_query) {
          const dynamicRes = await DatabaseService.executeQuery(connectorId, nlRes.generated_query);
          if (dynamicRes && dynamicRes.success && dynamicRes.rows && dynamicRes.rows.length > 0) {
            queryRes = dynamicRes;
            customExplanation = nlRes.explanation;
          }
        }
      } catch (_) {}
    }

    // 3. Execução da consulta padrão/específica se o NL2SQL não foi utilizado 
    // controle de dados de acesos e dominio das informações de controle de fluxo de dados
    // validar informações de acesso a dsados 
    if (!queryRes) {
      try {
        queryRes = await DatabaseService.executeQuery(connectorId, queryDef.richSql);
      } catch (err: any) {
        console.warn(`[GLPIService] Consulta rica falhou para '${connectorName}'. Executando fallback... Erro:`, err.message);
        try {
          queryRes = await DatabaseService.executeQuery(connectorId, queryDef.fallbackSql);
        } catch (fallbackErr: any) {
          throw new Error(`Falha ao executar consulta no banco GLPI: ${fallbackErr.message}`);
        }
      }
    }

    if (queryRes && queryRes.success && queryRes.rows) {
      const horaAtualSP = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      
      let macroContextBlock = '';
      if (macroStats) {
        const slaAlert = (macroStats.total_sla_vencido ?? 0) > 0 
          ? `⚠️ ALERTA OPERACIONAL: Existem ${macroStats.total_sla_vencido} chamado(s) com SLA VENCIDO na fila aguardando resolução!`
          : `✅ SLA: Nenhum chamado com SLA vencido no momento.`;
        const novosAlert = (macroStats.total_novos ?? 0) > 0
          ? `📌 TRIAGEM: Há ${macroStats.total_novos} chamado(s) NOVO(S) aguardando atribuição inicial.`
          : '';

        macroContextBlock = `\n[PANORAMA E CONTADORES EM TEMPO REAL DE TODA A BASE GLPI (${connectorName.toUpperCase()})]:
- Total de Chamados Abertos HOJE: ${macroStats.total_abertos_hoje ?? 0}
- Total de Chamados Abertos ONTEM: ${macroStats.total_abertos_ontem ?? 0}
- Total de Chamados Abertos ESTA SEMANA (Últimos 7 dias): ${macroStats.total_abertos_esta_semana ?? 0}
- Total de Chamados Abertos ESTE MÊS: ${macroStats.total_abertos_este_mes ?? 0}
- Total de Chamados Abertos MÊS PASSADO: ${macroStats.total_abertos_mes_passado ?? 0}
- Total de Chamados Abertos ESTE ANO: ${macroStats.total_abertos_este_ano ?? 0}
- Total Geral Histórico no Banco: ${macroStats.total_geral_chamados_base ?? 0} (Incidentes: ${macroStats.total_incidentes_base ?? 0}, Requisições: ${macroStats.total_requisicoes_base ?? 0})
- Total de Chamados Atualmente Em Aberto (Fila Ativa): ${macroStats.total_em_aberto_geral ?? 0} (Novos: ${macroStats.total_novos ?? 0}, Em Atendimento: ${macroStats.total_em_atendimento ?? 0}, Pendentes: ${macroStats.total_pendentes ?? 0})
- Total de Chamados com SLA Vencido / Atrasados: ${macroStats.total_sla_vencido ?? 0}
- Total de Chamados Concluídos/Fechados: ${macroStats.total_concluidos_fechados ?? 0}
- Período Histórico Coberto na Base: de ${macroStats.data_primeiro_chamado_base} até ${macroStats.data_ultimo_chamado_base}

[INSIGHTS E ALERTAS PROATIVOS DE GESTÃO]:
- ${slaAlert}
${novosAlert ? `- ${novosAlert}` : ''}
`;
      }

      const descr = customExplanation ? `Consulta Dinâmica Customizada: ${customExplanation}` : queryDef.description;

      if (queryRes.rows.length === 0) {
        return `\n\n${macroContextBlock}
[DADOS EM TEMPO REAL DO BANCO GLPI (${connectorName.toUpperCase()})]:
Filtro Aplicado: ${descr}
Data/Hora Atual da Consulta (Brasília): ${horaAtualSP}
Consulta executada com sucesso no banco MySQL/MariaDB.
Nenhum chamado específico foi retornado para a listagem detalhada destes critérios.
ATENÇÃO: Responda ao usuário utilizando os contadores exatos do PANORAMA acima (ex: se a pergunta for sobre volume de hoje, ontem, semana ou mês, use os contadores exatos fornecidos).`;
      }

      return `\n\n${macroContextBlock}
[DADOS EM TEMPO REAL RETORNADOS DO BANCO GLPI CONECTADO (${connectorName.toUpperCase()})]:
Tipo de Pesquisa: ${descr}
Data/Hora da Consulta (Brasília): ${horaAtualSP}
Total de registros retornados nesta listagem: ${queryRes.totalRows}
Dados Retornados do Banco:
\`\`\`json
${JSON.stringify(queryRes.rows, null, 2)}
\`\`\`

LEGENDA E REGRAS DO GLPI:
- Status GLPI: 1=Novo, 2=Em Atendimento (Atribuído), 3=Em Atendimento (Planejado), 4=Pendente, 5=Solucionado, 6=Fechado.
- Tipos de Chamado: Incidente (1) vs Requisição (2).
INSTRUÇÃO OBRIGATÓRIA PARA A RESPOSTA:
1. Responda diretamente e com precisão à pergunta do usuário. Use os contadores do PANORAMA EM TEMPO REAL para valores numéricos e a listagem JSON para detalhar os chamados.
2. Apresente os registros em uma tabela markdown elegante e amigável quando houver linhas.
3. Se o contador solicitado for 0, informe com clareza e naturalidade (ex: "Foram abertos 0 chamados hoje").
4. Se o usuário estiver perguntando sobre a saúde da operação ou chamados em aberto, destaque os alertas proativos (como chamados com SLA vencido) de forma construtiva.
5. Formate TODAS as datas no formato brasileiro DD/MM/AAAA e horários no formato HH:MM:SS (ex: 23/09/2026 às 16:35:00).
6. Se o usuário solicitar gráficos ou se a resposta contiver métricas comparativas agrupadas (ex: por técnico, status ou categoria), adicione também um bloco \`\`\`chart com { "type": "bar"|"pie", "title": "...", "data": [{ "name": "...", "value": N }] } para renderização visual interativa.`;
    }

    return '';
  }

  /**
   * Auto-Diagnóstico & Auto-Resolução N1 para Chamados GLPI
   */
  static async autoDiagnoseAndResolveTicket(ticketTitle: string, ticketContent: string, categoryName?: string) {
    const text = `${ticketTitle} ${ticketContent} ${categoryName || ''}`.toLowerCase();
    
    // 1. Impressora / Bobina / Cupom travado
    if (text.includes('impressora') || text.includes('bobina') || text.includes('cupom') || text.includes('danfe') || text.includes('impressao') || text.includes('impressão')) {
      return {
        matched: true,
        category: 'Hardware / Impressora Térmica',
        suggestedStatus: 4, // Pendente / Validação
        diagnosis: 'Falha de comunicação ou fila de spooler travada no serviço de impressão local do PDV/Windows.',
        steps: [
          '1. Verificar se os cabos USB/Rede e alimentação da impressora térmica estão firmes.',
          '2. Desligar e ligar a impressora pela chave frontal e aguardar o avanço de papel.',
          '3. No Windows, pressionar Win+R > executar "services.msc" > reiniciar o serviço "Spooler de Impressão".',
          '4. Se o problema persistir, reiniciar o terminal do PDV.',
        ],
      };
    }

    // 2. TEF / Pinpad / Transação travada
    if (text.includes('tef') || text.includes('pinpad') || text.includes('cartao') || text.includes('cartão') || text.includes('transacao') || text.includes('transação')) {
      return {
        matched: true,
        category: 'Sistemas / TEF e Pagamentos',
        suggestedStatus: 2, // Em Atendimento
        diagnosis: 'Instabilidade de comunicação no client TEF ou timeout de resposta com a adquirente.',
        steps: [
          '1. Verificar se o cabo USB do Pinpad está conectado diretamente na porta traseira do computador.',
          '2. Finalizar o processo do client TEF (Gerenciador Padrão / Sitef) pelo Gerenciador de Tarefas e reabri-lo.',
          '3. Realizar um teste de comunicação (Função 0 ou Inicialização de Terminal no menu TEF).',
          '4. Confirmar se a conexão de internet da loja está estável.',
        ],
      };
    }

    // 3. Reset de Senha / Usuário Bloqueado
    if (text.includes('senha') || text.includes('bloqueado') || text.includes('bloqueada') || text.includes('login') || text.includes('acesso')) {
      return {
        matched: true,
        category: 'Acessos / Active Directory',
        suggestedStatus: 5, // Solucionado
        diagnosis: 'Conta bloqueada por tentativas incorretas ou expiração de senha no Active Directory/Vetor.',
        steps: [
          '1. Validar identidade do colaborador solicitante (Matrícula e Loja).',
          '2. Verificar status da conta no painel LDAP/AD do Oráculo.',
          '3. Desbloquear a conta e gerar PIN temporário de redefinição no primeiro login.',
        ],
      };
    }

    return {
      matched: false,
      diagnosis: 'Chamado requer análise técnica de Nível 2 pela equipe de TI.',
      steps: ['Encaminhado para a fila de atendimento da equipe de infraestrutura/sistemas.'],
    };
  }
}
