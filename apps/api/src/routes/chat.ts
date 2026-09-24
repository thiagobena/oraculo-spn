import { FastifyInstance } from 'fastify';
import { SendMessageSchema, UserFeedbackSchema } from '@oraculo/shared';
import { LMStudioProvider, ContextManager, ChatCompletionMessage, ChatMessageContentPart, PrivacyGuard } from '@oraculo/ai-core';
import { prisma } from '../db/prisma.js';
import { ConversationService } from '../services/ConversationService.js';
import { AuditService } from '../services/AuditService.js';
import { QuotaService } from '../services/QuotaService.js';
import { TelemetryService } from '../services/TelemetryService.js';
import { DatabaseService } from '../services/DatabaseService.js';
import { GLPIService } from '../services/GLPIService.js';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

async function selectOptimalModelAsync(
  requestedModel: string,
  content: string,
  hasImages: boolean,
  availableModels: any[],
  provider: LMStudioProvider,
  clientName: string = 'Usuário'
): Promise<{ selectedModelKey: string; reason: string; wasAutoSelected: boolean }> {
  if (requestedModel !== 'auto' && requestedModel !== 'auto-select' && requestedModel !== '') {
    return { selectedModelKey: requestedModel, reason: 'Seleção manual do usuário', wasAutoSelected: false };
  }

  if (availableModels.length === 0) {
    return { selectedModelKey: requestedModel, reason: 'Nenhum modelo disponível', wasAutoSelected: false };
  }

  const speedMetrics = await TelemetryService.getModelSpeedMetrics(provider, 50);
  const textLower = content.toLowerCase();

  let intent = 'Geral / Conversa Direta';
  let candidateScores: Array<{ model_key: string; avg_tps: number; score: number }> = [];

  // 1. Has Images or Visual Intent
  if (
    hasImages ||
    textLower.includes('imagem') ||
    textLower.includes('foto') ||
    textLower.includes('print') ||
    textLower.includes('gráfico') ||
    textLower.includes('diagrama')
  ) {
    intent = 'Visão / Anexo de Imagem';
    const visionModels = availableModels.filter((m) => m.capabilities?.vision);
    if (visionModels.length > 0) {
      const scoredVisionModels = visionModels.map((m) => {
        const metric = speedMetrics.find((s) => s.model_key === m.key);
        const avgTps = metric ? metric.avg_tps_last_50 : 25.0;
        const loadedBonus = m.is_loaded ? 5.0 : 0.0;
        const isGemma = m.key.toLowerCase().includes('gemma');
        const gemmaBonus = isGemma ? 15.0 : 0.0; // Bônus para priorizar Gemma Vision pela alta velocidade de inferência
        const score = parseFloat((avgTps + loadedBonus + gemmaBonus).toFixed(1));

        return {
          model_key: m.key,
          display_name: m.display_name || m.key,
          avg_tps: avgTps,
          score,
        };
      });

      scoredVisionModels.sort((a, b) => b.score - a.score);
      candidateScores = scoredVisionModels.map((c) => ({ model_key: c.model_key, avg_tps: c.avg_tps, score: c.score }));

      const bestVision = scoredVisionModels[0];
      const selectedModelKey = bestVision.model_key;
      const reason = `Detectada solicitação ou anexo de Imagem. Roteado dinamicamente por desempenho para o modelo especialista ${bestVision.display_name} (~${bestVision.avg_tps} tok/s).`;
      await logRouterDecision(clientName, requestedModel, selectedModelKey, intent, reason, candidateScores);
      return { selectedModelKey, reason, wasAutoSelected: true };
    }
  }

  // 2. Code / SQL / Programming Intent
  const codeRegex = /\b(code|codigo|código|sql|t-sql|function|script|bug|error|erro|select|table|query|class|interface|import|react|fastify|python|typescript|javascript|c#|cpp|html|css|json|api)\b/i;
  if (codeRegex.test(textLower)) {
    intent = 'Programação / Código / SQL';
    const coderModels = availableModels.filter((m) => m.capabilities?.tools || m.key.toLowerCase().includes('coder') || m.key.toLowerCase().includes('code'));
    if (coderModels.length > 0) {
      const scoredCoderModels = coderModels.map((m) => {
        const metric = speedMetrics.find((s) => s.model_key === m.key);
        const avgTps = metric ? metric.avg_tps_last_50 : 25.0;
        const loadedBonus = m.is_loaded ? 5.0 : 0.0;
        const score = parseFloat((avgTps + loadedBonus).toFixed(1));

        return {
          model_key: m.key,
          display_name: m.display_name || m.key,
          avg_tps: avgTps,
          score,
        };
      });

      scoredCoderModels.sort((a, b) => b.score - a.score);
      candidateScores = scoredCoderModels.map((c) => ({ model_key: c.model_key, avg_tps: c.avg_tps, score: c.score }));

      const bestCoder = scoredCoderModels[0];
      const selectedModelKey = bestCoder.model_key;
      const reason = `Detectado contexto de Programação/SQL. Roteado para o modelo especialista ${bestCoder.display_name} (~${bestCoder.avg_tps} tok/s).`;
      await logRouterDecision(clientName, requestedModel, selectedModelKey, intent, reason, candidateScores);
      return { selectedModelKey, reason, wasAutoSelected: true };
    }
  }

  // 3. Deep Reasoning / Math Intent
  const reasoningRegex = /\b(calcule|raciocínio|raciocinio|matemática|matematica|analise em detalhes|passo a passo|provar|provacao|equacao)\b/i;
  if (reasoningRegex.test(textLower)) {
    intent = 'Raciocínio Profundo / Lógica';
    const reasoningModels = availableModels.filter((m) => m.capabilities?.reasoning || m.key.toLowerCase().includes('r1') || m.key.toLowerCase().includes('think'));
    if (reasoningModels.length > 0) {
      const scoredReasoningModels = reasoningModels.map((m) => {
        const metric = speedMetrics.find((s) => s.model_key === m.key);
        const avgTps = metric ? metric.avg_tps_last_50 : 25.0;
        const loadedBonus = m.is_loaded ? 5.0 : 0.0;
        const score = parseFloat((avgTps + loadedBonus).toFixed(1));

        return {
          model_key: m.key,
          display_name: m.display_name || m.key,
          avg_tps: avgTps,
          score,
        };
      });

      scoredReasoningModels.sort((a, b) => b.score - a.score);
      candidateScores = scoredReasoningModels.map((c) => ({ model_key: c.model_key, avg_tps: c.avg_tps, score: c.score }));

      const bestReasoning = scoredReasoningModels[0];
      const selectedModelKey = bestReasoning.model_key;
      const reason = `Detectada solicitação de Raciocínio Profundo. Roteado para ${bestReasoning.display_name} (~${bestReasoning.avg_tps} tok/s).`;
      await logRouterDecision(clientName, requestedModel, selectedModelKey, intent, reason, candidateScores);
      return { selectedModelKey, reason, wasAutoSelected: true };
    }
  }

  // 4. Performance & Speed Routing (General / Fast Queries)
  const candidates = availableModels.map((m) => {
    const metric = speedMetrics.find((s) => s.model_key === m.key);
    const avgTps = metric ? metric.avg_tps_last_50 : 25.0;
    const loadedBonus = m.is_loaded ? 5.0 : 0.0;
    const isGemma = m.key.toLowerCase().includes('gemma');
    const gemmaBonus = isGemma ? 12.0 : 0.0; // Bônus para priorizar Gemma em pesquisas gerais pela velocidade
    const score = parseFloat((avgTps + loadedBonus + gemmaBonus).toFixed(1));

    return {
      model_key: m.key,
      display_name: m.display_name || m.key,
      avg_tps: avgTps,
      score,
    };
  });

  candidates.sort((a, b) => b.score - a.score);
  candidateScores = candidates.map((c) => ({ model_key: c.model_key, avg_tps: c.avg_tps, score: c.score }));

  const bestCandidate = candidates[0] || { model_key: availableModels[0].key, display_name: availableModels[0].key, avg_tps: 25.0, score: 25.0 };
  const selectedModelKey = bestCandidate.model_key;
  const reason = `Roteamento dinâmico por velocidade (Média das últimas 50 consultas: ${bestCandidate.avg_tps} tok/s). Modelo ${bestCandidate.display_name} selecionado por priorizar maior throughput.`;

  await logRouterDecision(clientName, requestedModel, selectedModelKey, intent, reason, candidateScores);

  return {
    selectedModelKey,
    reason,
    wasAutoSelected: true,
  };
}

async function logRouterDecision(
  clientName: string,
  requestedModel: string,
  selectedModel: string,
  intent: string,
  reason: string,
  candidates: Array<{ model_key: string; avg_tps: number; score: number }>
) {
  try {
    await prisma.auditLog.create({
      data: {
        client_id: 'system',
        client_name: clientName,
        action: 'MODEL_AUTO_ROUTE',
        model: selectedModel,
        provider: 'lmstudio',
        status: 'SUCCESS',
        details: JSON.stringify({
          requested_model: requestedModel,
          selected_model: selectedModel,
          intent,
          reason,
          candidates,
        }),
      },
    });
  } catch (e) {
    console.error('Falha ao registrar auditoria de roteamento:', e);
  }
}

export function registerChatRoutes(fastify: FastifyInstance, provider: LMStudioProvider) {
  const activeGenerations = new Map<string, AbortController>();

  fastify.post('/api/chat/generate', async (req, reply) => {
    const parseResult = SendMessageSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ success: false, errors: parseResult.error.format() });
    }

    const {
      conversation_id,
      content,
      model,
      assistant_id,
      client_id,
      client_name,
      attachment_ids,
      temperature,
      top_p,
      max_tokens,
    } = parseResult.data;

    let targetConvId = conversation_id;
    if (!targetConvId) {
      const initialTitle = content.replace(/^\[Estilo: .*?\]\s*/, '').slice(0, 45).trim() || 'Nova Conversa';
      const newConv = await ConversationService.createConversation({
        title: initialTitle,
        default_model: model,
        assistant_id,
        client_id,
        client_name,
      });
      targetConvId = newConv.id;
    }

    const conv = await prisma.conversation.findUnique({
      where: { id: targetConvId },
      include: {
        assistant: true,
        messages: {
          orderBy: { created_at: 'asc' },
          include: { attachments: true },
        },
      },
    });

    if (!conv) {
      return reply.status(404).send({ success: false, error: 'Conversa não encontrada' });
    }

    let attachmentsText = '';
    let hasImages = false;
    const currentImageAttachments: any[] = [];

    if (attachment_ids && attachment_ids.length > 0) {
      const attachments = await prisma.attachment.findMany({
        where: { id: { in: attachment_ids } },
      });

      for (const att of attachments) {
        if (att.mime_type.startsWith('image/')) {
          hasImages = true;
          currentImageAttachments.push(att);
        } else if (att.extracted_text) {
          const isCSV = att.original_name.endsWith('.csv') || att.mime_type.includes('csv');
          const codeLang = isCSV ? 'csv' : '';
          attachmentsText += `\n\n[Anexo Documento: ${att.original_name}]\n\`\`\`${codeLang}\n${att.extracted_text}\n\`\`\``;
        }
      }
    }

    const availableModels = await provider.listModels();
    const routerResult = await selectOptimalModelAsync(model, content, hasImages, availableModels, provider, client_name);
    const effectiveModel = routerResult.selectedModelKey;
    const isPaidModel = effectiveModel.includes('gpt') || effectiveModel.includes('claude') || effectiveModel.includes('gemini') || effectiveModel.includes('o3') || effectiveModel.includes('o1');

    if (hasImages) {
      const modelInfo = await provider.getModel(effectiveModel);
      if (!modelInfo?.capabilities?.vision) {
        return reply.status(400).send({
          success: false,
          error: 'O modelo selecionado não oferece suporte a processamento de imagens.',
        });
      }
    }

    const rawUserText = content + attachmentsText;

    // --- Carregamento de Políticas de LGPD & Privacidade ---
    const lgpdSettings = await prisma.appSetting.findMany({
      where: { key: { startsWith: 'lgpd_' } },
    });
    const lgpdMap: Record<string, string> = {};
    lgpdSettings.forEach((s) => {
      lgpdMap[s.key] = s.value;
    });

    let detectedUserRole = 'user';
    if (client_id) {
      const dbUser = await prisma.user.findFirst({
        where: { OR: [{ id: client_id }, { username: client_id }] },
      });
      if (dbUser?.role === 'ADMINISTRADOR') {
        detectedUserRole = 'admin';
      }
    }

    const currentLgpdConfig = {
      lgpd_level: lgpdMap['lgpd_level'] !== undefined ? Number(lgpdMap['lgpd_level']) : 50,
      lgpd_mode: (lgpdMap['lgpd_mode'] as any) || 'smart',
      allow_admin_bypass: lgpdMap['lgpd_allow_admin_bypass'] === 'false' ? false : true,
      mask_cpf: (lgpdMap['lgpd_mask_cpf'] as any) || 'partial',
      mask_email: (lgpdMap['lgpd_mask_email'] as any) || 'none',
      mask_phone: (lgpdMap['lgpd_mask_phone'] as any) || 'none',
      mask_financial: (lgpdMap['lgpd_mask_financial'] as any) || 'partial',
      mask_names: (lgpdMap['lgpd_mask_names'] as any) || 'none',
      audit_sensitive_access: lgpdMap['lgpd_audit_sensitive_access'] === 'false' ? false : true,
      custom_legal_basis_prompt: lgpdMap['lgpd_custom_legal_basis_prompt'] || '',
    };

    const sanitization = PrivacyGuard.sanitizePrompt(rawUserText, currentLgpdConfig);
    const fullUserText = sanitization.cleanText;

    // --- Conexão e Busca de Dados Corporativos em Tempo Real (GLPI / Vetor Lake / ERP / PostgreSQL) ---
    let databaseContextText = '';
    const textLower = fullUserText.toLowerCase();

    // 1. Detecção de Intenção GLPI / Suporte / TI
    const isGlpiQuery =
      textLower.includes('glpi') ||
      textLower.includes('chamado') ||
      textLower.includes('chamados') ||
      textLower.includes('ticket') ||
      textLower.includes('tickets') ||
      textLower.includes('incidente') ||
      textLower.includes('incidentes') ||
      textLower.includes('requisicao') ||
      textLower.includes('requisição') ||
      textLower.includes('suporte') ||
      textLower.includes('tecnico') ||
      textLower.includes('técnico') ||
      textLower.includes('mttr') ||
      textLower.includes('sla') ||
      textLower.includes('csat') ||
      textLower.includes('computador') ||
      textLower.includes('patrimonio') ||
      textLower.includes('patrimônio') ||
      textLower.includes('gmud') ||
      textLower.includes('mudança') ||
      textLower.includes('mudanca') ||
      textLower.includes('apontamento') ||
      textLower.includes('horas trabalhadas') ||
      textLower.includes('reincidência') ||
      textLower.includes('reincidencia') ||
      textLower.includes('reincidente') ||
      textLower.includes('aging') ||
      textLower.includes('balanceamento') ||
      textLower.includes('mapa de calor') ||
      textLower.includes('urgência real') ||
      textLower.includes('urgencia real') ||
      textLower.includes('urgência oculta') ||
      textLower.includes('urgencia oculta') ||
      textLower.includes('atribuir') ||
      textLower.includes('atribua') ||
      textLower.includes('solucionar') ||
      textLower.includes('resolver');

    // 2. Detecção de Intenção Vendas / Faturamento / Datalake / ERP / Varejo
    const isVendasQuery =
      textLower.includes('faturamento') ||
      textLower.includes('faturado') ||
      textLower.includes('faturar') ||
      textLower.includes('faturou') ||
      textLower.includes('venda') ||
      textLower.includes('vendas') ||
      textLower.includes('vendido') ||
      textLower.includes('vendidos') ||
      textLower.includes('loja') ||
      textLower.includes('lojas') ||
      textLower.includes('filial') ||
      textLower.includes('filiais') ||
      textLower.includes('cupom') ||
      textLower.includes('cupons') ||
      textLower.includes('nfce') ||
      textLower.includes('nfe') ||
      textLower.includes('produto') ||
      textLower.includes('produtos') ||
      textLower.includes('estoque') ||
      textLower.includes('curva abc') ||
      textLower.includes('curva') ||
      textLower.includes('dre') ||
      textLower.includes('receita') ||
      textLower.includes('despesa') ||
      textLower.includes('lucro') ||
      textLower.includes('caixa') ||
      textLower.includes('operador') ||
      textLower.includes('vendedor') ||
      textLower.includes('vendedores') ||
      textLower.includes('farmaceutico') ||
      textLower.includes('farmacêutico') ||
      textLower.includes('ticket médio') ||
      textLower.includes('ticket medio') ||
      textLower.includes('cliente') ||
      textLower.includes('clientes') ||
      textLower.includes('fidelidade') ||
      textLower.includes('fidelizado') ||
      textLower.includes('convenio') ||
      textLower.includes('convênio') ||
      textLower.includes('convenios') ||
      textLower.includes('convênios') ||
      textLower.includes('medicamento') ||
      textLower.includes('medicamentos') ||
      textLower.includes('perfumaria') ||
      textLower.includes('fabricante') ||
      textLower.includes('laboratorio') ||
      textLower.includes('laboratório') ||
      textLower.includes('unipreco') ||
      textLower.includes('unipreço') ||
      textLower.includes('vetor') ||
      textLower.includes('datalake') ||
      textLower.includes('lake') ||
      textLower.includes('meta') ||
      textLower.includes('metas') ||
      textLower.includes('forecast') ||
      textLower.includes('projeção') ||
      textLower.includes('projecao') ||
      textLower.includes('run-rate') ||
      textLower.includes('run rate') ||
      textLower.includes('previsão') ||
      textLower.includes('previsao') ||
      textLower.includes('mom') ||
      textLower.includes('yoy') ||
      textLower.includes('same-store') ||
      textLower.includes('same store') ||
      textLower.includes('fraude') ||
      textLower.includes('fraudes') ||
      textLower.includes('perda') ||
      textLower.includes('perdas') ||
      textLower.includes('prevenção') ||
      textLower.includes('prevencao') ||
      textLower.includes('cancelamento') ||
      textLower.includes('cancelamentos') ||
      textLower.includes('desconto') ||
      textLower.includes('descontos') ||
      textLower.includes('estorno') ||
      textLower.includes('estornos');

    // 2.1 Detecção de Correlação Cruzada GLPI + Vetor Lake (Impacto de TI em Vendas)
    const isCrossCorrelation =
      (textLower.includes('impacto') || textLower.includes('correlacao') || textLower.includes('correlação') || textLower.includes('cruzamento') || textLower.includes('cruzada')) &&
      (textLower.includes('glpi') || textLower.includes('ti') || textLower.includes('chamado') || textLower.includes('pdv') || textLower.includes('queda') || textLower.includes('lentid')) &&
      (textLower.includes('venda') || textLower.includes('faturamento') || textLower.includes('loja') || textLower.includes('prejuizo') || textLower.includes('prejuízo'));

    // 3. Detecção Genérica de Consulta a Dados
    const isGenericDbQuery =
      textLower.includes('banco de dados') ||
      textLower.includes('consultar') ||
      textLower.includes('consulta') ||
      textLower.includes('relatório') ||
      textLower.includes('relatorio') ||
      textLower.includes('tabela') ||
      textLower.includes('tabelas') ||
      textLower.includes('volumetria') ||
      textLower.includes('quantos') ||
      textLower.includes('quanto') ||
      textLower.includes('total') ||
      textLower.includes('totais') ||
      textLower.includes('resumo') ||
      textLower.includes('ranking') ||
      textLower.includes('top 10') ||
      textLower.includes('top 20') ||
      textLower.includes('top 5');

    const isDatabaseQuery = isGlpiQuery || isVendasQuery || isGenericDbQuery;

    if (isDatabaseQuery) {
      try {
        const activeConnectors = await (prisma as any).databaseConnector.findMany({
          where: { is_active: true },
        });

        if (activeConnectors.length > 0) {
          // Conectores especializados
          const glpiConn = activeConnectors.find(
            (c: any) =>
              (c.name && c.name.toLowerCase().includes('glpi')) ||
              (c.database && c.database.toLowerCase().includes('glpi'))
          );

          const salesLakeConn = activeConnectors.find(
            (c: any) =>
              (c.name && (c.name.toLowerCase().includes('vetor') || c.name.toLowerCase().includes('lake') || c.name.toLowerCase().includes('venda') || c.name.toLowerCase().includes('erp'))) ||
              (c.database && (c.database.toLowerCase().includes('unipreco') || c.database.toLowerCase().includes('datalake') || c.database.toLowerCase().includes('erp') || c.database.toLowerCase().includes('vendas'))) ||
              (c.db_type === 'postgresql' || c.db_type === 'sqlserver')
          );

          // Verificar se o usuário mencionou explicitamente o nome de algum conector ativo
          const explicitConn = activeConnectors.find(
            (c: any) => c.name && textLower.includes(c.name.toLowerCase().trim())
          );

          // Roteamento inteligente por domínio e intenção
          let targetConn = explicitConn;
          if (!targetConn) {
            if (isVendasQuery && salesLakeConn) {
              targetConn = salesLakeConn;
            } else if (isGlpiQuery && glpiConn) {
              targetConn = glpiConn;
            } else {
              targetConn = salesLakeConn || glpiConn || activeConnectors[0];
            }
          }

          if (isCrossCorrelation) {
            const crossRes = await DatabaseService.crossCorrelateGLPIAndVetorLake();
            if (crossRes.success) {
              databaseContextText = `\n\n[ANÁLISE DE CORRELAÇÃO CRUZADA: TI (GLPI) x VENDAS (VETOR LAKE)]:\n` +
                `Resumo: ${crossRes.summary}\n` +
                `Incidentes Operacionais Localizados no GLPI (${crossRes.incidentsFound}):\n` +
                `${JSON.stringify(crossRes.glpiIncidents?.slice(0, 15), null, 2)}\n\n` +
                `Médias e Faturamento das Lojas no Vetor Lake:\n` +
                `${JSON.stringify(crossRes.storeBaselines?.slice(0, 15), null, 2)}\n` +
                `[FIM DA CORRELAÇÃO CRUZADA - Responda correlacionando o impacto dos chamados no faturamento]`;
            }
          } else if (targetConn) {
            const isGlpi =
              (targetConn.name && targetConn.name.toLowerCase().includes('glpi')) ||
              (targetConn.database && targetConn.database.toLowerCase().includes('glpi'));

            if (isGlpi && targetConn.category === 'database') {
              const recentHistory = (conv.messages || [])
                .slice(-6)
                .map((m) => m.content)
                .join('\n');
              databaseContextText = await GLPIService.fetchGLPIDataContext(targetConn.id, fullUserText, targetConn.name, recentHistory);
            } else if (targetConn.mode === 'live_query') {
              // Conector Analítico / Datalake / ERP via NL2SQL com Auto-Healing e Suporte a Afunilamento (Histórico)
              const recentHistoryObjects = (conv.messages || []).slice(-6).map((m) => ({
                role: m.role,
                content: m.content,
              }));

              const nlRes = await DatabaseService.generateNL2SQL(targetConn.id, fullUserText, recentHistoryObjects);
              if (nlRes.success && nlRes.generated_query) {
                try {
                  const queryRes = await DatabaseService.executeQueryWithAutoHealing(
                    targetConn.id,
                    fullUserText,
                    nlRes.generated_query,
                    { generateSummary: true }
                  );

                  if (queryRes.success) {
                    const finalSql = queryRes.finalSql || nlRes.generated_query;
                    if (queryRes.rows && queryRes.rows.length > 0) {
                      databaseContextText = `\n\n[DADOS CONSULTADOS EM TEMPO REAL NO CONECTOR "${targetConn.name}"]:\n` +
                        `Consulta SQL Executada: ${finalSql}\n` +
                        (queryRes.wasHealed ? `(Nota: Consulta passou por auto-correção via IA para compatibilidade de esquema).\n` : '') +
                        `Total de Registros Retornados: ${queryRes.rows.length}\n` +
                        `Dados Retornados:\n${JSON.stringify(queryRes.rows.slice(0, 30), null, 2)}\n` +
                        (queryRes.ai_summary ? `Resumo Analítico da IA: ${queryRes.ai_summary}\n` : '') +
                        `\nDIRETRIZ DE VISUALIZAÇÃO E PRECISÃO:\n` +
                        `- Apresente os dados com fidelidade absoluta aos registros retornados acima. Proibido inventar produtos, lojas ou valores adicionais.\n` +
                        `- Quando a resposta envolver métricas comparativas ou rankings, inclua ao final da resposta um bloco json de gráfico interativo exatamente no formato:\n` +
                        `\`\`\`json\n{\n  "type": "${nlRes.visualization_suggestion === 'pie_chart' ? 'pie' : nlRes.visualization_suggestion === 'line_chart' ? 'line' : 'bar'}",\n  "title": "${nlRes.explanation || 'Gráfico Analítico'}",\n  "data": [\n    { "name": "Nome Real Retornado", "value": 123.45 }\n  ]\n}\n\`\`\`\n` +
                        `[FIM DOS DADOS EM TEMPO REAL]`;
                    } else {
                      databaseContextText = `\n\n[DADOS CONSULTADOS EM TEMPO REAL NO CONECTOR "${targetConn.name}"]:\n` +
                        `Consulta SQL Executada: ${finalSql}\n` +
                        `Resultado: A consulta foi executada com sucesso no banco de dados corporativo, porém retornou 0 registros para os filtros informados (nenhuma venda/dado localizado na data ou filial especificada).\n` +
                        `DIRETRIZ OBRIGATÓRIA ANTI-ALUCINAÇÃO:\n` +
                        `- Informe com precisão ao usuário que a base de dados corporativa foi consultada e retornou zero registros para esses critérios.\n` +
                        `- NUNCA invente dados fictícios, produtos genéricos ou simulações. NUNCA gere gráficos com dados inventados.\n` +
                        `[FIM DOS DADOS EM TEMPO REAL]`;
                    }
                  } else {
                    databaseContextText = `\n\n[AVISO DE ERRO NA CONSULTA CORPORATIVA]:\nA consulta gerada não pôde ser executada com sucesso no conector "${targetConn.name}": ${queryRes.error || 'Erro desconhecido na execução'}.\n` +
                      `DIRETRIZ OBRIGATÓRIA ANTI-ALUCINAÇÃO: Informe ao usuário com transparência que houve uma falha técnica ao consultar a base corporativa e que não é possível exibir os dados de vendas no momento. NUNCA invente produtos ou números fictícios.`;
                  }
                } catch (execErr: any) {
                  console.warn(`[chat.ts] Falha na execução da consulta com auto-healing:`, execErr.message);
                  databaseContextText = `\n\n[AVISO DE FALHA NA CONSULTA CORPORATIVA]:\nHouve um erro ao executar a consulta no conector "${targetConn.name}": ${execErr.message}.\n` +
                    `DIRETRIZ OBRIGATÓRIA ANTI-ALUCINAÇÃO: Informe com transparência ao usuário que a consulta corporativa falhou e não foi possível obter os dados. NUNCA invente dados fictícios.`;
                }
              } else {
                databaseContextText = `\n\n[AVISO DE INDISPONIBILIDADE DE CONSULTA]:\nNão foi possível formular uma consulta válida para os dados do conector "${targetConn.name}" (${nlRes.error || 'Falha na formulação SQL'}).\n` +
                  `DIRETRIZ OBRIGATÓRIA ANTI-ALUCINAÇÃO: Avise o usuário que não foi possível consultar os dados corporativos no momento e sugira reformular a pergunta. NUNCA invente nomes de produtos, lojas ou valores de vendas fictícios.`;
              }
            }

            // Injetar Alertas Proativos e Anomalias Detectadas
            try {
              const anomalies = await DatabaseService.detectAnomalies(targetConn.id);
              if (anomalies && anomalies.length > 0) {
                const anomalySummary = anomalies
                  .map(a => `### [${a.level.toUpperCase()}] ${a.title}\n${a.message}`)
                  .join('\n\n');
                databaseContextText += `\n\n[ALERTAS OPERACIONAIS E ANOMALIAS CRÍTICAS EM TEMPO REAL]:\n${anomalySummary}\n\n` +
                  `DIRETRIZ DE APRESENTAÇÃO DOS ALERTAS OPERACIONAIS:\n` +
                  `- Se a pergunta do usuário tiver afinidade com estoque, abastecimento, rupturas, perdas, auditoria ou compras, apresente estes alertas de forma executiva, detalhando os produtos mais afetados, filiais e ações recomendadas.\n` +
                  `- Se a pergunta for sobre um assunto específico que NÃO tem relação com estoque ou alertas (ex: ranking de vendas de lojas hoje, metas ou atendentes), concentre-se na resposta direta da pergunta e NÃO polua o texto principal com alertas não solicitados, a menos que o usuário peça um panorama geral da rede.`;
              }
            } catch (_) {}
          }
        }
      } catch (err: any) {
        console.error('Erro ao consultar conector de dados no chat:', err);
        databaseContextText = `\n\n[AVISO DE FALHA EM CONECTOR DE DADOS]:\nHouve uma falha técnica ao tentar consultar a base de dados corporativa: ${err.message}.\nDIRETRIZ OBRIGATÓRIA: Informe ao usuário que a base de dados corporativa está temporariamente indisponível. NUNCA invente dados ou produtos fictícios.`;
      }

      if (isDatabaseQuery && !databaseContextText) {
        databaseContextText = `\n\n[AVISO DE SISTEMA]: A pergunta requer dados corporativos (vendas/produtos/lojas/chamados), mas nenhum conector de dados ativo foi encontrado ou está disponível no momento.\nDIRETRIZ OBRIGATÓRIA: Informe claramente que não há conexão com o banco de dados corporativo disponível para responder à pergunta. Não invente produtos ou números.`;
      }
    }

    // --- Verificação de Cota e Autorização do Usuário ---
    let dbUser = await prisma.user.findFirst({
      where: { OR: [{ id: client_id }, { username: client_id }] },
    });

    if (dbUser && isPaidModel) {
      const quotaCheck = await QuotaService.checkUserQuota(dbUser.id, isPaidModel);
      if (!quotaCheck.allowed) {
        return reply.status(403).send({
          success: false,
          error: quotaCheck.message || 'Cota de tokens para IAs pagas atingida.',
        });
      }
    }

    const userMessage = await prisma.message.create({
      data: {
        conversation_id: targetConvId,
        role: 'user',
        content: fullUserText,
        model: effectiveModel,
        provider: isPaidModel ? 'cloud' : 'lmstudio',
        client_id,
        client_name,
        metadata: sanitization.maskedItemsCount > 0 ? JSON.stringify({ lgpd_masked: true, types: sanitization.detectedTypes }) : undefined,
        attachments: attachment_ids && attachment_ids.length > 0
          ? { connect: attachment_ids.map((id) => ({ id })) }
          : undefined,
      },
    });

    const dbModelSetting = await prisma.modelSetting.findUnique({
      where: { model_key: effectiveModel },
    });

    const globalSetting = await prisma.appSetting.findUnique({ where: { key: 'global_system_prompt' } });
    const globalPrompt = globalSetting?.value || '';
    const assistantPrompt = conv.assistant?.system_prompt || '';
    const modelSystemPrompt = dbModelSetting?.system_prompt || '';
    const strictFormatPrompt = 'IMPORTANTE: Forneça respostas diretas, limpas e objetivas. Nunca inclua narração de cenários, efeitos visuais, efeitos sonoros ou interpretação de papéis/ambiente entre parênteses.';

    const enterpriseAntiHallucinationPrompt = `[DIRETRIZ DE PRECISÃO ABSOLUTA E ANTI-ALUCINAÇÃO CORPORATIVA]:
Você é o ORÁCULO SPN, assistente oficial de inteligência corporativa e dados empresariais.
1. PRECISÃO EM DADOS: Ao responder sobre vendas, faturamento, produtos, estoque, lojas, clientes, cupons ou chamados de TI, baseie-se ESTRITAMENTE nos dados contidos no bloco [DADOS CONSULTADOS EM TEMPO REAL].
2. TOLERÂNCIA ZERO PARA ALUCINAÇÕES: É TERMINANTEMENTE PROIBIDO inventar, supor ou estimar nomes de produtos (ex: NUNCA mencione produtos de e-commerce genéricos como eletrônicos/Smart TVs/Notebooks quando a rede comercializa produtos farmacêuticos, higiene, perfumaria e conveniência), lojas, quantidades ou valores financeiros.
3. CONSULTAS SEM DADOS OU COM FALHA: Se o bloco de dados corporativos indicar zero registros, falha técnica ou conector indisponível, informe isso com total transparência e objetividade ao usuário. NUNCA preencha a resposta com tabelas ou gráficos com dados fictícios.
4. GRÁFICOS INTERATIVOS: Apenas inclua blocos de gráfico interativo (\`\`\`chart ou \`\`\`json) quando existirem dados numéricos reais retornados pelo banco para plotar. NUNCA gere gráficos com dados fictícios ou de exemplo (como "Item A", "Item B").`;

    const nowBR = new Date();
    const dataAtualBR = nowBR.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); // DD/MM/AAAA
    const horaAtualBR = nowBR.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }); // HH:MM:SS
    const diaSemanaBR = nowBR.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' });

    const temporalAndFormattingPrompt = `[INFORMAÇÃO TEMPORAL E DIRETRIZES DE FORMATAÇÃO DO SISTEMA]:
- Data Atual Oficial: ${dataAtualBR} (${diaSemanaBR.charAt(0).toUpperCase() + diaSemanaBR.slice(1)})
- Hora Atual Oficial: ${horaAtualBR} (Horário de Brasília - UTC-3)
- REGRAS OBRIGATÓRIAS DE FORMATAÇÃO:
  1. Em TODAS as respostas que envolverem datas (incluindo chamados, prazos, relatórios ou perguntas diretas de data), utilize OBRIGATORIAMENTE o formato DD/MM/AAAA (ex: ${dataAtualBR}).
  2. Em TODAS as respostas que envolverem horários, utilize OBRIGATORIAMENTE o formato HH:MM:SS (ex: ${horaAtualBR}) ou HH:MM.
  3. Quando perguntado sobre o dia de hoje, a data ou a hora atual, responda DIRETAMENTE com a data e hora do sistema informadas acima. NUNCA utilize placeholders como "[Inserir Data Atual]" ou afirme que não possui relógio em tempo real.
  4. GERAÇÃO DE GRÁFICOS INTERATIVOS: Sempre que o usuário solicitar gráficos ou quando houver dados numéricos reais retornados pelo banco para métricas comparativas ou rankings, inclua um bloco \`\`\`chart com JSON estruturado para renderização interativa. NUNCA gere gráficos com dados inventados ou fictícios quando a consulta retornar vazia ou falhar.`;

    const lgpdDirective = PrivacyGuard.generateSystemPromptDirective(currentLgpdConfig, detectedUserRole);

    const combinedSystemPrompt = [globalPrompt, assistantPrompt, modelSystemPrompt, strictFormatPrompt, enterpriseAntiHallucinationPrompt, temporalAndFormattingPrompt, lgpdDirective].filter(Boolean).join('\n\n');

    const historyForContext: ChatCompletionMessage[] = await Promise.all(
      conv.messages.map(async (m) => {
        if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
          const imgAtts = m.attachments.filter((a) => a.mime_type.startsWith('image/'));
          if (imgAtts.length > 0) {
            const parts: ChatMessageContentPart[] = [];
            if (m.content && m.content.trim()) {
              parts.push({ type: 'text', text: m.content });
            }
            for (const imgAtt of imgAtts) {
              try {
                const buffer = await fs.readFile(imgAtt.file_path);
                const base64 = buffer.toString('base64');
                parts.push({
                  type: 'image_url',
                  image_url: {
                    url: `data:${imgAtt.mime_type};base64,${base64}`,
                  },
                });
              } catch (e) {
                console.error(`Erro ao carregar imagem histórica (${imgAtt.id}):`, e);
              }
            }
            if (parts.length > 0) {
              return { role: 'user' as const, content: parts };
            }
          }
        }
        return {
          role: m.role as any,
          content: m.content,
        };
      })
    );

    let currentMsgContent: string | ChatMessageContentPart[] = fullUserText + databaseContextText;

    if (currentImageAttachments.length > 0) {
      const parts: ChatMessageContentPart[] = [];
      if (fullUserText && fullUserText.trim()) {
        parts.push({ type: 'text', text: fullUserText + databaseContextText });
      }
      for (const imgAtt of currentImageAttachments) {
        try {
          const buffer = await fs.readFile(imgAtt.file_path);
          const base64 = buffer.toString('base64');
          parts.push({
            type: 'image_url',
            image_url: {
              url: `data:${imgAtt.mime_type};base64,${base64}`,
            },
          });
        } catch (e) {
          console.error(`Erro ao ler anexo de imagem (${imgAtt.id}):`, e);
        }
      }
      if (parts.length > 0) {
        currentMsgContent = parts;
      }
    }

    const currentMessageForContext: ChatCompletionMessage = {
      role: 'user',
      content: currentMsgContent,
    };

    const targetModelInfo = await provider.getModel(effectiveModel);
    const configuredContext = dbModelSetting?.context_window || targetModelInfo?.context_length || 4096;
    // Limite máximo seguro de 16384 tokens para otimização de RAM/KV-Cache no servidor local
    const maxContextLength = Math.min(configuredContext, 16384);

    const contextResult = ContextManager.prepareContext(
      combinedSystemPrompt,
      historyForContext,
      currentMessageForContext,
      { maxContextLength, reservedOutputTokens: max_tokens || dbModelSetting?.max_tokens || 1024 }
    );

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');

    const generationId = crypto.randomUUID();
    const abortController = new AbortController();
    activeGenerations.set(generationId, abortController);

    req.raw.on('close', () => {
      if (activeGenerations.has(generationId)) {
        abortController.abort();
        activeGenerations.delete(generationId);
      }
    });

    reply.raw.write(`data: ${JSON.stringify({
      type: 'meta',
      generation_id: generationId,
      conversation_id: targetConvId,
      user_message_id: userMessage.id,
      auto_selected_model: routerResult.wasAutoSelected ? effectiveModel : undefined,
      auto_reason: routerResult.wasAutoSelected ? routerResult.reason : undefined,
      warning: contextResult.warningMessage,
    })}\n\n`);

    AuditService.log({
      clientId: client_id,
      clientName: client_name,
      action: 'message.sent',
      conversationId: targetConvId,
      messageId: userMessage.id,
      model,
      provider: 'lmstudio',
    });

    const startTime = Date.now();

    try {
      await provider.streamChat(
        {
          model: effectiveModel,
          messages: contextResult.messages,
          temperature: temperature ?? conv.assistant?.temperature ?? dbModelSetting?.temperature ?? 0.7,
          top_p: top_p ?? conv.assistant?.top_p ?? dbModelSetting?.top_p ?? 0.95,
          max_tokens: max_tokens ?? conv.assistant?.max_tokens ?? dbModelSetting?.max_tokens ?? 4096,
        },
        {
          onToken: (token) => {
            reply.raw.write(`data: ${JSON.stringify({ type: 'token', token })}\n\n`);
          },
          onReasoning: (reasoning) => {
            reply.raw.write(`data: ${JSON.stringify({ type: 'reasoning', reasoning })}\n\n`);
          },
          onComplete: async (metrics) => {
            let finalContent = metrics.full_text;
            if (!finalContent || !finalContent.trim()) {
              if (metrics.reasoning_text && metrics.reasoning_text.trim()) {
                finalContent = '*(Raciocínio concluído pelo modelo. Nenhuma resposta final adicional em texto foi gerada.)*';
              } else {
                finalContent = '⚠️ O modelo de IA não retornou conteúdo para este prompt. Isso pode ter ocorrido por estouro do limite de contexto do modelo ou desconexão com o servidor. Tente enviar um trecho menor ou trocar de modelo no menu.';
              }
            }

            const assistantMsg = await prisma.message.create({
              data: {
                conversation_id: targetConvId,
                role: 'assistant',
                content: finalContent,
                model: effectiveModel,
                provider: 'lmstudio',
                client_id: 'oraculo-system',
                client_name: 'ORÁCULO SPN',
                generation: {
                  create: {
                    provider: 'lmstudio',
                    model: effectiveModel,
                    input_tokens: metrics.input_tokens,
                    output_tokens: metrics.output_tokens,
                    total_tokens: metrics.total_tokens,
                    ttft_ms: metrics.ttft_ms,
                    duration_ms: metrics.duration_ms,
                    tokens_per_second: metrics.tokens_per_second,
                    finish_reason: metrics.finish_reason,
                    reasoning_content: metrics.reasoning_text,
                    started_at: new Date(startTime),
                    finished_at: new Date(),
                  },
                },
              },
              include: { generation: true },
            });

            await prisma.conversation.update({
              where: { id: targetConvId },
              data: { updated_at: new Date(), default_model: effectiveModel },
            });

            if (dbUser && metrics.total_tokens) {
              await QuotaService.deductUserTokens(dbUser.id, metrics.total_tokens, isPaidModel);
            }

            reply.raw.write(`data: ${JSON.stringify({
              type: 'done',
              message_id: assistantMsg.id,
              generation_id: generationId,
              metrics: {
                duration_ms: metrics.duration_ms,
                ttft_ms: metrics.ttft_ms,
                tokens_per_second: metrics.tokens_per_second,
                input_tokens: metrics.input_tokens,
                output_tokens: metrics.output_tokens,
                total_tokens: metrics.total_tokens,
              },
            })}\n\n`);

            reply.raw.end();
            activeGenerations.delete(generationId);

            ConversationService.generateTitleIfNeeded(targetConvId, provider, effectiveModel);
          },
          onError: async (err) => {
            console.error('[ChatRoute] Stream error:', err.message);
            reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: 'Servidor de IA indisponível ou erro na geração' })}\n\n`);
            reply.raw.end();
            activeGenerations.delete(generationId);

            AuditService.log({
              clientId: client_id,
              clientName: client_name,
              action: 'generation.error',
              conversationId: targetConvId,
              model,
              status: 'FAILURE',
              details: { error: err.message },
            });
          },
        },
        abortController.signal
      );
    } catch (e: any) {
      if (!reply.raw.writableEnded) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
        reply.raw.end();
      }
      activeGenerations.delete(generationId);
    }
  });

  fastify.post('/api/chat/:generationId/cancel', async (req, reply) => {
    const { generationId } = req.params as { generationId: string };
    const controller = activeGenerations.get(generationId);
    if (controller) {
      controller.abort();
      activeGenerations.delete(generationId);
      return reply.send({ success: true, message: 'Geração cancelada' });
    }
    return reply.status(404).send({ success: false, error: 'Geração ativa não encontrada' });
  });

  fastify.post('/api/chat/feedback', async (req, reply) => {
    const parseResult = UserFeedbackSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ success: false, errors: parseResult.error.format() });
    }

    const { message_id, rating, comment, client_id } = parseResult.data;

    const feedback = await prisma.userFeedback.upsert({
      where: { message_id },
      update: { rating, comment },
      create: {
        message_id,
        rating,
        comment,
        client_id,
      },
    });

    return reply.send({ success: true, feedback });
  });
}
