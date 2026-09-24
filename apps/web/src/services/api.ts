import {
  ConversationSummary,
  ConversationDetail,
  ModelInfo,
  AssistantItem,
  TelemetryData,
  BenchmarkResult,
  AuditLogItem,
  StreamChunkEvent,
  AutoRouterReport,
  DislikedFeedbackItem,
  LGPDConfigData,
} from '@oraculo/shared';

const API_BASE = '/api';

export async function fetchTelemetry(): Promise<TelemetryData> {
  const res = await fetch(`${API_BASE}/telemetry`);
  const data = await res.json();
  return data.telemetry;
}

export async function fetchAutoRouterReportApi(): Promise<AutoRouterReport> {
  const res = await fetch(`${API_BASE}/telemetry/auto-router`);
  const data = await res.json();
  return data.report;
}

export async function fetchDislikedFeedbacksApi(): Promise<DislikedFeedbackItem[]> {
  const res = await fetch(`${API_BASE}/telemetry/dislikes`);
  const data = await res.json();
  return data.dislikes || [];
}


export async function runBenchmarkApi(modelKey?: string): Promise<BenchmarkResult> {

  const res = await fetch(`${API_BASE}/telemetry/benchmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_key: modelKey }),
  });
  const data = await res.json();
  return data.benchmark;
}

export function connectTelemetryWebSocket(
  onUpdate: (data: TelemetryData) => void,
  onError?: (err: any) => void
): () => void {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/telemetry/ws`;

  let socket: WebSocket | null = null;
  let isClosedIntentionally = false;
  let reconnectTimer: any = null;

  const connect = () => {
    socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'telemetry_update' && payload.telemetry) {
          onUpdate(payload.telemetry);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket telemetry update:', err);
      }
    };

    socket.onerror = (err) => {
      if (onError) onError(err);
    };

    socket.onclose = () => {
      if (!isClosedIntentionally) {
        // Retry connection in 3 seconds
        reconnectTimer = setTimeout(connect, 3000);
      }
    };
  };

  connect();

  return () => {
    isClosedIntentionally = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (socket) socket.close();
  };
}


export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export async function fetchModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${API_BASE}/models`);
  const data = await res.json();
  return data.models || [];
}

export async function fetchConversations(clientId: string, search?: string): Promise<ConversationSummary[]> {
  const params = new URLSearchParams({ client_id: clientId });
  if (search) params.append('search', search);
  const res = await fetch(`${API_BASE}/conversations?${params.toString()}`);
  const data = await res.json();
  return data.conversations || [];
}

export async function fetchConversationDetail(id: string): Promise<ConversationDetail> {
  const res = await fetch(`${API_BASE}/conversations/${id}`);
  const data = await res.json();
  return data.conversation;
}

export async function createConversationApi(params: {
  title?: string;
  default_model: string;
  assistant_id?: string | null;
  client_id: string;
  client_name: string;
}): Promise<ConversationSummary> {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  return data.conversation;
}

export async function updateConversationApi(
  id: string,
  params: { title?: string; pinned?: boolean; folder_id?: string | null; default_model?: string }
) {
  const res = await fetch(`${API_BASE}/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function deleteConversationApi(id: string, clientId: string, clientName: string) {
  const params = new URLSearchParams({ client_id: clientId, client_name: clientName });
  const res = await fetch(`${API_BASE}/conversations/${id}?${params.toString()}`, {
    method: 'DELETE',
  });
  return res.json();
}

export async function fetchAssistants(): Promise<AssistantItem[]> {
  const res = await fetch(`${API_BASE}/assistants`);
  const data = await res.json();
  return data.assistants || [];
}

export async function createAssistantApi(data: Partial<AssistantItem>) {
  const res = await fetch(`${API_BASE}/assistants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateAssistantApi(id: string, data: Partial<AssistantItem>) {
  const res = await fetch(`${API_BASE}/assistants/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteAssistantApi(id: string) {
  const res = await fetch(`${API_BASE}/assistants/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function uploadFileApi(file: File, clientId: string, clientName: string, conversationId?: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('client_id', clientId);
  formData.append('client_name', clientName);
  if (conversationId) formData.append('conversation_id', conversationId);

  const res = await fetch(`${API_BASE}/files`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  return data.attachment;
}


export async function fetchAuditLogs(page = 1, limit = 20): Promise<{ items: AuditLogItem[]; total: number; page: number; totalPages: number }> {
  const res = await fetch(`${API_BASE}/audit?page=${page}&limit=${limit}`);
  const data = await res.json();
  return data;
}

export async function fetchSettings() {
  const res = await fetch(`${API_BASE}/settings`);
  return res.json();
}

export async function updateSettingsApi(payload: any) {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function testLmStudioApi(payload: { base_url?: string; api_token?: string }) {
  const res = await fetch(`${API_BASE}/settings/test-lmstudio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchProvidersApi(token: string) {
  const res = await fetch(`${API_BASE}/settings/providers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function saveProviderApi(token: string, providerData: any) {
  const res = await fetch(`${API_BASE}/settings/providers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(providerData),
  });
  return res.json();
}

export async function deleteProviderApi(token: string, id: string) {
  const res = await fetch(`${API_BASE}/settings/providers/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function testProviderApi(token: string, payload: { type: string; base_url: string; api_key?: string }) {
  const res = await fetch(`${API_BASE}/settings/test-provider`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function updateUserQuotaApi(
  token: string,
  userId: string,
  quotaData: { monthly_token_quota?: number | null; rate_limit_rpm?: number; can_use_paid_llm?: boolean; reset_usage_now?: boolean }
) {
  const res = await fetch(`${API_BASE}/users/${userId}/quota`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(quotaData),
  });
  return res.json();
}

export async function cancelGenerationApi(generationId: string) {
  const res = await fetch(`${API_BASE}/chat/${generationId}/cancel`, { method: 'POST' });
  return res.json();
}

export async function sendFeedbackApi(messageId: string, rating: 'LIKE' | 'DISLIKE', clientId: string, comment?: string) {
  const res = await fetch(`${API_BASE}/chat/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message_id: messageId, rating, comment, client_id: clientId }),
  });
  return res.json();
}

export async function streamChatApi(
  payload: {
    conversation_id?: string;
    content: string;
    model: string;
    assistant_id?: string | null;
    client_id: string;
    client_name: string;
    attachment_ids?: string[];
  },
  onChunk: (chunk: StreamChunkEvent) => void,
  signal?: AbortSignal
) {
  const response = await fetch(`${API_BASE}/chat/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({ error: 'Erro de comunicação' }));
    throw new Error(errJson.error || `HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error('ReadableStream não suportado no navegador');
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
      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.slice(6);
        try {
          const event: StreamChunkEvent = JSON.parse(jsonStr);
          onChunk(event);
        } catch (e) {
          // Ignore partial JSON
        }
      }
    }
  }
}

export async function fetchModelSettingsApi(token: string) {
  const res = await fetch(`${API_BASE}/settings/models`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function saveModelSettingApi(token: string, payload: any) {
  const res = await fetch(`${API_BASE}/settings/models`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function resetModelSettingApi(token: string, modelKey: string) {
  const res = await fetch(`${API_BASE}/settings/models/${encodeURIComponent(modelKey)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function manageModelMemoryApi(token: string, modelKey: string, action: 'load' | 'unload') {
  const res = await fetch(`${API_BASE}/settings/models/${encodeURIComponent(modelKey)}/memory`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action }),
  });
  return res.json();
}

// --- Conectores de Banco de Dados e Hub Universal de Dados ---
export async function fetchDatabaseConnectorsApi(token: string) {
  const res = await fetch(`${API_BASE}/settings/databases`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function createDatabaseConnectorApi(token: string, payload: any) {
  const res = await fetch(`${API_BASE}/settings/databases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function updateDatabaseConnectorApi(token: string, id: string, payload: any) {
  const res = await fetch(`${API_BASE}/settings/databases/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function deleteDatabaseConnectorApi(token: string, id: string) {
  const res = await fetch(`${API_BASE}/settings/databases/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function testDatabaseConnectionApi(token: string, payload: any) {
  const res = await fetch(`${API_BASE}/settings/databases/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function introspectSchemaApi(token: string, connectorId: string) {
  const res = await fetch(`${API_BASE}/settings/databases/schema`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ connector_id: connectorId }),
  });
  return res.json();
}

export async function generateNL2SQLApi(token: string, connectorId: string, userPrompt: string) {
  const res = await fetch(`${API_BASE}/settings/databases/nl2sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ connector_id: connectorId, user_prompt: userPrompt }),
  });
  return res.json();
}

export async function queryDatabaseApi(token: string, connectorId: string, sql: string, generateSummary?: boolean) {
  const res = await fetch(`${API_BASE}/settings/databases/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ connector_id: connectorId, sql, generate_summary: generateSummary }),
  });
  return res.json();
}

export async function fetchConnectorPresetsApi(token: string, connectorId: string) {
  const res = await fetch(`${API_BASE}/settings/databases/${connectorId}/presets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function createConnectorPresetApi(token: string, connectorId: string, payload: any) {
  const res = await fetch(`${API_BASE}/settings/databases/${connectorId}/presets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function updateConnectorPresetApi(token: string, presetId: string, payload: any) {
  const res = await fetch(`${API_BASE}/settings/databases/presets/${presetId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function deleteConnectorPresetApi(token: string, presetId: string) {
  const res = await fetch(`${API_BASE}/settings/databases/presets/${presetId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

// --- Gestão de Conformidade e Políticas de LGPD & Privacidade ---
export async function fetchLGPDConfigApi(token: string): Promise<{ success: boolean; config: LGPDConfigData; error?: string }> {
  const res = await fetch(`${API_BASE}/settings/lgpd`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function saveLGPDConfigApi(token: string, payload: Partial<LGPDConfigData>): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/settings/lgpd`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}




