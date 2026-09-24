import { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { AuditService } from '../services/AuditService.js';
import { DatabaseService } from '../services/DatabaseService.js';
import { GLPIService } from '../services/GLPIService.js';

export interface MessagingConfig {
  whatsapp_enabled: boolean;
  whatsapp_api_url?: string;
  whatsapp_instance?: string;
  whatsapp_api_key?: string;
  telegram_enabled: boolean;
  telegram_bot_token?: string;
  telegram_default_chat_id?: string;
  // Competitor Price Monitoring
  competitor_enabled?: boolean;
  competitor_targets?: string;
  competitor_alert_threshold?: number;
  competitor_frequency?: string;
  // GLPI Autonomous L1 Resolution
  glpi_autoresolve_enabled?: boolean;
  glpi_autoclose_tickets?: boolean;
  glpi_bot_signature?: string;
}

export async function messagingRoutes(app: FastifyInstance) {
  // 1. Obter configuração atual de WhatsApp, Telegram, Concorrência e GLPI L1
  app.get('/config', async (request, reply) => {
    try {
      const configRecord = await prisma.appSetting.findFirst({
        where: { key: 'MESSAGING_INTEGRATIONS_CONFIG' },
      });

      let config: MessagingConfig = {
        whatsapp_enabled: false,
        whatsapp_api_url: '',
        whatsapp_instance: 'oraculo-spn',
        whatsapp_api_key: '',
        telegram_enabled: false,
        telegram_bot_token: '',
        telegram_default_chat_id: '',
        competitor_enabled: false,
        competitor_targets: 'Panvel, RaiaDrogasil, PagueMenos, Nissei',
        competitor_alert_threshold: 5,
        competitor_frequency: 'Diário às 06:00',
        glpi_autoresolve_enabled: true,
        glpi_autoclose_tickets: false,
        glpi_bot_signature: '🤖 Oráculo IA • Resolução Autônoma Nível 1',
      };

      if (configRecord && configRecord.value) {
        try {
          config = { ...config, ...JSON.parse(configRecord.value) };
        } catch (_) {}
      }

      return reply.send({ success: true, config });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 2. Salvar configurações de WhatsApp e Telegram
  app.post('/config', async (request, reply) => {
    try {
      const body = request.body as MessagingConfig;

      await prisma.appSetting.upsert({
        where: { key: 'MESSAGING_INTEGRATIONS_CONFIG' },
        update: { value: JSON.stringify(body) },
        create: {
          key: 'MESSAGING_INTEGRATIONS_CONFIG',
          value: JSON.stringify(body),
          description: 'Configurações das integrações de mensageria (WhatsApp e Telegram)',
        },
      });

      await AuditService.log({
        clientId: 'admin',
        clientName: 'Administrador',
        action: 'UPDATE_MESSAGING_CONFIG',
        status: 'SUCCESS',
        details: { whatsapp_enabled: body.whatsapp_enabled, telegram_enabled: body.telegram_enabled },
      });

      return reply.send({ success: true, message: 'Configurações de mensageria salvas com sucesso!' });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 3. Testar envio de mensagem (Telegram ou WhatsApp)
  app.post('/test', async (request, reply) => {
    try {
      const { channel, recipient, message = '⚡ Teste de conexão do Oráculo SPN via ' + channel } = request.body as any;

      if (channel === 'telegram') {
        const configRecord = await prisma.appSetting.findFirst({
          where: { key: 'MESSAGING_INTEGRATIONS_CONFIG' },
        });
        const config: MessagingConfig = configRecord?.value ? JSON.parse(configRecord.value) : {};

        if (!config.telegram_bot_token) {
          return reply.status(400).send({ success: false, error: 'Token do Bot do Telegram não configurado.' });
        }

        const chatId = recipient || config.telegram_default_chat_id;
        if (!chatId) {
          return reply.status(400).send({ success: false, error: 'Chat ID de destino não informado.' });
        }

        const res = await fetch(`https://api.telegram.org/bot${config.telegram_bot_token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🤖 *ORÁCULO SPN — TESTE DE CONEXÃO*\n\n${message}\n\n✅ Integração com Telegram ativa e operacional!`,
            parse_mode: 'Markdown',
          }),
          signal: AbortSignal.timeout(10000),
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.description || 'Falha ao comunicar com a API do Telegram.');
        }

        return reply.send({ success: true, message: 'Mensagem de teste enviada com sucesso para o Telegram!' });
      }

      if (channel === 'whatsapp') {
        const configRecord = await prisma.appSetting.findFirst({
          where: { key: 'MESSAGING_INTEGRATIONS_CONFIG' },
        });
        const config: MessagingConfig = configRecord?.value ? JSON.parse(configRecord.value) : {};

        if (!config.whatsapp_api_url) {
          return reply.status(400).send({ success: false, error: 'URL da API do WhatsApp não configurada.' });
        }

        const targetUrl = `${config.whatsapp_api_url.replace(/\/+$/, '')}/message/sendText/${config.whatsapp_instance || 'oraculo-spn'}`;
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.whatsapp_api_key || '',
            'Authorization': `Bearer ${config.whatsapp_api_key || ''}`,
          },
          body: JSON.stringify({
            number: recipient || '5541999999999',
            text: `🤖 *ORÁCULO SPN — TESTE DE CONEXÃO*\n\n${message}\n\n✅ Integração com WhatsApp ativa!`,
          }),
          signal: AbortSignal.timeout(10000),
        });

        return reply.send({
          success: res.ok,
          message: res.ok ? 'Mensagem de teste disparada com sucesso para o WhatsApp!' : `API WhatsApp respondeu com status ${res.status}`,
        });
      }

      return reply.status(400).send({ success: false, error: 'Canal inválido. Use "telegram" ou "whatsapp".' });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: `Erro no teste de envio: ${err.message}` });
    }
  });

  // 4. Inbound Webhook: Recebe mensagens do WhatsApp ou Telegram e responde automaticamente
  app.post('/webhook', async (request, reply) => {
    try {
      const body = request.body as any;
      console.log('[MessagingWebhook] Mensagem recebida:', JSON.stringify(body).slice(0, 200));

      // Extrair texto da mensagem
      let userQuery = '';
      let senderId = '';

      if (body.message && body.message.text) {
        // Formato Telegram
        userQuery = body.message.text;
        senderId = String(body.message.chat?.id || '');
      } else if (body.data && body.data.message && body.data.message.conversation) {
        // Formato Evolution API / WhatsApp
        userQuery = body.data.message.conversation;
        senderId = body.data.key?.remoteJid || '';
      }

      if (userQuery && senderId) {
        console.log(`[MessagingWebhook] Processando pergunta via mensageria: "${userQuery}"`);
        // Opcional: Processar e responder via IA em background
      }

      return reply.send({ success: true, received: true });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
