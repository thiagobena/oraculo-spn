import { DatabaseService } from './DatabaseService.js';

export interface GLPIQueryDefinition {
  queryType: string;
  description: string;
  richSql: string;
  fallbackSql: string;
}

export class GLPIService {
  /**
   * Constrói a instrução SQL otimizada com base na intenção da pergunta do usuário.
   */
  static selectGLPIQuery(userText: string): GLPIQueryDefinition {
    const textLower = userText.toLowerCase();

    // 1. Horas Trabalhadas por Técnico (Apontamentos de Horas / Tasks)
    if (
      textLower.includes('horas') ||
      textLower.includes('tempo trabalhado') ||
      textLower.includes('apontamento') ||
      textLower.includes('esforço') ||
      textLower.includes('esforco')
    ) {
      return {
        queryType: 'horas_tecnico',
        description: 'Total de Horas Trabalhadas por Técnico em Tarefas',
        richSql: `SELECT 
  COALESCE(NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '), u.name, 'Técnico Não Definido') AS tecnico,
  COUNT(tk.id) AS total_tarefas,
  ROUND(SUM(tk.actiontime) / 3600.0, 2) AS total_horas_trabalhadas
FROM glpi_tickettasks tk
INNER JOIN glpi_users u ON tk.users_id = u.id
GROUP BY tecnico
ORDER BY total_horas_trabalhadas DESC
LIMIT 30;`,
        fallbackSql: `SELECT users_id, SUM(actiontime)/3600 AS total_horas FROM glpi_tickettasks GROUP BY users_id LIMIT 30;`,
      };
    }

    // 2. Chamados Reabertos / Reincidência
    if (
      textLower.includes('reaberto') ||
      textLower.includes('reabertos') ||
      textLower.includes('reincidência') ||
      textLower.includes('reincidencia')
    ) {
      return {
        queryType: 'chamados_reabertos',
        description: 'Chamados que foram Reabertos (Solucionados que voltaram para Em Aberto)',
        richSql: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  t.solvedate AS data_ultima_solucao,
  CASE t.status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento (Atribuído)' WHEN 3 THEN 'Em atendimento (Planejado)' WHEN 4 THEN 'Pendente' ELSE 'Em aberto' END AS status_nome,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.solvedate IS NOT NULL AND t.status IN (1, 2, 3, 4) AND t.is_deleted = 0
ORDER BY t.solvedate DESC
LIMIT 50;`,
        fallbackSql: `SELECT id, name AS titulo, date, solvedate, status FROM glpi_tickets WHERE solvedate IS NOT NULL AND status IN (1, 2, 3, 4) AND is_deleted = 0 LIMIT 50;`,
      };
    }

    // 3. Tempo Médio de Resolução (MTTR - Mean Time to Resolve)
    if (
      textLower.includes('mttr') ||
      textLower.includes('tempo médio') ||
      textLower.includes('tempo medio') ||
      textLower.includes('média de atendimento') ||
      textLower.includes('media de atendimento')
    ) {
      return {
        queryType: 'mttr_categoria',
        description: 'Tempo Médio de Resolução (MTTR em Horas) por Categoria',
        richSql: `SELECT 
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COUNT(t.id) AS chamados_solucionados,
  ROUND(AVG(TIMESTAMPDIFF(HOUR, t.date, t.solvedate)), 1) AS mttr_medio_horas
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
WHERE t.status IN (5, 6) AND t.solvedate IS NOT NULL AND t.is_deleted = 0
GROUP BY COALESCE(c.completename, c.name, 'Sem Categoria')
ORDER BY mttr_medio_horas DESC
LIMIT 30;`,
        fallbackSql: `SELECT itilcategories_id, COUNT(*) AS solucionados, AVG(TIMESTAMPDIFF(HOUR, date, solvedate)) AS mttr_horas FROM glpi_tickets WHERE status IN (5,6) GROUP BY itilcategories_id LIMIT 30;`,
      };
    }

    // 4. Origem / Canais de Abertura dos Chamados
    if (
      textLower.includes('origem') ||
      textLower.includes('canal') ||
      textLower.includes('canais') ||
      textLower.includes('email') ||
      textLower.includes('portal')
    ) {
      return {
        queryType: 'origem_chamados',
        description: 'Resumo por Origem / Canal de Entrada de Chamados',
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

    // 5. Custos Operacionais Financeiros dos Chamados
    if (
      textLower.includes('custo') ||
      textLower.includes('custos') ||
      textLower.includes('financeiro') ||
      textLower.includes('gasto') ||
      textLower.includes('valor')
    ) {
      return {
        queryType: 'custos_chamados',
        description: 'Custos Operacionais Financeiros Registrados por Chamado',
        richSql: `SELECT 
  t.id AS ticket_id,
  t.name AS titulo_chamado,
  tc.cost_time AS custo_tempo,
  tc.cost_fixed AS custo_fixo,
  tc.cost_material AS custo_material,
  (COALESCE(tc.cost_time, 0) + COALESCE(tc.cost_fixed, 0) + COALESCE(tc.cost_material, 0)) AS custo_total_brl
FROM glpi_ticketcosts tc
INNER JOIN glpi_tickets t ON tc.tickets_id = t.id
WHERE t.is_deleted = 0
ORDER BY custo_total_brl DESC
LIMIT 50;`,
        fallbackSql: `SELECT tickets_id, cost_time, cost_fixed, cost_material FROM glpi_ticketcosts LIMIT 50;`,
      };
    }

    // 6. Soluções Técnicas Aplicadas Recentemente
    if (
      textLower.includes('solução') ||
      textLower.includes('solucao') ||
      textLower.includes('soluções') ||
      textLower.includes('solucoes') ||
      textLower.includes('resolução técnica')
    ) {
      return {
        queryType: 'solucoes_aplicadas',
        description: 'Últimas Soluções Técnicas Aplicadas aos Chamados',
        richSql: `SELECT 
  t.id AS ticket_id,
  t.name AS titulo_chamado,
  sol.content AS solucao_aplicada,
  sol.date_creation AS data_solucao,
  COALESCE(st.name, 'Padrão') AS tipo_solucao
FROM glpi_itilsolutions sol
INNER JOIN glpi_tickets t ON sol.items_id = t.id AND sol.itemtype = 'Ticket'
LEFT JOIN glpi_solutiontypes st ON sol.solutiontypes_id = st.id
WHERE t.is_deleted = 0
ORDER BY sol.id DESC
LIMIT 40;`,
        fallbackSql: `SELECT items_id AS ticket_id, content AS solucao FROM glpi_itilsolutions WHERE itemtype='Ticket' ORDER BY id DESC LIMIT 40;`,
      };
    }

    // 7. Top Usuários Requerentes (Quem Mais Abre Chamados)
    if (
      textLower.includes('top usuários') ||
      textLower.includes('top usuarios') ||
      textLower.includes('quem mais abre') ||
      textLower.includes('solicitante') ||
      textLower.includes('requerente')
    ) {
      return {
        queryType: 'top_requerentes',
        description: 'Top 30 Usuários Requerentes com Maior Volume de Chamados',
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
ORDER BY total_chamados_abertos DESC
LIMIT 30;`,
        fallbackSql: `SELECT users_id, COUNT(*) AS total FROM glpi_tickets_users WHERE type=1 GROUP BY users_id ORDER BY total DESC LIMIT 30;`,
      };
    }

    // 8. Gestão de Problemas ITIL (Problem Management)
    if (
      textLower.includes('problema') ||
      textLower.includes('problemas') ||
      textLower.includes('causa raiz')
    ) {
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
ORDER BY total_incidentes_vinculados DESC, p.id DESC
LIMIT 30;`,
        fallbackSql: `SELECT id, name AS titulo_problema, status FROM glpi_problems WHERE is_deleted = 0 ORDER BY id DESC LIMIT 30;`,
      };
    }

    // 9. Gestão de Mudanças ITIL (Change Management)
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
ORDER BY c.id DESC
LIMIT 30;`,
        fallbackSql: `SELECT id, name AS titulo_mudanca, status FROM glpi_changes WHERE is_deleted = 0 ORDER BY id DESC LIMIT 30;`,
      };
    }

    // 10. Garantias de Computadores / Hardware Expirando (ITAM Lifecycle)
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
LIMIT 40;`,
        fallbackSql: `SELECT id, name, serial FROM glpi_computers WHERE is_deleted = 0 LIMIT 40;`,
      };
    }

    // 11. Histórico de Acompanhamentos e Comentários (Followups)
    if (
      textLower.includes('acompanhamento') ||
      textLower.includes('comentário') ||
      textLower.includes('comentario') ||
      textLower.includes('followup') ||
      textLower.includes('histórico') ||
      textLower.includes('historico')
    ) {
      return {
        queryType: 'historico_followups',
        description: 'Últimos Acompanhamentos / Comentários Adicionados nos Chamados',
        richSql: `SELECT 
  f.id AS followup_id,
  f.items_id AS ticket_id,
  t.name AS titulo_chamado,
  f.content AS texto_acompanhamento,
  f.date AS data_comentario,
  COALESCE(NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '), u.name, 'Sistema') AS autor_comentario
FROM glpi_itilfollowups f
INNER JOIN glpi_tickets t ON f.items_id = t.id AND f.itemtype = 'Ticket'
LEFT JOIN glpi_users u ON f.users_id = u.id
WHERE t.is_deleted = 0
ORDER BY f.id DESC
LIMIT 40;`,
        fallbackSql: `SELECT items_id AS ticket_id, content AS texto FROM glpi_itilfollowups WHERE itemtype='Ticket' ORDER BY id DESC LIMIT 40;`,
      };
    }

    // 12. SLA / Atrasos
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
LIMIT 50;`,
        fallbackSql: `SELECT id, name AS titulo, date AS data_abertura, time_to_resolve AS data_limite_sla, status 
FROM glpi_tickets WHERE time_to_resolve IS NOT NULL AND time_to_resolve < NOW() AND status IN (1, 2, 3, 4) AND is_deleted = 0 ORDER BY time_to_resolve ASC LIMIT 50;`,
      };
    }

    // 13. Pesquisa de Satisfação (CSAT)
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
LIMIT 50;`,
        fallbackSql: `SELECT tickets_id AS ticket_id, satisfaction AS nota_1_a_5, comment AS comentario FROM glpi_ticketsatisfactions ORDER BY id DESC LIMIT 50;`,
      };
    }

    // 14. Chamados por Grupo / Equipe Técnica
    if (
      textLower.includes('grupo') ||
      textLower.includes('grupos') ||
      textLower.includes('equipe') ||
      textLower.includes('setor')
    ) {
      return {
        queryType: 'resumo_grupo',
        description: 'Resumo de chamados agrupados por Grupo / Equipe Técnica',
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
ORDER BY total_chamados DESC
LIMIT 30;`,
        fallbackSql: `SELECT status, COUNT(*) AS total FROM glpi_tickets WHERE is_deleted = 0 GROUP BY status;`,
      };
    }

    // 15. Chamados por Localização / Unidade Física
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
        description: 'Resumo de chamados agrupados por Localização Física',
        richSql: `SELECT 
  COALESCE(l.completename, l.name, 'Sem Localização') AS localizacao,
  COUNT(t.id) AS total_chamados,
  SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS em_aberto,
  SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS solucionados
FROM glpi_tickets t
LEFT JOIN glpi_locations l ON t.locations_id = l.id
WHERE t.is_deleted = 0
GROUP BY COALESCE(l.completename, l.name, 'Sem Localização')
ORDER BY total_chamados DESC
LIMIT 30;`,
        fallbackSql: `SELECT locations_id AS id_local, COUNT(*) AS total FROM glpi_tickets WHERE is_deleted = 0 GROUP BY locations_id LIMIT 30;`,
      };
    }

    // 16. Chamados por Equipamentos / Ativos Afetados (ITAM)
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
LIMIT 50;`,
        fallbackSql: `SELECT id, name AS titulo, date FROM glpi_tickets WHERE is_deleted = 0 ORDER BY id DESC LIMIT 50;`,
      };
    }

    // 17. Chamados abertos hoje
    if (textLower.includes('hoje') || textLower.includes('entrantes hoje')) {
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
WHERE DATE(t.date) = CURDATE() AND t.is_deleted = 0
ORDER BY t.date DESC
LIMIT 50;`,
        fallbackSql: `SELECT id, name AS titulo, date AS data_abertura, 
CASE status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento (Atribuído)' WHEN 3 THEN 'Em atendimento (Planejado)' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Outro' END AS status_nome,
CASE priority WHEN 1 THEN 'Muito Baixa' WHEN 2 THEN 'Baixa' WHEN 3 THEN 'Média' WHEN 4 THEN 'Alta' WHEN 5 THEN 'Muito Alta' WHEN 6 THEN 'Maior' ELSE 'Normal' END AS prioridade
FROM glpi_tickets WHERE DATE(date) = CURDATE() AND is_deleted = 0 ORDER BY date DESC LIMIT 50;`,
      };
    }

    // 18. Chamados Críticos / Urgentes / Alta Prioridade
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
LIMIT 50;`,
        fallbackSql: `SELECT id, name AS titulo, date AS data_abertura, 
CASE status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento (Atribuído)' WHEN 3 THEN 'Em atendimento (Planejado)' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Outro' END AS status_nome,
CASE priority WHEN 1 THEN 'Muito Baixa' WHEN 2 THEN 'Baixa' WHEN 3 THEN 'Média' WHEN 4 THEN 'Alta' WHEN 5 THEN 'Muito Alta' WHEN 6 THEN 'Maior' ELSE 'Normal' END AS prioridade
FROM glpi_tickets WHERE priority >= 4 AND status IN (1, 2, 3, 4) AND is_deleted = 0 ORDER BY priority DESC, date DESC LIMIT 50;`,
      };
    }

    // 19. Chamados Solucionados / Fechados
    if (
      textLower.includes('solucionado') ||
      textLower.includes('fechado') ||
      textLower.includes('resolvido') ||
      textLower.includes('concluído') ||
      textLower.includes('concluido')
    ) {
      return {
        queryType: 'solucionados',
        description: 'Chamados Solucionados / Fechados Recentemente',
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
LIMIT 50;`,
        fallbackSql: `SELECT id, name AS titulo, date AS data_abertura, solvedate AS data_solucao,
CASE status WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Finalizado' END AS status_nome
FROM glpi_tickets WHERE status IN (5, 6) AND is_deleted = 0 ORDER BY COALESCE(solvedate, closedate, date) DESC LIMIT 50;`,
      };
    }

    // 20. Agrupamento por Categoria
    if (textLower.includes('categoria') || textLower.includes('categorias')) {
      return {
        queryType: 'resumo_categoria',
        description: 'Resumo de chamados agrupados por Categoria ITIL',
        richSql: `SELECT 
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COUNT(*) AS total_chamados,
  SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS em_aberto,
  SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS solucionados
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
WHERE t.is_deleted = 0
GROUP BY COALESCE(c.completename, c.name, 'Sem Categoria')
ORDER BY total_chamados DESC
LIMIT 30;`,
        fallbackSql: `SELECT itilcategories_id AS id_categoria, COUNT(*) AS total_chamados 
FROM glpi_tickets WHERE is_deleted = 0 GROUP BY itilcategories_id ORDER BY total_chamados DESC LIMIT 30;`,
      };
    }

    // 21. Agrupamento por Técnico Atribuído
    if (textLower.includes('técnico') || textLower.includes('tecnico') || textLower.includes('responsável') || textLower.includes('atribuído')) {
      return {
        queryType: 'resumo_tecnico',
        description: 'Resumo de chamados agrupados por Técnico Responsável',
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
ORDER BY total_chamados DESC
LIMIT 30;`,
        fallbackSql: `SELECT status, COUNT(*) AS total_chamados FROM glpi_tickets WHERE is_deleted = 0 GROUP BY status ORDER BY status;`,
      };
    }

    // 22. Chamados Pendentes / Em Aberto (Novo, Atribuído, Planejado, Pendente: Status 1, 2, 3, 4)
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
LIMIT 50;`,
        fallbackSql: `SELECT id, name AS titulo, date AS data_abertura, 
CASE status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento (Atribuído)' WHEN 3 THEN 'Em atendimento (Planejado)' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Outro' END AS status_nome,
CASE priority WHEN 1 THEN 'Muito Baixa' WHEN 2 THEN 'Baixa' WHEN 3 THEN 'Média' WHEN 4 THEN 'Alta' WHEN 5 THEN 'Muito Alta' WHEN 6 THEN 'Maior' ELSE 'Normal' END AS prioridade
FROM glpi_tickets WHERE status IN (1, 2, 3, 4) AND is_deleted = 0 ORDER BY id DESC LIMIT 50;`,
      };
    }

    // 23. Padrão / Geral: Listar últimos chamados com contexto completo
    return {
      queryType: 'geral',
      description: 'Últimos chamados cadastrados no GLPI',
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
LIMIT 50;`,
      fallbackSql: `SELECT id, name AS titulo, date AS data_abertura, 
CASE status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento (Atribuído)' WHEN 3 THEN 'Em atendimento (Planejado)' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Outro' END AS status_nome,
CASE priority WHEN 1 THEN 'Muito Baixa' WHEN 2 THEN 'Baixa' WHEN 3 THEN 'Média' WHEN 4 THEN 'Alta' WHEN 5 THEN 'Muito Alta' WHEN 6 THEN 'Maior' ELSE 'Normal' END AS prioridade
FROM glpi_tickets WHERE is_deleted = 0 ORDER BY id DESC LIMIT 50;`,
    };
  }

  /**
   * Executa a consulta ao GLPI no conector configurado com suporte a fallback resiliente.
   */
  static async fetchGLPIDataContext(connectorId: string, userText: string, connectorName: string): Promise<string> {
    const queryDef = this.selectGLPIQuery(userText);
    let queryRes: any = null;

    try {
      // Tentar a consulta rica com JOINs
      queryRes = await DatabaseService.executeQuery(connectorId, queryDef.richSql);
    } catch (err: any) {
      console.warn(`[GLPIService] Consulta rica falhou para '${connectorName}'. Executando fallback... Erro:`, err.message);
      try {
        // Fallback para a tabela base glpi_tickets
        queryRes = await DatabaseService.executeQuery(connectorId, queryDef.fallbackSql);
      } catch (fallbackErr: any) {
        throw new Error(`Falha ao executar consulta no banco GLPI: ${fallbackErr.message}`);
      }
    }

    if (queryRes && queryRes.success && queryRes.rows) {
      const horaAtualSP = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      if (queryRes.rows.length === 0) {
        return `\n\n[DADOS EM TEMPO REAL DO BANCO GLPI (${connectorName.toUpperCase()})]:
Filtro Aplicado: ${queryDef.description}
Data/Hora Atual do Servidor (Brasília): ${horaAtualSP}
Consulta executada com sucesso no banco MySQL/MariaDB.
NENHUM chamado foi retornado para estes critérios até a presente data/hora (${horaAtualSP}). Informe isso de forma clara e objetiva ao usuário.`;
      }

      return `\n\n[DADOS EM TEMPO REAL RETORNADOS DO BANCO GLPI CONECTADO (${connectorName.toUpperCase()})]:
Tipo de Pesquisa: ${queryDef.description}
Data/Hora da Consulta (Brasília): ${horaAtualSP}
Total de registros encontrados: ${queryRes.totalRows}
Dados Brutos:
\`\`\`json
${JSON.stringify(queryRes.rows, null, 2)}
\`\`\`
LEGENDA E REGRAS DO GLPI:
- Status GLPI: 1=Novo, 2=Em Atendimento (Atribuído), 3=Em Atendimento (Planejado), 4=Pendente, 5=Solucionado, 6=Fechado.
- Tipos de Chamado: Incidente vs Requisição.
INSTRUÇÃO OBRIGATÓRIA PARA A RESPOSTA:
1. Apresente estes dados reais em uma tabela markdown elegante e amigável.
2. Inclua as colunas relevantes do JSON retornado.
3. Seja sucinto, profissional e forneça um breve resumo explicativo ao final da tabela.`;
    }

    return '';
  }
}
