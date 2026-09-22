import { ModelInfo } from '@oraculo/shared';
import { ChatCompletionRequest, ChatStreamCallbacks, ProviderHealth } from './types.js';

export interface AIProvider {
  name: string;
  type: string;

  listModels(): Promise<ModelInfo[]>;
  getModel(key: string): Promise<ModelInfo | null>;
  chat(request: ChatCompletionRequest, signal?: AbortSignal): Promise<{
    content: string;
    reasoning?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    };
    duration_ms: number;
    tokens_per_second?: number;
  }>;
  streamChat(
    request: ChatCompletionRequest,
    callbacks: ChatStreamCallbacks,
    signal?: AbortSignal
  ): Promise<void>;
  cancelGeneration(generationId: string): void;
  getCapabilities(modelKey: string): Promise<{
    vision: boolean;
    tools: boolean;
    reasoning: boolean;
  }>;
  healthCheck(): Promise<ProviderHealth>;
  getTelemetry(): Promise<{
    base_url: string;
    latency_ms: number | null;
    models_count: number;
    loaded_models_count: number;
    status: 'online' | 'offline';
  }>;
}
