import { ModelInfo } from '@oraculo/shared';
import { AIProvider } from './AIProvider.js';
import { ChatCompletionRequest, ChatStreamCallbacks, ProviderHealth } from './types.js';

export class LMStudioProvider implements AIProvider {
  name = 'LM Studio';
  type = 'lmstudio';
  private baseUrl: string;
  private apiToken?: string;
  private timeoutMs: number;
  private activeControllers = new Map<string, AbortController>();
  private modelsCache: { data: ModelInfo[]; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 5000;

  constructor(config: { baseUrl: string; apiToken?: string; timeoutMs?: number }) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiToken = config.apiToken;
    this.timeoutMs = config.timeoutMs || 60000;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`;
    }
    return headers;
  }

  async listModels(forceRefresh = false): Promise<ModelInfo[]> {
    if (!forceRefresh && this.modelsCache && Date.now() - this.modelsCache.timestamp < this.CACHE_TTL_MS) {
      return this.modelsCache.data;
    }

    try {
      let response = await fetch(`${this.baseUrl}/api/v1/models`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(10000),
      });

      let models: ModelInfo[] = [];

      if (response.ok) {
        const data = (await response.json()) as any;
        const modelsRaw = data.models || data.data || [];
        models = modelsRaw.map((m: any) => this.normalizeLMStudioModel(m));
      } else {
        response = await fetch(`${this.baseUrl}/v1/models`, {
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          throw new Error(`LM Studio HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as any;
        const modelsRaw = data.data || data.models || [];
        models = modelsRaw.map((m: any) => this.normalizeLMStudioModel(m));
      }

      this.modelsCache = { data: models, timestamp: Date.now() };
      return models;
    } catch (error: any) {
      console.error('[LMStudioProvider] Failed to list models:', error.message);
      return this.modelsCache ? this.modelsCache.data : [];
    }
  }

  private normalizeLMStudioModel(m: any): ModelInfo {
    const key = m.id || m.key || m.name || 'unknown-model';
    const display_name = m.display_name || m.name || m.id || key;
    const publisher = m.publisher || m.organization || undefined;
    const architecture = m.architecture || m.arch || undefined;
    
    let rawQuant = m.quantization || m.quant;
    let quantization: string | undefined;
    if (typeof rawQuant === 'string') {
      quantization = rawQuant;
    } else if (rawQuant && typeof rawQuant === 'object') {
      quantization = rawQuant.name || (rawQuant.bits_per_weight ? `${rawQuant.bits_per_weight}-bit` : undefined);
    } else if (m.id && typeof m.id === 'string') {
      quantization = m.id.match(/Q\d_[K|M|S]/i)?.[0];
    }

    const context_length = m.context_length || m.max_context_length || m.context_window || 4096;

    const lowerKey = key.toLowerCase();
    const lowerName = display_name.toLowerCase();

    // Model Capability Verification Policy Rules:
    const isVision = Boolean(
      m.vision ||
      m.capabilities?.vision ||
      lowerKey.includes('vision') || lowerName.includes('vision') ||
      lowerKey.includes('vl') || lowerName.includes('vl') ||
      lowerKey.includes('llava') || lowerName.includes('llava') ||
      lowerKey.includes('bakllava') || lowerName.includes('bakllava') ||
      lowerKey.includes('pixtral') || lowerName.includes('pixtral') ||
      lowerKey.includes('paligemma') || lowerName.includes('paligemma') ||
      lowerKey.includes('moondream') || lowerName.includes('moondream') ||
      lowerKey.includes('minicpm') || lowerName.includes('minicpm') ||
      lowerKey.includes('cogvlm') || lowerName.includes('cogvlm') ||
      lowerKey.includes('internlm') || lowerName.includes('internlm') ||
      lowerKey.includes('janus') || lowerName.includes('janus') ||
      lowerKey.includes('molmo') || lowerName.includes('molmo') ||
      lowerKey.includes('gemma-4') || lowerName.includes('gemma-4') ||
      lowerKey.includes('gemma4') || lowerName.includes('gemma4') ||
      lowerKey.includes('qwen-vl') || lowerName.includes('qwen-vl') ||
      lowerKey.includes('qwen2-vl') || lowerName.includes('qwen2-vl') ||
      lowerKey.includes('qwen2.5-vl') || lowerName.includes('qwen2.5-vl') ||
      lowerKey.includes('qvq') || lowerName.includes('qvq') ||
      lowerKey.includes('omni') || lowerName.includes('omni') ||
      lowerKey.includes('gpt-4o') || lowerName.includes('gpt-4o')
    );

    const isTools = Boolean(
      m.trained_for_tool_use ||
      m.capabilities?.tools ||
      m.tool_use ||
      lowerKey.includes('coder') || lowerName.includes('coder') ||
      lowerKey.includes('code') || lowerName.includes('code') ||
      lowerKey.includes('starcoder') || lowerName.includes('starcoder') ||
      lowerKey.includes('devin') || lowerName.includes('devin')
    );

    const isReasoning = Boolean(
      m.reasoning ||
      m.capabilities?.reasoning ||
      lowerKey.includes('r1') || lowerName.includes('r1') ||
      lowerKey.includes('reasoning') || lowerName.includes('reasoning') ||
      lowerKey.includes('think') || lowerName.includes('think') ||
      lowerKey.includes('qwq') || lowerName.includes('qwq') ||
      lowerKey.includes('o1') || lowerName.includes('o1')
    );

    const isLoaded = m.loaded_instances !== undefined ? m.loaded_instances > 0 : true;

    return {
      key,
      display_name,
      publisher,
      architecture,
      quantization,
      context_length,
      max_context_length: context_length,
      capabilities: {
        vision: isVision,
        tools: isTools,
        reasoning: isReasoning,
      },
      is_loaded: isLoaded,
      format: m.format,
    };
  }

  async getModel(key: string): Promise<ModelInfo | null> {
    const models = await this.listModels();
    return models.find((m) => m.key === key) || null;
  }

  async chat(request: ChatCompletionRequest, signal?: AbortSignal) {
    const startTime = Date.now();
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal) {
      signal.addEventListener('abort', onAbort);
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          ...request,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LM Studio HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as any;
      const durationMs = Date.now() - startTime;
      const message = data.choices?.[0]?.message || {};
      const content = message.content || '';
      const reasoning = message.reasoning_content || undefined;

      const usage = data.usage
        ? {
            input_tokens: data.usage.prompt_tokens || 0,
            output_tokens: data.usage.completion_tokens || 0,
            total_tokens: data.usage.total_tokens || 0,
          }
        : undefined;

      const tokensPerSec = usage?.output_tokens
        ? parseFloat(((usage.output_tokens / durationMs) * 1000).toFixed(1))
        : undefined;

      return {
        content,
        reasoning,
        usage,
        duration_ms: durationMs,
        tokens_per_second: tokensPerSec,
      };
    } finally {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  }

  async streamChat(
    request: ChatCompletionRequest,
    callbacks: ChatStreamCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    const startTime = Date.now();
    let ttftMs: number | undefined;
    let fullText = '';
    let reasoningText = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let finishReason: string | undefined;

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal) {
      signal.addEventListener('abort', onAbort);
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          ...request,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`LM Studio error (${response.status}): ${errText}`);
      }

      if (!response.body) {
        throw new Error('ReadableStream não suportado na resposta de streaming');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            try {
              const data = JSON.parse(jsonStr);
              if (!ttftMs && (data.choices?.[0]?.delta?.content || data.choices?.[0]?.delta?.reasoning_content)) {
                ttftMs = Date.now() - startTime;
              }

              const delta = data.choices?.[0]?.delta;
              if (delta) {
                if (delta.reasoning_content) {
                  reasoningText += delta.reasoning_content;
                  if (callbacks.onReasoning) {
                    callbacks.onReasoning(delta.reasoning_content);
                  }
                }

                if (delta.content) {
                  fullText += delta.content;
                  callbacks.onToken(delta.content);
                  completionTokens++;
                }

                if (data.choices[0].finish_reason) {
                  finishReason = data.choices[0].finish_reason;
                }
              }

              if (data.usage) {
                promptTokens = data.usage.prompt_tokens || promptTokens;
                completionTokens = data.usage.completion_tokens || completionTokens;
              }
            } catch (e) {
              // Ignore invalid JSON chunks
            }
          }
        }
      }

      const durationMs = Date.now() - startTime;
      const tokensPerSec = completionTokens > 0
        ? parseFloat(((completionTokens / durationMs) * 1000).toFixed(1))
        : undefined;

      callbacks.onComplete({
        full_text: fullText,
        reasoning_text: reasoningText || undefined,
        input_tokens: promptTokens,
        output_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        ttft_ms: ttftMs,
        duration_ms: durationMs,
        tokens_per_second: tokensPerSec,
        finish_reason: finishReason || 'stop',
      });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        const durationMs = Date.now() - startTime;
        callbacks.onComplete({
          full_text: fullText,
          reasoning_text: reasoningText || undefined,
          duration_ms: durationMs,
          finish_reason: 'cancelled',
        });
      } else {
        callbacks.onError(error);
      }
    } finally {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  }

  cancelGeneration(generationId: string): void {
    const controller = this.activeControllers.get(generationId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(generationId);
    }
  }

  async getCapabilities(modelKey: string) {
    const model = await this.getModel(modelKey);
    if (!model) {
      return { vision: false, tools: false, reasoning: false };
    }
    return model.capabilities;
  }

  async healthCheck(): Promise<ProviderHealth> {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      const latency = Date.now() - startTime;
      if (response.ok) {
        return {
          is_online: true,
          latency_ms: latency,
          base_url: this.baseUrl,
        };
      }
      return {
        is_online: false,
        latency_ms: null,
        base_url: this.baseUrl,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (err: any) {
      return {
        is_online: false,
        latency_ms: null,
        base_url: this.baseUrl,
        error: err.message || 'Falha de conexão com LM Studio',
      };
    }
  }

  async getTelemetry() {
    const health = await this.healthCheck();
    if (!health.is_online) {
      return {
        base_url: this.baseUrl,
        latency_ms: null,
        models_count: 0,
        loaded_models_count: 0,
        status: 'offline' as const,
      };
    }
    const models = await this.listModels();
    const loadedCount = models.filter((m) => m.is_loaded).length;
    return {
      base_url: this.baseUrl,
      latency_ms: health.latency_ms,
      models_count: models.length,
      loaded_models_count: loadedCount,
      status: 'online' as const,
    };
  }
}
