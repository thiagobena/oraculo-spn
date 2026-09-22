import { ModelInfo } from '@oraculo/shared';

export interface ChatMessageContentPartText {
  type: 'text';
  text: string;
}

export interface ChatMessageContentPartImage {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

export type ChatMessageContentPart = ChatMessageContentPartText | ChatMessageContentPartImage;

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ChatMessageContentPart[];
  name?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string | string[];
}

export interface ProviderHealth {
  is_online: boolean;
  latency_ms: number | null;
  base_url: string;
  error?: string;
}

export interface ChatStreamCallbacks {
  onToken: (token: string) => void;
  onReasoning?: (reasoning: string) => void;
  onComplete: (metrics: {
    full_text: string;
    reasoning_text?: string;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    ttft_ms?: number;
    duration_ms?: number;
    tokens_per_second?: number;
    finish_reason?: string;
  }) => void;
  onError: (error: Error) => void;
}
