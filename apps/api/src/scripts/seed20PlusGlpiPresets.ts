import { prisma } from '../db/prisma.js';

interface PresetDef {
  title: string;
  description: string;
  category: string;
  visualization_type: 'table' | 'bar_chart' | 'pie_chart' | 'line_chart' | 'kpi';
  badge_color: string;
  query_payload: string;
}

const GLPI_PRESETS: PresetDef[] = [
  // --- 1. OPERACIONAL & FILA ATIVA ---
  {
    title: '📌 Fila de Triagem (Novos & Sem Atribuição)',
    description: 'Chamados novos aguardando análise inicial e designação de técnico responsável.',
    category: 'Operacional',
    visualization_type: 'table',
    badge_color: 'cyan',
    query_payload: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura,
  TIMESTAMPDIFF(HOUR, t.date, NOW()) AS horas_na_fila,
  CASE t.priority 
    WHEN 1 THEN 'Muito Baixa' WHEN 2 THEN 'Baixa' WHEN 3 THEN 'Média' WHEN 4 THEN 'Alta' WHEN 5 THEN 'Muito Alta' WHEN 6 THEN 'Maior' ELSE 'Normal' 
  END AS prioridade,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '), u.name, 'Não informado') AS requerente
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu ON (t.id = tu.tickets_id AND tu.type = 1)
LEFT JOIN glpi_users u ON tu.users_id = u.id
WHERE t.is_deleted = 0 
  AND t.status = 1 
  AND NOT EXISTS (SELECT 1 FROM glpi_tickets_users tu2 WHERE tu2.tickets_id = t.id AND tu2.type = 2)
ORDER BY t.priority DESC, t.date ASC;`
  },
  {
    title: '⏱️ Chamados Abertos Hoje',
    description: 'Listagem completa de todos os tickets registrados no sistema na data de hoje.',
    category: 'Operacional',
    visualization_type: 'table',
    badge_color: 'cyan',
    query_payload: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura,
  CASE t.status 
    WHEN 1 THEN 'Novo' 
    WHEN 2 THEN 'Em atendimento' 
    WHEN 3 THEN 'Planejado' 
    WHEN 4 THEN 'Pendente' 
    WHEN 5 THEN 'Solucionado' 
    WHEN 6 THEN 'Fechado' 
    ELSE 'Outro' 
  END AS status_atual,
  COALESCE(c.name, 'Geral') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_req.firstname, ''), ' ', COALESCE(u_req.realname, '')), ' '), u_req.name, 'Requerente') AS requerente,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não Atribuído') AS tecnico
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_req ON (t.id = tu_req.tickets_id AND tu_req.type = 1)
LEFT JOIN glpi_users u_req ON tu_req.users_id = u_req.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.is_deleted = 0 
  AND DATE(t.date) = CURDATE()
ORDER BY t.date DESC;`
  },
  {
    title: '🔄 Chamados Pendentes (Aguardando Retorno)',
    description: 'Tickets com atendimento pausado aguardando validação do usuário, aprovação ou peça.',
    category: 'Operacional',
    visualization_type: 'table',
    badge_color: 'amber',
    query_payload: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura,
  t.date_mod AS ultima_atualizacao,
  TIMESTAMPDIFF(DAY, t.date_mod, NOW()) AS dias_sem_movimento,
  COALESCE(c.name, 'Geral') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não Atribuído') AS tecnico_responsavel
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.is_deleted = 0 
  AND t.status = 4
ORDER BY t.date_mod ASC;`
  },
  {
    title: '🛠️ Fila Ativa em Atendimento',
    description: 'Todos os chamados que estão atualmente com status Em Atendimento pelas equipes.',
    category: 'Operacional',
    visualization_type: 'table',
    badge_color: 'cyan',
    query_payload: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura,
  t.time_to_resolve AS prazo_sla,
  COALESCE(c.name, 'Geral') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não Atribuído') AS tecnico
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.is_deleted = 0 
  AND t.status IN (2, 3)
ORDER BY t.priority DESC, t.time_to_resolve ASC;`
  },
  {
    title: '✅ Chamados Solucionados Hoje',
    description: 'Tickets que foram resolvidos ou concluídos com sucesso no dia de hoje.',
    category: 'Operacional',
    visualization_type: 'table',
    badge_color: 'emerald',
    query_payload: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  t.solvedate AS data_solucao,
  ROUND(TIMESTAMPDIFF(MINUTE, t.date, t.solvedate) / 60, 1) AS horas_atendimento,
  COALESCE(c.name, 'Geral') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Técnico') AS resolvido_por
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.is_deleted = 0 
  AND t.status IN (5, 6)
  AND DATE(t.solvedate) = CURDATE()
ORDER BY t.solvedate DESC;`
  },

  // --- 2. SLA, PRAZOS & RISCO OPERACIONAL ---
  {
    title: '🚨 Atrasados / SLA Vencido (Ação Urgente)',
    description: 'Chamados em aberto cujo prazo limite de solução estabelecido no SLA já expirou.',
    category: 'SLA',
    visualization_type: 'table',
    badge_color: 'rose',
    query_payload: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  t.time_to_resolve AS prazo_sla,
  TIMESTAMPDIFF(HOUR, t.time_to_resolve, NOW()) AS horas_atraso,
  COALESCE(c.name, 'Geral') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'NÃO ATRIBUÍDO') AS tecnico_responsavel
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.is_deleted = 0 
  AND t.status NOT IN (5, 6) 
  AND t.time_to_resolve IS NOT NULL 
  AND t.time_to_resolve < NOW()
ORDER BY t.time_to_resolve ASC;`
  },
  {
    title: '⏰ Alerta de SLA Iminente (Vencendo nas Próximas 4h)',
    description: 'Chamados em aberto com risco imediato de violação de SLA nas próximas horas.',
    category: 'SLA',
    visualization_type: 'table',
    badge_color: 'amber',
    query_payload: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.time_to_resolve AS prazo_sla,
  ROUND(TIMESTAMPDIFF(MINUTE, NOW(), t.time_to_resolve) / 60, 1) AS horas_restantes,
  COALESCE(c.name, 'Geral') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não Atribuído') AS tecnico
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.is_deleted = 0 
  AND t.status NOT IN (5, 6) 
  AND t.time_to_resolve IS NOT NULL 
  AND t.time_to_resolve BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 4 HOUR)
ORDER BY t.time_to_resolve ASC;`
  },
  {
    title: '📊 Cumprimento de SLA no Mês Atual (% Dentro vs Fora)',
    description: 'Indicador geral de SLA dos chamados encerrados no mês corrente.',
    category: 'SLA',
    visualization_type: 'pie_chart',
    badge_color: 'emerald',
    query_payload: `SELECT 
  CASE 
    WHEN t.time_to_resolve IS NULL THEN 'Sem SLA Definido'
    WHEN t.solvedate <= t.time_to_resolve THEN 'Dentro do SLA (Conforme)'
    ELSE 'Fora do SLA (Estourado)'
  END AS status_sla,
  COUNT(*) AS total_chamados
FROM glpi_tickets t
WHERE t.is_deleted = 0 
  AND t.status IN (5, 6)
  AND t.solvedate >= DATE_FORMAT(NOW(), '%Y-%m-01')
GROUP BY status_sla;`
  },
  {
    title: '⚠️ Violação de SLA por Categoria',
    description: 'Categorias que mais registraram chamados com atraso de SLA na história recente.',
    category: 'SLA',
    visualization_type: 'bar_chart',
    badge_color: 'rose',
    query_payload: `SELECT 
  COALESCE(c.name, 'Sem Categoria') AS categoria,
  COUNT(*) AS total_estourados
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
WHERE t.is_deleted = 0 
  AND t.time_to_resolve IS NOT NULL 
  AND ((t.status NOT IN (5, 6) AND t.time_to_resolve < NOW()) OR (t.status IN (5, 6) AND t.solvedate > t.time_to_resolve))
  AND t.date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
GROUP BY c.id, c.name
ORDER BY total_estourados DESC
LIMIT 10;`
  },
  {
    title: '🔴 Incidentes Críticos & Alta Prioridade',
    description: 'Chamados classificados como Alta, Muito Alta ou Maior prioridade ainda pendentes.',
    category: 'SLA',
    visualization_type: 'table',
    badge_color: 'rose',
    query_payload: `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura,
  CASE t.priority 
    WHEN 4 THEN 'Alta' WHEN 5 THEN 'Muito Alta' WHEN 6 THEN 'Maior' ELSE 'Normal' 
  END AS prioridade,
  COALESCE(c.name, 'Geral') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'NÃO ATRIBUÍDO') AS tecnico
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.is_deleted = 0 
  AND t.status NOT IN (5, 6) 
  AND t.priority >= 4
ORDER BY t.priority DESC, t.date ASC;`
  },

  // --- 3. EQUIPE & PRODUTIVIDADE TÉCNICA ---
  {
    title: '🏆 Produtividade: Resolvidos por Técnico no Mês',
    description: 'Volume de tickets solucionados por cada membro da equipe técnica no mês atual.',
    category: 'Técnico',
    visualization_type: 'bar_chart',
    badge_color: 'cyan',
    query_payload: `SELECT 
  COALESCE(NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '), u.name, 'Técnico Desconhecido') AS tecnico,
  COUNT(*) AS chamados_resolvidos
FROM glpi_tickets t
JOIN glpi_tickets_users tu ON (t.id = tu.tickets_id AND tu.type = 2)
JOIN glpi_users u ON tu.users_id = u.id
WHERE t.is_deleted = 0 
  AND t.status IN (5, 6)
  AND t.solvedate >= DATE_FORMAT(NOW(), '%Y-%m-01')
GROUP BY u.id, u.firstname, u.realname, u.name
ORDER BY chamados_resolvidos DESC;`
  },
  {
    title: '⚖️ Carga de Trabalho Atual por Técnico',
    description: 'Contagem de chamados em aberto na fila de cada técnico no momento.',
    category: 'Técnico',
    visualization_type: 'bar_chart',
    badge_color: 'purple',
    query_payload: `SELECT 
  COALESCE(NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '), u.name, 'Não Atribuído') AS tecnico,
  COUNT(*) AS chamados_em_aberto
FROM glpi_tickets t
LEFT JOIN glpi_tickets_users tu ON (t.id = tu.tickets_id AND tu.type = 2)
LEFT JOIN glpi_users u ON tu.users_id = u.id
WHERE t.is_deleted = 0 
  AND t.status NOT IN (5, 6)
GROUP BY u.id, u.firstname, u.realname, u.name
ORDER BY chamados_em_aberto DESC;`
  },
  {
    title: '⏱️ Tempo Médio de Resolução (MTTR) por Técnico',
    description: 'Média de horas gastas por técnico para solucionar chamados nos últimos 60 dias.',
    category: 'Técnico',
    visualization_type: 'table',
    badge_color: 'cyan',
    query_payload: `SELECT 
  COALESCE(NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '), u.name, 'Técnico') AS tecnico,
  COUNT(*) AS total_resolvidos,
  ROUND(AVG(TIMESTAMPDIFF(MINUTE, t.date, t.solvedate)) / 60, 1) AS media_horas_resolucao,
  ROUND(MIN(TIMESTAMPDIFF(MINUTE, t.date, t.solvedate)) / 60, 1) AS menor_tempo_horas,
  ROUND(MAX(TIMESTAMPDIFF(MINUTE, t.date, t.solvedate)) / 60, 1) AS maior_tempo_horas
FROM glpi_tickets t
JOIN glpi_tickets_users tu ON (t.id = tu.tickets_id AND tu.type = 2)
JOIN glpi_users u ON tu.users_id = u.id
WHERE t.is_deleted = 0 
  AND t.status IN (5, 6)
  AND t.solvedate >= DATE_SUB(NOW(), INTERVAL 60 DAY)
GROUP BY u.id, u.firstname, u.realname, u.name
HAVING total_resolvidos >= 3
ORDER BY media_horas_resolucao ASC;`
  },
  {
    title: '👥 Distribuição de Chamados por Grupo Técnico',
    description: 'Volume de chamados atribuídos por grupos/equipes técnicas do GLPI.',
    category: 'Técnico',
    visualization_type: 'pie_chart',
    badge_color: 'purple',
    query_payload: `SELECT 
  COALESCE(g.completename, g.name, 'Sem Grupo Atribuído') AS grupo_tecnico,
  COUNT(*) AS total_chamados
FROM glpi_tickets t
LEFT JOIN glpi_groups_tickets gt ON (t.id = gt.tickets_id AND gt.type = 2)
LEFT JOIN glpi_groups g ON gt.groups_id = g.id
WHERE t.is_deleted = 0 
  AND t.status NOT IN (5, 6)
GROUP BY g.id, g.completename, g.name
ORDER BY total_chamados DESC;`
  },

  // --- 4. ANALYTICS, TENDÊNCIAS & QUALIDADE ---
  {
    title: '📈 Volume Diário de Aberturas (Últimos 14 dias)',
    description: 'Evolução cronológica do número de novos chamados abertos por dia.',
    category: 'Analytics',
    visualization_type: 'bar_chart',
    badge_color: 'cyan',
    query_payload: `SELECT 
  DATE_FORMAT(t.date, '%d/%m') AS dia,
  COUNT(*) AS total_abertos
FROM glpi_tickets t
WHERE t.is_deleted = 0 
  AND t.date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
GROUP BY DATE(t.date), DATE_FORMAT(t.date, '%d/%m')
ORDER BY DATE(t.date) ASC;`
  },
  {
    title: '📊 Incidentes vs Requisições (ITIL)',
    description: 'Proporção entre incidentes (falhas/paradas) e requisições de serviço no GLPI.',
    category: 'Analytics',
    visualization_type: 'pie_chart',
    badge_color: 'cyan',
    query_payload: `SELECT 
  CASE t.type 
    WHEN 1 THEN 'Incidente (Falha/Problema)' 
    WHEN 2 THEN 'Requisição (Pedido/Serviço)' 
    ELSE 'Outro' 
  END AS tipo_itil,
  COUNT(*) AS total
FROM glpi_tickets t
WHERE t.is_deleted = 0 
  AND t.date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
GROUP BY t.type;`
  },
  {
    title: '🏢 Chamados por Entidade / Filial',
    description: 'Distribuição do volume de chamados por empresa, filial ou unidade de negócio.',
    category: 'Analytics',
    visualization_type: 'bar_chart',
    badge_color: 'emerald',
    query_payload: `SELECT 
  COALESCE(e.completename, e.name, 'Entidade Padrão') AS entidade_filial,
  COUNT(*) AS total_chamados
FROM glpi_tickets t
LEFT JOIN glpi_entities e ON t.entities_id = e.id
WHERE t.is_deleted = 0 
  AND t.date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
GROUP BY e.id, e.completename, e.name
ORDER BY total_chamados DESC
LIMIT 10;`
  },
  {
    title: '👤 Top 10 Requerentes Mais Frequentes (Mês)',
    description: 'Usuários que mais abriram chamados nos últimos 30 dias para auditoria de reincidência.',
    category: 'Analytics',
    visualization_type: 'table',
    badge_color: 'cyan',
    query_payload: `SELECT 
  COALESCE(NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '), u.name, 'Usuário') AS solicitante,
  COUNT(*) AS total_chamados,
  SUM(CASE WHEN t.status NOT IN (5, 6) THEN 1 ELSE 0 END) AS em_aberto,
  SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS concluidos
FROM glpi_tickets t
JOIN glpi_tickets_users tu ON (t.id = tu.tickets_id AND tu.type = 1)
JOIN glpi_users u ON tu.users_id = u.id
WHERE t.is_deleted = 0 
  AND t.date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY u.id, u.firstname, u.realname, u.name
ORDER BY total_chamados DESC
LIMIT 10;`
  },
  {
    title: '⭐ Pesquisa de Satisfação (CSAT por Categoria)',
    description: 'Nota média e índice de satisfação dos usuários por categoria de atendimento.',
    category: 'Analytics',
    visualization_type: 'bar_chart',
    badge_color: 'amber',
    query_payload: `SELECT 
  COALESCE(c.name, 'Sem Categoria') AS categoria,
  COUNT(ts.id) AS avaliacoes_recebidas,
  ROUND(AVG(ts.satisfaction), 2) AS nota_media_csat
FROM glpi_ticketsatisfactions ts
JOIN glpi_tickets t ON ts.tickets_id = t.id
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
WHERE t.is_deleted = 0 
  AND ts.satisfaction IS NOT NULL
GROUP BY c.id, c.name
HAVING avaliacoes_recebidas >= 1
ORDER BY nota_media_csat DESC;`
  },

  // --- 5. GESTÃO DE ATIVOS & CANAIS DE ENTRADA ---
  {
    title: '🌐 Canais de Entrada (Origem do Chamado)',
    description: 'Proporção de chamados abertos via Portal Web, E-mail, Chatbot, API ou Telefone.',
    category: 'Analytics',
    visualization_type: 'pie_chart',
    badge_color: 'purple',
    query_payload: `SELECT 
  COALESCE(rs.name, 'Outro / Não especificado') AS canal_origem,
  COUNT(*) AS total_chamados
FROM glpi_tickets t
LEFT JOIN glpi_requestsources rs ON t.requestsources_id = rs.id
WHERE t.is_deleted = 0 
  AND t.date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
GROUP BY rs.id, rs.name
ORDER BY total_chamados DESC;`
  },
  {
    title: '🕒 Horas de Atendimento (Action Time) por Categoria',
    description: 'Total acumulado de horas de trabalho técnico despendidas por categoria de chamado.',
    category: 'Analytics',
    visualization_type: 'bar_chart',
    badge_color: 'cyan',
    query_payload: `SELECT 
  COALESCE(c.name, 'Geral') AS categoria,
  ROUND(SUM(t.actiontime) / 3600, 1) AS total_horas_trabalhadas,
  COUNT(*) AS total_chamados
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
WHERE t.is_deleted = 0 
  AND t.actiontime > 0
  AND t.date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
GROUP BY c.id, c.name
ORDER BY total_horas_trabalhadas DESC
LIMIT 10;`
  },
  {
    title: '💻 Chamados Vinculados a Ativos de TI (Computadores & Dispositivos)',
    description: 'Relação de equipamentos e ativos com chamados ou manutenções registradas.',
    category: 'Analytics',
    visualization_type: 'table',
    badge_color: 'cyan',
    query_payload: `SELECT 
  t.id AS chamado_id,
  t.name AS titulo,
  t.date AS data_abertura,
  it.itemtype AS tipo_ativo,
  it.items_id AS id_ativo,
  COALESCE(c.name, 'Geral') AS categoria
FROM glpi_items_tickets it
JOIN glpi_tickets t ON it.tickets_id = t.id
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
WHERE t.is_deleted = 0
ORDER BY t.date DESC
LIMIT 20;`
  }
];

async function seedPresets() {
  console.log('Iniciando cadastro de 20+ presets de GLPI...');

  const connectors = await prisma.databaseConnector.findMany({
    where: {
      OR: [
        { name: { contains: 'glpi' } },
        { database: { contains: 'glpi' } },
        { category: 'api' }
      ]
    }
  });

  if (connectors.length === 0) {
    console.log('Nenhum conector GLPI encontrado no banco.');
    return;
  }

  for (const conn of connectors) {
    console.log(`\nInserindo presets no conector: ${conn.name} (${conn.id})...`);
    
    // Deletar presets anteriores para renovar o catálogo completo e padronizado
    await prisma.dataSourcePreset.deleteMany({
      where: { connector_id: conn.id }
    });

    for (const p of GLPI_PRESETS) {
      await prisma.dataSourcePreset.create({
        data: {
          connector_id: conn.id,
          title: p.title,
          description: p.description,
          category: p.category,
          visualization_type: p.visualization_type,
          badge_color: p.badge_color,
          query_payload: p.query_payload,
          is_system: true,
        }
      });
    }

    const count = await prisma.dataSourcePreset.count({ where: { connector_id: conn.id } });
    console.log(`✅ Conector "${conn.name}" atualizado com ${count} presets ativos!`);
  }
}

seedPresets()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
