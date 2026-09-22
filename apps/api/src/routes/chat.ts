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
    const sanitization = PrivacyGuard.sanitizePrompt(rawUserText);
    const fullUserText = sanitization.cleanText;

    // --- Conexão e Busca de Dados Corporativos em Tempo Real (GLPI / MySQL) ---
    let databaseContextText = '';
    const textLower = fullUserText.toLowerCase();

    if (
      textLower.includes('glpi') ||
      textLower.includes('chamado') ||
      textLower.includes('ticket') ||
      textLower.includes('aberto') ||
      textLower.includes('pendente') ||
      textLower.includes('banco de dados')
    ) {
      try {
        const activeConnectors = await (prisma as any).databaseConnector.findMany({
          where: { is_active: true },
        });

        if (activeConnectors.length > 0) {
          const glpiConn = activeConnectors.find(
            (c: any) => c.name.toLowerCase().includes('glpi') || c.database.toLowerCase().includes('glpi')
          ) || activeConnectors[0];

          if (glpiConn) {
            databaseContextText = await GLPIService.fetchGLPIDataContext(glpiConn.id, fullUserText, glpiConn.name);
          }
        }
      } catch (err: any) {
        console.error('Erro ao consultar banco GLPI no chat:', err);
        databaseContextText = `\n\n[AVISO DE BANCO DE DADOS CONECTADO]: Houve uma tentativa de consultar o banco GLPI mas retornou erro: ${err.message}.`;
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

    const combinedSystemPrompt = [globalPrompt, assistantPrompt, modelSystemPrompt, strictFormatPrompt].filter(Boolean).join('\n\n');

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
