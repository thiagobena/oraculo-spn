import { ChatCompletionMessage } from './types.js';

export interface ContextWindowConfig {
  maxContextLength: number;
  reservedOutputTokens?: number;
  safetyBuffer?: number;
}

export class ContextManager {
  static estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  static estimateMessageTokens(msg: ChatCompletionMessage): number {
    let tokens = 4;
    if (typeof msg.content === 'string') {
      tokens += ContextManager.estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text') {
          tokens += ContextManager.estimateTokens(part.text);
        } else if (part.type === 'image_url') {
          tokens += 1000;
        }
      }
    }
    return tokens;
  }

  static prepareContext(
    systemPrompt: string | undefined,
    historyMessages: ChatCompletionMessage[],
    currentPrompt: ChatCompletionMessage,
    config: ContextWindowConfig
  ): {
    messages: ChatCompletionMessage[];
    totalEstimatedTokens: number;
    wasTruncated: boolean;
    warningMessage?: string;
  } {
    const maxTokens = config.maxContextLength || 4096;
    const reservedOutput = config.reservedOutputTokens || 1024;
    const safetyBuffer = config.safetyBuffer || 256;
    const availableBudget = maxTokens - reservedOutput - safetyBuffer;

    const result: ChatCompletionMessage[] = [];
    let currentTokenCount = 0;

    if (systemPrompt && systemPrompt.trim()) {
      const sysMsg: ChatCompletionMessage = { role: 'system', content: systemPrompt };
      const sysTokens = ContextManager.estimateMessageTokens(sysMsg);
      result.push(sysMsg);
      currentTokenCount += sysTokens;
    }

    const promptTokens = ContextManager.estimateMessageTokens(currentPrompt);
    let remainingBudget = availableBudget - currentTokenCount;
    let wasTruncated = false;

    // If the current prompt itself exceeds the available budget (e.g. giant pasted CSV or document),
    // truncate currentPrompt text to fit inside remaining budget.
    if (promptTokens > availableBudget) {
      wasTruncated = true;
      const safeCharLimit = Math.max((availableBudget - 100) * 4, 800);

      if (typeof currentPrompt.content === 'string') {
        currentPrompt.content =
          currentPrompt.content.slice(0, safeCharLimit) +
          `\n\n[... Conteúdo truncado em ${safeCharLimit} caracteres para respeitar o limite de ${maxTokens} tokens do modelo ...]`;
      } else if (Array.isArray(currentPrompt.content)) {
        for (const part of currentPrompt.content) {
          if (part.type === 'text') {
            part.text =
              part.text.slice(0, safeCharLimit) +
              `\n\n[... Conteúdo truncado em ${safeCharLimit} caracteres para respeitar o limite do modelo ...]`;
          }
        }
      }
      remainingBudget = 0;
    } else {
      remainingBudget -= promptTokens;
    }

    const selectedHistory: ChatCompletionMessage[] = [];
    let historyTokens = 0;

    for (let i = historyMessages.length - 1; i >= 0; i--) {
      const msg = historyMessages[i];
      const msgTokens = ContextManager.estimateMessageTokens(msg);

      if (historyTokens + msgTokens <= remainingBudget) {
        selectedHistory.unshift(msg);
        historyTokens += msgTokens;
      } else {
        wasTruncated = true;
        break;
      }
    }

    const finalMessages = [
      ...result,
      ...selectedHistory,
      currentPrompt,
    ];

    const totalEstimatedTokens = currentTokenCount + historyTokens + Math.min(promptTokens, availableBudget);

    let warningMessage: string | undefined;
    if (wasTruncated) {
      warningMessage = `Conteúdo do prompt ou histórico truncado automaticamente para respeitar a janela de contexto de ${maxTokens} tokens do modelo.`;
    }

    return {
      messages: finalMessages,
      totalEstimatedTokens,
      wasTruncated,
      warningMessage,
    };
  }

  static buildSummaryPrompt(messagesToSummarize: ChatCompletionMessage[]): ChatCompletionMessage {
    const textToSummarize = messagesToSummarize
      .map((m) => {
        let text = '';
        if (typeof m.content === 'string') {
          text = m.content;
        } else if (Array.isArray(m.content)) {
          text = m.content
            .filter((p) => p.type === 'text')
            .map((p: any) => p.text)
            .join(' ');
          if (m.content.some((p) => p.type === 'image_url')) {
            text += ' [Imagem Anexada]';
          }
        } else {
          text = '[Conteúdo Mídia]';
        }
        return `${m.role.toUpperCase()}: ${text}`;
      })
      .join('\n\n');

    return {
      role: 'user',
      content: `Por favor, faça um resumo conciso (4-8 frases) dos pontos principais e decisões abordados no histórico a seguir, preservando contexto relevante:\n\n${textToSummarize}`,
    };
  }
}
