import { prisma } from '../db/prisma.js';

export interface GLPIApiConfig {
  apiUrl: string;      // ex: http://glpi.empresa.local/apirest.php
  appToken: string;    // App-Token do GLPI (configurado em Configurar -> Geral -> API)
  userToken?: string;  // User-Token do usuário técnico/admin da API
  username?: string;   // Login de usuário (caso use basic auth)
  password?: string;   // Senha (caso use basic auth)
}

export interface GLPIActionResult {
  success: boolean;
  action: string;
  ticketId?: number;
  message: string;
  data?: any;
  error?: string;
}

export class GLPIApiClient {
  /**
   * Obtém as credenciais da API REST do GLPI a partir do conector ativo ou variáveis de ambiente.
   */
  static async getConfig(connectorId?: string): Promise<GLPIApiConfig | null> {
    try {
      // 1. Tentar obter pelo conector DatabaseConnector
      if (connectorId) {
        const connector = await (prisma as any).databaseConnector.findUnique({
          where: { id: connectorId },
        });

        if (connector && connector.config_json) {
          try {
            const parsed = JSON.parse(connector.config_json);
            if (parsed.apiUrl || parsed.baseUrl || parsed.glpiApiUrl) {
              return {
                apiUrl: (parsed.apiUrl || parsed.baseUrl || parsed.glpiApiUrl).replace(/\/+$/, ''),
                appToken: parsed.appToken || parsed.app_token || process.env.GLPI_APP_TOKEN || '',
                userToken: parsed.userToken || parsed.user_token || process.env.GLPI_USER_TOKEN || '',
                username: parsed.username || process.env.GLPI_API_USER,
                password: parsed.password || process.env.GLPI_API_PASSWORD,
              };
            }
          } catch (_) {}
        }
      }

      // 2. Tentar encontrar qualquer conector GLPI com config_json
      const glpiConn = await (prisma as any).databaseConnector.findFirst({
        where: {
          is_active: true,
          OR: [
            { name: { contains: 'glpi' } },
            { database: { contains: 'glpi' } },
            { category: 'api' },
          ],
        },
      });

      if (glpiConn && glpiConn.config_json) {
        try {
          const parsed = JSON.parse(glpiConn.config_json);
          if (parsed.apiUrl || parsed.baseUrl || parsed.glpiApiUrl) {
            return {
              apiUrl: (parsed.apiUrl || parsed.baseUrl || parsed.glpiApiUrl).replace(/\/+$/, ''),
              appToken: parsed.appToken || parsed.app_token || process.env.GLPI_APP_TOKEN || '',
              userToken: parsed.userToken || parsed.user_token || process.env.GLPI_USER_TOKEN || '',
              username: parsed.username || process.env.GLPI_API_USER,
              password: parsed.password || process.env.GLPI_API_PASSWORD,
            };
          }
        } catch (_) {}
      }

      // 3. Fallback para variáveis de ambiente
      if (process.env.GLPI_API_URL) {
        return {
          apiUrl: process.env.GLPI_API_URL.replace(/\/+$/, ''),
          appToken: process.env.GLPI_APP_TOKEN || '',
          userToken: process.env.GLPI_USER_TOKEN || '',
          username: process.env.GLPI_API_USER,
          password: process.env.GLPI_API_PASSWORD,
        };
      }

      return null;
    } catch (err: any) {
      console.warn('[GLPIApiClient] Erro ao recuperar configuração da API:', err.message);
      return null;
    }
  }

  /**
   * Inicia sessão na API REST do GLPI, seleciona perfil Super-Admin e ativa visão recursiva de todas as entidades.
   */
  private static async initSession(config: GLPIApiConfig): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (config.appToken) {
      headers['App-Token'] = config.appToken;
    }

    if (config.userToken) {
      headers['Authorization'] = `user_token ${config.userToken}`;
    } else if (config.username && config.password) {
      const basicAuth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      headers['Authorization'] = `Basic ${basicAuth}`;
    }

    const res = await fetch(`${config.apiUrl}/initSession`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Falha na autenticação GLPI REST API (${res.status}): ${text}`);
    }

    const data = await res.json() as any;
    if (!data.session_token) {
      throw new Error('GLPI não retornou session_token válido.');
    }

    const sessionToken = data.session_token;

    // Ativar perfil Super-Admin e visão recursiva para ver chamados de todas as lojas/setores
    try {
      await fetch(`${config.apiUrl}/changeActiveProfile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'App-Token': config.appToken,
          'Session-Token': sessionToken,
        },
        body: JSON.stringify({ profiles_id: 4 }),
      });

      await fetch(`${config.apiUrl}/changeActiveEntities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'App-Token': config.appToken,
          'Session-Token': sessionToken,
        },
        body: JSON.stringify({ entities_id: 0, is_recursive: true }),
      });
    } catch (_) {}

    return sessionToken;
  }

  /**
   * Encerra a sessão na API REST do GLPI.
   */
  private static async killSession(config: GLPIApiConfig, sessionToken: string): Promise<void> {
    try {
      const headers: Record<string, string> = {
        'Session-Token': sessionToken,
      };
      if (config.appToken) headers['App-Token'] = config.appToken;

      await fetch(`${config.apiUrl}/killSession`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000),
      });
    } catch (_) {
      // Falha silenciosa ao encerrar sessão
    }
  }

  /**
   * Executa uma requisição autenticada na API REST do GLPI.
   */
  private static async request<T = any>(
    config: GLPIApiConfig,
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<T> {
    const sessionToken = await this.initSession(config);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Session-Token': sessionToken,
      };
      if (config.appToken) headers['App-Token'] = config.appToken;

      const url = `${config.apiUrl}/${endpoint.replace(/^\/+/, '')}`;
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erro na chamada GLPI [${method} ${endpoint}] (${res.status}): ${errText}`);
      }

      return (await res.json()) as T;
    } finally {
      await this.killSession(config, sessionToken);
    }
  }

  /**
   * 1. Adicionar Acompanhamento / Follow-up em um chamado
   */
  static async addFollowup(
    ticketId: number,
    content: string,
    isPrivate: boolean = false,
    connectorId?: string
  ): Promise<GLPIActionResult> {
    const config = await this.getConfig(connectorId);
    if (!config) {
      return {
        success: false,
        action: 'add_followup',
        ticketId,
        message: 'API REST do GLPI não configurada.',
      };
    }

    try {
      const payload = {
        input: {
          items_id: ticketId,
          itemtype: 'Ticket',
          content,
          is_private: isPrivate ? 1 : 0,
          requesttypes_id: 1, // Helpdesk
        },
      };

      const result = await this.request(config, `Ticket/${ticketId}/ITILFollowup`, 'POST', payload);
      return {
        success: true,
        action: 'add_followup',
        ticketId,
        message: `Acompanhamento adicionado com sucesso ao chamado #${ticketId}!`,
        data: result,
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'add_followup',
        ticketId,
        message: `Erro ao adicionar acompanhamento no chamado #${ticketId}: ${err.message}`,
        error: err.message,
      };
    }
  }

  /**
   * 2. Atualizar Propriedades do Chamado (Status, Prioridade, Categoria, Urgência)
   */
  static async updateTicket(
    ticketId: number,
    updates: {
      status?: number;            // 1=Novo, 2=Atribuído, 3=Planejado, 4=Pendente, 5=Solucionado, 6=Fechado
      priority?: number;          // 1=Muito Baixa ... 5=Muito Alta, 6=Maior
      urgency?: number;
      impact?: number;
      itilcategories_id?: number;
      name?: string;
    },
    connectorId?: string
  ): Promise<GLPIActionResult> {
    const config = await this.getConfig(connectorId);
    if (!config) {
      return {
        success: false,
        action: 'update_ticket',
        ticketId,
        message: 'API REST do GLPI não configurada.',
      };
    }

    try {
      const inputPayload: any = { id: ticketId, ...updates };
      const payload = { input: inputPayload };

      const result = await this.request(config, `Ticket/${ticketId}`, 'PUT', payload);
      return {
        success: true,
        action: 'update_ticket',
        ticketId,
        message: `Chamado #${ticketId} atualizado com sucesso!`,
        data: result,
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'update_ticket',
        ticketId,
        message: `Erro ao atualizar chamado #${ticketId}: ${err.message}`,
        error: err.message,
      };
    }
  }

  /**
   * 3. Atribuir Chamado a um Técnico (Users_ID no GLPI)
   */
  static async assignTechnician(
    ticketId: number,
    userId: number,
    connectorId?: string
  ): Promise<GLPIActionResult> {
    const config = await this.getConfig(connectorId);
    if (!config) {
      return {
        success: false,
        action: 'assign_technician',
        ticketId,
        message: 'API REST do GLPI não configurada.',
      };
    }

    try {
      const payload = {
        input: {
          tickets_id: ticketId,
          users_id: userId,
          type: 2, // 2 = Atribuído (Técnico / Responsável)
        },
      };

      const result = await this.request(config, `Ticket/${ticketId}/Ticket_User`, 'POST', payload);
      
      // Atualiza o status do chamado para 2 (Em atendimento / Atribuído) se estiver como Novo (1)
      await this.updateTicket(ticketId, { status: 2 }, connectorId);

      return {
        success: true,
        action: 'assign_technician',
        ticketId,
        message: `Chamado #${ticketId} atribuído ao técnico (ID ${userId}) com sucesso!`,
        data: result,
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'assign_technician',
        ticketId,
        message: `Erro ao atribuir chamado #${ticketId}: ${err.message}`,
        error: err.message,
      };
    }
  }

  /**
   * 4. Solucionar / Encerrar Chamado (ITILSolution)
   */
  static async solveTicket(
    ticketId: number,
    solutionContent: string,
    solutionTypesId?: number,
    connectorId?: string
  ): Promise<GLPIActionResult> {
    const config = await this.getConfig(connectorId);
    if (!config) {
      return {
        success: false,
        action: 'solve_ticket',
        ticketId,
        message: 'API REST do GLPI não configurada.',
      };
    }

    try {
      const payload = {
        input: {
          items_id: ticketId,
          itemtype: 'Ticket',
          content: solutionContent,
          solutiontypes_id: solutionTypesId || 1,
          status: 5, // Solucionado
        },
      };

      const result = await this.request(config, `Ticket/${ticketId}/ITILSolution`, 'POST', payload);
      return {
        success: true,
        action: 'solve_ticket',
        ticketId,
        message: `Solução/Encerramento registrado com sucesso para o chamado #${ticketId}! Status alterado para Solucionado.`,
        data: result,
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'solve_ticket',
        ticketId,
        message: `Erro ao registrar solução para o chamado #${ticketId}: ${err.message}`,
        error: err.message,
      };
    }
  }

  /**
   * Extrai o ID do chamado a partir do texto atual ou do histórico recente da conversa.
   */
  private static extractTicketId(text: string, contextHistory?: string): number | undefined {
    // 1. Procurar no texto atual
    const matchCurrent = text.match(/(?:chamado|ticket|id)\s*#?\s*(\d{1,9})/i) || text.match(/#(\d{1,9})/);
    if (matchCurrent && matchCurrent[1]) {
      return parseInt(matchCurrent[1], 10);
    }

    // 2. Se não encontrou no texto atual, procurar no histórico da conversa (do mais recente para o mais antigo)
    if (contextHistory) {
      const historyMatches = Array.from(contextHistory.matchAll(/(?:chamado|ticket|id)\s*#?\s*(\d{1,9})/gi));
      if (historyMatches.length > 0) {
        const lastMatch = historyMatches[historyMatches.length - 1];
        if (lastMatch && lastMatch[1]) {
          return parseInt(lastMatch[1], 10);
        }
      }

      const hashMatches = Array.from(contextHistory.matchAll(/#(\d{3,9})/g));
      if (hashMatches.length > 0) {
        const lastHash = hashMatches[hashMatches.length - 1];
        if (lastHash && lastHash[1]) {
          return parseInt(lastHash[1], 10);
        }
      }
    }

    return undefined;
  }

  /**
   * Parser inteligente de ações: analisa se o texto do usuário solicita uma ação executável no GLPI,
   * com suporte a resolução contextual de ID de chamado (ex: "encerre este chamado...").
   */
  static parseActionIntent(text: string, contextHistory?: string): {
    isAction: boolean;
    actionType?: 'add_followup' | 'update_priority' | 'assign_tech' | 'solve_ticket';
    ticketId?: number;
    content?: string;
    priorityValue?: number;
    techNameOrId?: string;
  } {
    const textLower = text.toLowerCase().trim();
    const resolvedTicketId = this.extractTicketId(text, contextHistory);

    // 1. Solucionar / Encerrar / Fechar Chamado
    // Ex: "encerre este chamado por favor motivo: encerrado por teste de IA" ou "resolver chamado 123 com a solução: troca de cabo"
    const solveKeywords = ['encerr', 'solucion', 'resolv', 'fech', 'finaliz'];
    const isSolveIntent = solveKeywords.some((k) => textLower.includes(k));

    if (isSolveIntent) {
      // Extrair o motivo / solução
      let solutionText = '';
      const motifMatch = text.match(/(?:motivo|solu[çc][ãa]o|justificativa|com\s+a\s+solu[çc][ãa]o|com\s+o\s+motivo)\s*[:\-]?\s*(.+)/i);
      if (motifMatch && motifMatch[1]) {
        solutionText = motifMatch[1].trim();
      } else {
        // Se não tiver prefixo 'motivo:', pega o que vem após dois pontos ':'
        const colonMatch = text.match(/:\s*(.+)/);
        if (colonMatch && colonMatch[1]) {
          solutionText = colonMatch[1].trim();
        } else {
          solutionText = 'Encerrado e solucionado via Oráculo IA a pedido do usuário.';
        }
      }

      if (resolvedTicketId) {
        return {
          isAction: true,
          actionType: 'solve_ticket',
          ticketId: resolvedTicketId,
          content: solutionText,
        };
      }
    }

    // 2. Adicionar Acompanhamento / Followup
    // Ex: "adicionar acompanhamento no chamado: teste realizado" ou "adicione nota neste chamado: aguardando usuário"
    const followupKeywords = ['acompanhamento', 'followup', 'follow-up', 'nota no chamado', 'comentário no chamado', 'comentario no chamado'];
    const isFollowupIntent = followupKeywords.some((k) => textLower.includes(k)) ||
      (textLower.includes('adicione') && (textLower.includes('chamado') || textLower.includes('ticket')));

    if (isFollowupIntent && !isSolveIntent) {
      let followupContent = '';
      const colonMatch = text.match(/:\s*(.+)/);
      if (colonMatch && colonMatch[1]) {
        followupContent = colonMatch[1].trim();
      } else {
        const textClean = text.replace(/^(?:adicion(?:ar|e)|inseri(?:r|a)|cri(?:ar|e)|regist(?:rar|re))\s+(?:acompanhamento|followup|nota|coment[áa]rio)?\s*(?:no|ao|neste|nesse|este)?\s*(?:chamado|ticket)?\s*#?\d*\s*/i, '').trim();
        followupContent = textClean || 'Acompanhamento registrado via Oráculo IA.';
      }

      if (resolvedTicketId) {
        return {
          isAction: true,
          actionType: 'add_followup',
          ticketId: resolvedTicketId,
          content: followupContent,
        };
      }
    }

    // 3. Alterar Prioridade
    // Ex: "mudar prioridade deste chamado para urgente" ou "alterar prioridade para alta"
    if (textLower.includes('prioridade')) {
      let prioVal = 3; // Média
      if (textLower.includes('muito baixa')) prioVal = 1;
      else if (textLower.includes('baixa')) prioVal = 2;
      else if (textLower.includes('média') || textLower.includes('media')) prioVal = 3;
      else if (textLower.includes('alta') && !textLower.includes('muito')) prioVal = 4;
      else if (textLower.includes('muito alta') || textLower.includes('urgente') || textLower.includes('crítica') || textLower.includes('critica')) prioVal = 5;
      else if (textLower.includes('maior')) prioVal = 6;

      if (resolvedTicketId) {
        return {
          isAction: true,
          actionType: 'update_priority',
          ticketId: resolvedTicketId,
          priorityValue: prioVal,
        };
      }
    }

    // 4. Atribuir Técnico
    // Ex: "atribuir este chamado ao técnico Carlos" ou "atribuir para Lucas"
    const assignRegex = /(?:atribu(?:ir|a)|direcion(?:ar|e)|repass(?:ar|e))\s+(?:o\s+|este\s+|esse\s+)?(?:chamado|ticket)?\s*#?\d*\s+(?:ao|para|ao\s+t[ée]cnico|para\s+o\s+t[ée]cnico)\s+([a-zA-ZÀ-ÿ0-9\s]+)/i;
    const aMatch = text.match(assignRegex);
    if (aMatch && aMatch[1] && resolvedTicketId) {
      return {
        isAction: true,
        actionType: 'assign_tech',
        ticketId: resolvedTicketId,
        techNameOrId: aMatch[1].trim(),
      };
    }

    return { isAction: false };
  }
}
