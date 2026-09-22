import { ModelInfo } from '@oraculo/shared';
import { AIProvider } from './AIProvider.js';
import { ChatCompletionRequest, ChatStreamCallbacks, ProviderHealth } from './types.js';

export class CloudProvider implements AIProvider {
  name = 'Provedor Nuvem (Contingência)';
  type = 'cloud';
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: { baseUrl?: string; apiKey?: string }) {
    this.baseUrl = (config.baseUrl || process.env.CLOUD_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.apiKey = config.apiKey || process.env.CLOUD_LLM_API_KEY || process.env.OPENAI_API_KEY;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!this.apiKey) return [];
    return [
      {
        key: 'cloud-fallback-gpt4o',
        display_name: 'Cloud Backup Model (Contingência)',
        publisher: 'Cloud API',
        context_length: 128000,
        max_context_length: 128000,
        capabilities: { vision: true, tools: true, reasoning: true },
        is_loaded: true,
      },
    ];
  }

  async getModel(key: string): Promise<ModelInfo | null> {
    const models = await this.listModels();
    return models[0] || null;
  }

  async chat(request: ChatCompletionRequest, signal?: AbortSignal) {
    const startTime = Date.now();
    if (!this.apiKey) {
      throw new Error('Chave de API do provedor em nuvem não configurada');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: request.model || 'gpt-4o-mini',
        messages: request.messages,
        temperature: request.temperature,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Erro na API em Nuvem: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    const content = data.choices?.[0]?.message?.content || '';
    return { content, duration_ms: Date.now() - startTime };
  }

  async streamChat(
    request: ChatCompletionRequest,
    callbacks: ChatStreamCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    if (!this.apiKey) {
      callbacks.onError(new Error('Chave de API do provedor em nuvem não configurada'));
      return;
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: request.messages,
          stream: true,
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`Erro Cloud API ${response.status}: ${await response.text()}`);
      }

      if (!response.body) {
        throw new Error('ReadableStream não suportado na resposta');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
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
            try {
              const data = JSON.parse(trimmed.slice(6));
              const delta = data.choices?.[0]?.delta?.content;
              if (delta) {
                fullText += delta;
                callbacks.onToken(delta);
              }
            } catch {}
          }
        }
      }

      callbacks.onComplete({
        full_text: fullText,
        duration_ms: 1000,
        finish_reason: 'stop',
      });
    } catch (err: any) {
      callbacks.onError(err);
    }
  }

  cancelGeneration(generationId: string): void {
    // Provedor nuvem não possui cancelamento ativo por ID de geração local
  }

  async getCapabilities(modelKey: string) {
    return { vision: true, tools: true, reasoning: true };
  }

  async getTelemetry() {
    const health = await this.healthCheck();
    return {
      base_url: this.baseUrl,
      latency_ms: health.latency_ms,
      models_count: 1,
      loaded_models_count: health.is_online ? 1 : 0,
      status: (health.is_online ? 'online' : 'offline') as 'online' | 'offline',
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      is_online: Boolean(this.apiKey),
      latency_ms: this.apiKey ? 150 : null,
      base_url: this.baseUrl,
      error: this.apiKey ? undefined : 'Sem chave de API configurada',
    };
  }
}
