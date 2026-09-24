import { FastifyInstance } from 'fastify';
import { LMStudioProvider, CloudProvider } from '@oraculo/ai-core';
import { prisma } from '../db/prisma.js';
import { requireAdmin } from '../middlewares/authMiddleware.js';
import { LdapService } from '../services/LdapService.js';
import { QuotaService } from '../services/QuotaService.js';
import { ADConfigSchema, SaveAIProviderSchema, SaveModelSettingSchema, UpdateUserQuotaSchema } from '@oraculo/shared';

export function registerSettingsRoutes(fastify: FastifyInstance, provider: LMStudioProvider) {
  fastify.get('/api/settings', { preHandler: [requireAdmin] }, async (_req, reply) => {
    const settings = await prisma.appSetting.findMany();
    const providersList = await prisma.aIProviderConfig.findMany({
      orderBy: { priority: 'asc' },
    });

    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }

    const adConfig = await LdapService.getADConfig();

    return reply.send({
      success: true,
      settings: settingsMap,
      ad: adConfig,
      providers: providersList,
      lmstudio: providersList.find((p) => p.type === 'lmstudio') || {
        base_url: process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234',
        api_token: '',
        timeout_ms: 60000,
        is_active: true,
      },
    });
  });

  fastify.patch('/api/settings', { preHandler: [requireAdmin] }, async (req, reply) => {
    const { settings, lmstudio, ad } = req.body as {
      settings?: Record<string, string>;
      lmstudio?: { base_url?: string; api_token?: string; timeout_ms?: number };
      ad?: Record<string, any>;
    };

    if (settings) {
      for (const [key, value] of Object.entries(settings)) {
        await prisma.appSetting.upsert({
          where: { key },
          update: { value: String(value) },
          create: { key, value: String(value) },
        });
      }
    }

    if (ad) {
      for (const [key, value] of Object.entries(ad)) {
        await prisma.appSetting.upsert({
          where: { key: `ad_${key.replace(/^ad_/, '')}` },
          update: { value: String(value) },
          create: { key: `ad_${key.replace(/^ad_/, '')}`, value: String(value) },
        });
      }
    }

    if (lmstudio) {
      const existing = await prisma.aIProviderConfig.findFirst({ where: { type: 'lmstudio' } });
      if (existing) {
        await prisma.aIProviderConfig.update({
          where: { id: existing.id },
          data: {
            base_url: lmstudio.base_url || existing.base_url,
            api_key: lmstudio.api_token !== undefined ? lmstudio.api_token : existing.api_key,
            timeout_ms: lmstudio.timeout_ms || existing.timeout_ms,
          },
        });
      } else {
        await prisma.aIProviderConfig.create({
          data: {
            name: 'LM Studio Local',
            type: 'lmstudio',
            base_url: lmstudio.base_url || 'http://localhost:1234',
            api_key: lmstudio.api_token || '',
            timeout_ms: lmstudio.timeout_ms || 60000,
            is_active: true,
            is_paid: false,
          },
        });
      }
    }

    return reply.send({ success: true, message: 'Configurações atualizadas com sucesso' });
  });

  // --- CRUD de Provedores Multi-LLM ---
  fastify.get('/api/settings/providers', { preHandler: [requireAdmin] }, async (_req, reply) => {
    const providers = await prisma.aIProviderConfig.findMany({
      orderBy: { priority: 'asc' },
    });
    return reply.send({ success: true, providers });
  });

  fastify.post('/api/settings/providers', { preHandler: [requireAdmin] }, async (req, reply) => {
    const parseResult = SaveAIProviderSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ success: false, error: parseResult.error.errors[0].message });
    }

    const data = parseResult.data;

    let providerItem;
    if (data.id) {
      providerItem = await prisma.aIProviderConfig.update({
        where: { id: data.id },
        data: {
          name: data.name,
          type: data.type,
          base_url: data.base_url,
          api_key: data.api_key || '',
          is_active: data.is_active,
          is_paid: data.is_paid,
          priority: data.priority,
          timeout_ms: data.timeout_ms,
        },
      });
    } else {
      providerItem = await prisma.aIProviderConfig.create({
        data: {
          name: data.name,
          type: data.type,
          base_url: data.base_url,
          api_key: data.api_key || '',
          is_active: data.is_active,
          is_paid: data.is_paid,
          priority: data.priority,
          timeout_ms: data.timeout_ms,
        },
      });
    }

    return reply.send({ success: true, provider: providerItem, message: 'Provedor salvo com sucesso' });
  });

  fastify.delete('/api/settings/providers/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.aIProviderConfig.delete({ where: { id } });
    return reply.send({ success: true, message: 'Provedor removido com sucesso' });
  });

  // Testar conexão de qualquer provedor
  fastify.post('/api/settings/test-provider', { preHandler: [requireAdmin] }, async (req, reply) => {
    const body = req.body as { type: string; base_url: string; api_key?: string };
    const { type, base_url, api_key } = body;

    try {
      if (type === 'lmstudio' || type === 'ollama') {
        const testProvider = new LMStudioProvider({
          baseUrl: base_url,
          apiToken: api_key,
          timeoutMs: 10000,
        });
        const health = await testProvider.healthCheck();
        if (!health.is_online) {
          return reply.send({ success: false, connected: false, error: health.error || 'Servidor indisponível' });
        }
        const models = await testProvider.listModels();
        return reply.send({
          success: true,
          connected: true,
          latency_ms: health.latency_ms,
          models_count: models.length,
          models: models.map((m) => m.display_name || m.key),
        });
      } else {
        // Cloud API (OpenAI, Anthropic, Gemini, Custom)
        const cloudProv = new CloudProvider({
          baseUrl: base_url,
          apiKey: api_key,
        });
        const models = await cloudProv.listModels();
        return reply.send({
          success: true,
          connected: true,
          models_count: models.length,
          models: models.map((m) => m.display_name || m.key),
        });
      }
    } catch (e: any) {
      return reply.send({ success: false, connected: false, error: e.message });
    }
  });

  // --- Gestão de Cotas & Créditos por Usuário ---
  fastify.patch('/api/users/:id/quota', { preHandler: [requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parseResult = UpdateUserQuotaSchema.safeParse(req.body);

    if (!parseResult.success) {
      return reply.status(400).send({ success: false, error: parseResult.error.errors[0].message });
    }

    const { monthly_token_quota, rate_limit_rpm, can_use_paid_llm, reset_usage_now } = parseResult.data;

    const updateData: any = {};
    if (monthly_token_quota !== undefined) updateData.monthly_token_quota = monthly_token_quota;
    if (rate_limit_rpm !== undefined) updateData.rate_limit_rpm = rate_limit_rpm;
    if (can_use_paid_llm !== undefined) updateData.can_use_paid_llm = can_use_paid_llm;

    if (reset_usage_now) {
      updateData.tokens_used_this_month = 0;
      updateData.quota_reset_at = new Date();
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return reply.send({
      success: true,
      message: 'Cota e créditos do usuário atualizados com sucesso',
      user: updatedUser,
    });
  });

  // Test Active Directory LDAP Connection
  fastify.post('/api/settings/test-ad', { preHandler: [requireAdmin] }, async (req, reply) => {
    const parseResult = ADConfigSchema.partial().safeParse(req.body);
    const adConfigCurrent = await LdapService.getADConfig();

    const targetConfig = {
      ...adConfigCurrent,
      ...parseResult.data,
    };

    try {
      const result = await LdapService.testConnection(targetConfig);
      return reply.send({
        success: true,
        message: result.message,
        userCount: result.userCount,
      });
    } catch (err: any) {
      return reply.send({
        success: false,
        error: err?.message || 'Falha de conexão com Active Directory',
      });
    }
  });

  fastify.post('/api/settings/test-lmstudio', { preHandler: [requireAdmin] }, async (req, reply) => {
    const body = req.body as { base_url?: string; api_token?: string };
    const targetUrl = body.base_url || process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234';

    const testProvider = new LMStudioProvider({
      baseUrl: targetUrl,
      apiToken: body.api_token,
      timeoutMs: 10000,
    });

    const health = await testProvider.healthCheck();
    if (!health.is_online) {
      return reply.send({
        success: false,
        connected: false,
        error: health.error || 'Falha ao conectar com LM Studio',
        base_url: targetUrl,
      });
    }

    const models = await testProvider.listModels();
    return reply.send({
      success: true,
      connected: true,
      latency_ms: health.latency_ms,
      base_url: targetUrl,
      models_count: models.length,
      models: models.map((m) => ({
        key: m.key,
        display_name: m.display_name,
        quantization: m.quantization,
        context_length: m.context_length,
      })),
    });
  });

  // --- GESTÃO DE PARÂMETROS DE MODELOS LLM ---
  fastify.get('/api/settings/models', { preHandler: [requireAdmin] }, async (_req, reply) => {
    try {
      const rawModels = await provider.listModels();
      const dbSettings = await prisma.modelSetting.findMany();
      const dbSettingsMap = new Map(dbSettings.map((s) => [s.model_key, s]));

      const mergedModels = rawModels.map((m) => {
        const s = dbSettingsMap.get(m.key);
        let capOverride: any = null;
        if (s?.capabilities_override) {
          try { capOverride = JSON.parse(s.capabilities_override); } catch {}
        }

        return {
          ...m,
          custom_name: s?.custom_name || null,
          display_name: s?.custom_name || m.display_name || m.key,
          is_active: s?.is_active ?? true,
          is_pinned: s?.is_pinned ?? false,
          is_paid: s?.is_paid ?? false,
          capabilities: {
            vision: capOverride?.vision !== undefined ? capOverride.vision : m.capabilities.vision,
            tools: capOverride?.tools !== undefined ? capOverride.tools : m.capabilities.tools,
            reasoning: capOverride?.reasoning !== undefined ? capOverride.reasoning : m.capabilities.reasoning,
          },
          settings: s ? {
            ...s,
            capabilities_override: capOverride,
          } : null,
        };
      });

      return reply.send({
        success: true,
        models: mergedModels,
        settings: dbSettings,
      });
    } catch (e: any) {
      return reply.status(500).send({ success: false, error: e.message });
    }
  });

  fastify.post('/api/settings/models', { preHandler: [requireAdmin] }, async (req, reply) => {
    const parseResult = SaveModelSettingSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ success: false, error: parseResult.error.errors[0].message });
    }

    const {
      model_key,
      custom_name,
      temperature,
      top_p,
      max_tokens,
      system_prompt,
      context_window,
      is_active,
      is_pinned,
      is_paid,
      capabilities_override,
    } = parseResult.data;

    try {
      const savedSetting = await prisma.modelSetting.upsert({
        where: { model_key },
        update: {
          custom_name: custom_name !== undefined ? custom_name : undefined,
          temperature: temperature !== undefined ? temperature : undefined,
          top_p: top_p !== undefined ? top_p : undefined,
          max_tokens: max_tokens !== undefined ? max_tokens : undefined,
          system_prompt: system_prompt !== undefined ? system_prompt : undefined,
          context_window: context_window !== undefined ? context_window : undefined,
          is_active: is_active !== undefined ? is_active : undefined,
          is_pinned: is_pinned !== undefined ? is_pinned : undefined,
          is_paid: is_paid !== undefined ? is_paid : undefined,
          capabilities_override: capabilities_override !== undefined
            ? (capabilities_override ? JSON.stringify(capabilities_override) : null)
            : undefined,
        },
        create: {
          model_key,
          custom_name: custom_name || null,
          temperature: temperature || null,
          top_p: top_p || null,
          max_tokens: max_tokens || null,
          system_prompt: system_prompt || null,
          context_window: context_window || null,
          is_active: is_active ?? true,
          is_pinned: is_pinned ?? false,
          is_paid: is_paid ?? false,
          capabilities_override: capabilities_override ? JSON.stringify(capabilities_override) : null,
        },
      });

      return reply.send({
        success: true,
        message: 'Parâmetros do modelo atualizados com sucesso.',
        setting: savedSetting,
      });
    } catch (e: any) {
      return reply.status(500).send({ success: false, error: e.message });
    }
  });

  fastify.delete('/api/settings/models/:modelKey', { preHandler: [requireAdmin] }, async (req, reply) => {
    const { modelKey } = req.params as { modelKey: string };
    const decodedKey = decodeURIComponent(modelKey);

    try {
      await prisma.modelSetting.deleteMany({
        where: { model_key: decodedKey },
      });

      return reply.send({
        success: true,
        message: `Configurações customizadas do modelo ${decodedKey} foram restauradas para os padrões.`,
      });
    } catch (e: any) {
      return reply.status(500).send({ success: false, error: e.message });
    }
  });

  // Carregar / Descarregar Modelo no LM Studio via REST API
  fastify.post('/api/settings/models/:modelKey/memory', { preHandler: [requireAdmin] }, async (req, reply) => {
    const { modelKey } = req.params as { modelKey: string };
    const { action } = req.body as { action: 'load' | 'unload' };
    const decodedKey = decodeURIComponent(modelKey);

    const baseUrl = process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234';

    try {
      const endpoint = action === 'load' ? `${baseUrl}/api/v1/models/load` : `${baseUrl}/api/v1/models/unload`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: decodedKey }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        return reply.send({
          success: true,
          message: `Comando de ${action === 'load' ? 'carregamento' : 'descarregamento'} enviado ao LM Studio com sucesso.`,
        });
      } else {
        const errorText = await res.text();
        return reply.send({
          success: false,
          error: `LM Studio (${res.status}): ${errorText || 'Ação não suportada diretamente por este endpoint'}`,
        });
      }
    } catch (e: any) {
      return reply.send({
        success: false,
        error: `Falha ao comunicar com LM Studio: ${e.message}`,
      });
    }
  });

  // --- Endpoints de Gestão de Políticas de LGPD & Privacidade ---
  fastify.get('/api/settings/lgpd', { preHandler: [requireAdmin] }, async (_req, reply) => {
    try {
      const settings = await prisma.appSetting.findMany({
        where: { key: { startsWith: 'lgpd_' } },
      });

      const map: Record<string, string> = {};
      settings.forEach((s) => {
        map[s.key] = s.value;
      });

      const lgpdConfig = {
        lgpd_level: map['lgpd_level'] !== undefined ? Number(map['lgpd_level']) : 50,
        lgpd_mode: map['lgpd_mode'] || 'smart',
        allow_admin_bypass: map['lgpd_allow_admin_bypass'] === 'false' ? false : true,
        mask_cpf: map['lgpd_mask_cpf'] || 'partial',
        mask_email: map['lgpd_mask_email'] || 'none',
        mask_phone: map['lgpd_mask_phone'] || 'none',
        mask_financial: map['lgpd_mask_financial'] || 'partial',
        mask_names: map['lgpd_mask_names'] || 'none',
        audit_sensitive_access: map['lgpd_audit_sensitive_access'] === 'false' ? false : true,
        custom_legal_basis_prompt: map['lgpd_custom_legal_basis_prompt'] || '',
      };

      return reply.send({ success: true, config: lgpdConfig });
    } catch (e: any) {
      return reply.status(500).send({ success: false, error: e.message });
    }
  });

  fastify.put('/api/settings/lgpd', { preHandler: [requireAdmin] }, async (req, reply) => {
    try {
      const body = req.body as Record<string, any>;
      const level = body.lgpd_level !== undefined ? Number(body.lgpd_level) : 50;

      const keysToSave: Record<string, string> = {
        lgpd_level: String(level),
        lgpd_mode: body.lgpd_mode || (level === 0 ? 'disabled' : level === 100 ? 'strict' : 'smart'),
        lgpd_allow_admin_bypass: String(body.allow_admin_bypass !== false),
        lgpd_mask_cpf: body.mask_cpf || (level >= 75 ? 'full' : level >= 25 ? 'partial' : 'none'),
        lgpd_mask_email: body.mask_email || (level >= 75 ? 'full' : 'none'),
        lgpd_mask_phone: body.mask_phone || (level >= 75 ? 'full' : 'none'),
        lgpd_mask_financial: body.mask_financial || (level >= 50 ? 'full' : 'partial'),
        lgpd_mask_names: body.mask_names || (level >= 100 ? 'full' : 'none'),
        lgpd_audit_sensitive_access: String(body.audit_sensitive_access !== false),
        lgpd_custom_legal_basis_prompt: body.custom_legal_basis_prompt || '',
      };

      for (const [k, v] of Object.entries(keysToSave)) {
        await prisma.appSetting.upsert({
          where: { key: k },
          update: { value: v },
          create: { key: k, value: v },
        });
      }

      return reply.send({
        success: true,
        message: 'Políticas de LGPD e Privacidade salvas com sucesso.',
      });
    } catch (e: any) {
      return reply.status(500).send({ success: false, error: e.message });
    }
  });
}



