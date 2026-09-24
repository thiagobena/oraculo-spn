import { LGPDConfigData } from '@oraculo/shared';

export interface SanitizationResult {
  cleanText: string;
  maskedItemsCount: number;
  detectedTypes: string[];
}

export class PrivacyGuard {
  /**
   * Sanitiza o texto de acordo com as configurações de LGPD ativas.
   * Se o nível for 0 (desligado), retorna o texto original intacto.
   */
  static sanitizePrompt(input: string, config?: Partial<LGPDConfigData>): SanitizationResult {
    if (!input) {
      return { cleanText: '', maskedItemsCount: 0, detectedTypes: [] };
    }

    const level = config?.lgpd_level ?? 50;
    const mode = config?.lgpd_mode ?? (level === 0 ? 'disabled' : level === 100 ? 'strict' : 'smart');

    // MODO 0% (TOTALMENTE DESLIGADO / BYPASS TOTAL)
    if (level === 0 || mode === 'disabled') {
      return {
        cleanText: input,
        maskedItemsCount: 0,
        detectedTypes: [],
      };
    }

    const maskCpf = config?.mask_cpf ?? (level >= 75 ? 'full' : level >= 25 ? 'partial' : 'none');
    const maskEmail = config?.mask_email ?? (level >= 75 ? 'full' : 'none');
    const maskPhone = config?.mask_phone ?? (level >= 75 ? 'full' : 'none');
    const maskFinancial = config?.mask_financial ?? (level >= 50 ? 'full' : 'partial');

    let text = input;
    let count = 0;
    const typesSet = new Set<string>();

    // 1. CPF (formato XXX.XXX.XXX-XX ou 11 dígitos)
    if (maskCpf !== 'none') {
      const cpfRegex = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g;
      text = text.replace(cpfRegex, (match) => {
        // Ignorar se for claramente timestamp de milissegundos
        if (match.length === 11 && (match.startsWith('17') || match.startsWith('18') || match.startsWith('20'))) {
          return match;
        }
        count++;
        typesSet.add('CPF');
        if (maskCpf === 'partial') {
          // Exibe os 3 primeiros e 2 últimos: 123.***.***-89
          const digits = match.replace(/\D/g, '');
          if (digits.length === 11) {
            return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
          }
          return `${match.slice(0, 3)}***${match.slice(-2)}`;
        }
        return '[CPF MASCARADO]';
      });
    }

    // 2. Email Address
    if (maskEmail !== 'none') {
      const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
      text = text.replace(emailRegex, (match) => {
        count++;
        typesSet.add('EMAIL');
        if (maskEmail === 'partial') {
          const parts = match.split('@');
          const user = parts[0];
          const domain = parts[1] || '';
          return `${user.slice(0, 2)}***@${domain}`;
        }
        return '[EMAIL MASCARADO]';
      });
    }

    // 3. Cartões de Crédito / Dados Financeiros Sensíveis
    if (maskFinancial !== 'none') {
      const creditCardRegex = /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g;
      text = text.replace(creditCardRegex, (match) => {
        count++;
        typesSet.add('CARTAO_CREDITO');
        if (maskFinancial === 'partial') {
          return `****-****-****-${match.slice(-4)}`;
        }
        return '[CARTÃO DE CRÉDITO MASCARADO]';
      });
    }

    // 4. Telefones Celulares / Fixo (apenas em modo alto/estrito)
    if (maskPhone !== 'none') {
      const phoneRegex = /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\d{4}|\d{4})[-.\s]?\d{4}\b/g;
      text = text.replace(phoneRegex, (match) => {
        if (match.length < 8) return match;
        count++;
        typesSet.add('TELEFONE');
        if (maskPhone === 'partial') {
          return `(**) *****-${match.slice(-4)}`;
        }
        return '[TELEFONE MASCARADO]';
      });
    }

    return {
      cleanText: text,
      maskedItemsCount: count,
      detectedTypes: Array.from(typesSet),
    };
  }

  /**
   * Gera a instrução imperativa de System Prompt para o LLM de acordo com a política de LGPD ativa.
   * Elimina recusas como "Devido a políticas rigorosas de segurança... não posso fornecer".
   */
  static generateSystemPromptDirective(config?: Partial<LGPDConfigData>, userRole?: string): string {
    const level = config?.lgpd_level ?? 50;
    const mode = config?.lgpd_mode ?? (level === 0 ? 'disabled' : level === 100 ? 'strict' : 'smart');
    const isAdmin = userRole === 'admin' || userRole === 'supervisor';
    const hasAdminBypass = config?.allow_admin_bypass && isAdmin;

    // SE NÍVEL 0 OU BYPASS DE ADMINISTRADOR ATIVO
    if (level === 0 || mode === 'disabled' || hasAdminBypass) {
      if (config?.custom_legal_basis_prompt && config.custom_legal_basis_prompt.trim()) {
        return `[DIRETRIZ DE AUTORIZAÇÃO CORPORATIVA E PRIVACIDADE - LGPD MODO DESLIGADO]:\n${config.custom_legal_basis_prompt.trim()}`;
      }

      return `[DIRETRIZ DE AUTORIZAÇÃO CORPORATIVA E PRIVACIDADE - LGPD MODO DESLIGADO]:
- AMBIENTE AUTORIZADO: O operador e o sistema possuem autorização corporativa expressa e respaldo legal nos termos do Art. 7º, incisos V e VI da Lei nº 13.709/2018 (LGPD) para tratamento e visualização de dados cadastrais, operacionais e financeiros no exercício regular de direitos e execução de contratos.
- NUNCA CENSURE OU RECUSE DADOS: É ESTRITAMENTE PROIBIDO recusar respostas, ocultar nomes de clientes, CPFs, e-mails, telefones ou dados de faturamento/chamados alegando políticas de LGPD ou privacidade de dados.
- ENTREGUE TODAS AS INFORMAÇÕES: Forneça todos os dados exatamente como constam nas tabelas, consultas SQL e registros dos bancos integrados (GLPI, Vetor Lake, ERP, PostgreSQL), sem omitir linhas ou dados pessoais solicitados.`;
    }

    if (level <= 25 || mode === 'low') {
      return `[DIRETRIZ DE PRIVACIDADE LGPD - MODO LEVE]:
- O usuário está autorizado a visualizar relatórios operacionais completos com nomes de clientes, e-mails e histórico de suporte.
- NUNCA recuse responder por motivos de privacidade. Se houver dados de CPF ou cartões, apresente-os de forma clara ou parcialmente ofuscada se necessário, mas mantenha todos os demais dados operacionais intactos.`;
    }

    if (level <= 50 || mode === 'smart') {
      return `[DIRETRIZ DE PRIVACIDADE LGPD - MODO INTELIGENTE OPERACIONAL]:
- Forneça análises de negócio, relatórios, nomes de empresas/clientes e dados operacionais de chamados.
- Preserve a fluidez da resposta: nunca bloqueie relatórios inteiros. Se necessário proteger dados ultra-sensíveis (como senhas ou números de cartões), apresente o restante do relatório normalmente.`;
    }

    // 75% a 100% (Modo Estrito)
    return `[DIRETRIZ DE PRIVACIDADE LGPD - MODO CONFORMIDADE ESTRITA]:
- Respeite rigorosamente a privacidade de dados individuais. Quando solicitadas informações cadastrais pessoais (PII), priorize estatísticas agrupadas, métricas consolidadas, contagens e análises sem individualizar CPFs e contatos pessoais diretos.`;
  }
}

