import { prisma } from '../../db/prisma.js';

export class LLMClient {
  /**
   * Obtém a URL e credenciais do provedor de IA ativo no banco
   */
  private static async getActiveProviderConfig() {
    const activeProvider = await (prisma as any).aIProviderConfig.findFirst({
      where: { is_active: true },
      orderBy: { priority: 'asc' },
    });

    const cleanBaseUrl = (activeProvider?.base_url || 'http://127.0.0.1:1234/v1').replace(/\/+$/, '');
    const apiUrl = cleanBaseUrl.endsWith('/v1') ? `${cleanBaseUrl}/chat/completions` : `${cleanBaseUrl}/v1/chat/completions`;
    const apiKey = activeProvider?.api_key || 'not-needed';
    const timeoutMs = activeProvider?.timeout_ms || 35000;

    return { apiUrl, apiKey, timeoutMs };
  }

  /**
   * Executa chamada de geração com saída estritamente estruturada em JSON
   */
  static async generateStructured<T>(
    prompt: string,
    systemPrompt: string,
    options?: { temperature?: number; maxTokens?: number; modelKey?: string }
  ): Promise<T> {
    const { apiUrl, apiKey, timeoutMs } = await this.getActiveProviderConfig();

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options?.modelKey || 'auto',
        messages: [
          {
            role: 'system',
            content: `${systemPrompt}\n\nIMPORTANTE: Responda ESTRITAMENTE em formato JSON válido, sem comentários, sem marcações de markdown e sem texto antes ou depois das chaves JSON.`,
          },
          { role: 'user', content: prompt },
        ],
        temperature: options?.temperature ?? 0.1,
        max_tokens: options?.maxTokens ?? 2000,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Servidor de IA respondeu com status ${response.status} (${response.statusText})`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';

    // Sanitizar markdown caso a LLM insira ```json ... ```
    content = content.replace(/```json/gi, '').replace(/```/g, '').trim();

    // Extrair JSON delimitado
    const jsonMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error(`A LLM não retornou um JSON válido. Resposta recebida: ${content.slice(0, 300)}`);
    }

    try {
      return JSON.parse(jsonMatch[0]) as T;
    } catch (parseErr: any) {
      throw new Error(`Falha no parse do JSON estruturado da LLM: ${parseErr.message}`);
    }
  }

  /**
   * Executa chamada de geração de texto livre
   */
  static async generateText(
    prompt: string,
    systemPrompt: string,
    options?: { temperature?: number; maxTokens?: number; modelKey?: string }
  ): Promise<string> {
    const { apiUrl, apiKey, timeoutMs } = await this.getActiveProviderConfig();

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options?.modelKey || 'auto',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 1500,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Servidor de IA respondeu com status ${response.status} (${response.statusText})`);
    }

    const data = await response.json();
    return (data.choices?.[0]?.message?.content || '').trim();
  }
}
