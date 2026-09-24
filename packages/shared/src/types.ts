export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ModelCapability {
  vision: boolean;
  tools: boolean;
  reasoning: boolean;
}

export interface ModelSettingItem {
  id?: string;
  model_key: string;
  custom_name?: string | null;
  temperature?: number | null;
  top_p?: number | null;
  max_tokens?: number | null;
  system_prompt?: string | null;
  context_window?: number | null;
  is_active?: boolean;
  is_pinned?: boolean;
  is_paid?: boolean;
  capabilities_override?: Partial<ModelCapability> | null;
  created_at?: string;
  updated_at?: string;
}

export interface ModelInfo {
  key: string;
  display_name: string;
  custom_name?: string | null;
  publisher?: string;
  architecture?: string;
  quantization?: string;
  size?: string;
  params?: string;
  loaded_instances?: number;
  context_length?: number;
  max_context_length?: number;
  capabilities: ModelCapability;
  format?: string;
  is_loaded?: boolean;
  is_active?: boolean;
  is_pinned?: boolean;
  is_paid?: boolean;
  avg_duration_ms?: number;
  avg_tokens_per_second?: number;
  settings?: ModelSettingItem | null;
}

export interface ConversationSummary {
  id: string;
  title: string;
  folder_id?: string | null;
  assistant_id?: string | null;
  default_model: string;
  pinned: boolean;
  archived: boolean;
  created_by_client: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface MessageAttachment {
  id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  file_path: string;
  extracted_text?: string;
}

export interface MessageVersionInfo {
  id: string;
  version_number: number;
  content: string;
  model: string;
  provider: string;
  created_at: string;
}

export interface GenerationMetrics {
  id?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  ttft_ms?: number;
  duration_ms?: number;
  tokens_per_second?: number;
  finish_reason?: string;
  reasoning_content?: string;
  error?: string;
}

export interface MessageItem {
  id: string;
  conversation_id: string;
  parent_message_id?: string | null;
  role: MessageRole;
  content: string;
  model: string;
  provider: string;
  client_id: string;
  client_name: string;
  error?: string | null;
  metadata?: Record<string, any> | null;
  is_edited?: boolean;
  active_version_id?: string | null;
  attachments?: MessageAttachment[];
  generation?: GenerationMetrics | null;
  versions?: MessageVersionInfo[];
  feedback?: {
    rating: 'LIKE' | 'DISLIKE';
    comment?: string;
  } | null;
  created_at: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: MessageItem[];
}

export interface AssistantItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  system_prompt: string;
  default_model: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConversationFolderItem {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  position: number;
  created_by_client: string;
  created_at: string;
  updated_at: string;
}

export interface TelemetryData {
  status: {
    lm_studio: 'online' | 'offline';
    sql_server: 'online' | 'offline';
    backend: 'online';
    frontend: 'online';
    uptime_seconds: number;
    version: string;
  };
  system?: {
    memory_used_mb: number;
    memory_total_mb: number;
    memory_percent: number;
    cpu_cores: number;
    node_heap_used_mb: number;
    node_heap_total_mb: number;
  };
  lm_studio: {
    base_url: string;
    latency_ms: number | null;
    last_check: string;
    total_models: number;
    loaded_models: number;
    available_models: ModelInfo[];
  };
  inference: {
    total_requests: number;
    error_requests: number;
    active_requests: number;
    avg_latency_ms: number;
    avg_ttft_ms: number;
    avg_tokens_per_second: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_tokens: number;
    most_used_model: string | null;
    total_conversations: number;
    total_messages: number;
  };
  history: Array<{
    timestamp: string;
    requests: number;
    avg_tokens_per_second: number;
    latency_ms: number;
    active_requests: number;
    errors: number;
  }>;
  cost_savings?: {
    estimated_usd_saved: number;
    estimated_brl_saved: number;
    cost_per_1k_tokens_usd: number;
  };
  audit_feed?: AuditLogItem[];
  files_summary?: {
    total_files: number;
    total_bytes: number;
    total_mb: number;
  };
  context_efficiency?: {
    avg_context_used_tokens: number;
    avg_context_percent: number;
  };
  routing_status?: {
    primary_provider: string;
    primary_status: 'online' | 'offline';
    fallback_provider: string;
    fallback_status: 'standby' | 'active' | 'offline';
  };
  productivity?: {
    total_hours_saved: number;
    avg_minutes_saved_per_req: number;
  };
  user_feedback_summary?: {
    likes: number;
    dislikes: number;
    csat_percent: number;
  };
  peak_hours?: {
    peak_window: string;
    busiest_hour: string;
  };
}

export interface BenchmarkResult {
  model_key: string;
  prompt_length: number;
  response_length: number;
  ttft_ms: number;
  total_duration_ms: number;
  tokens_per_second: number;
  timestamp: string;
  status: 'SUCCESS' | 'ERROR';
  error_message?: string;
}

export interface RouterModelPerformance {
  model_key: string;
  display_name: string;
  avg_tps_last_50: number;
  avg_latency_ms_last_50: number;
  avg_ttft_ms_last_50: number;
  sample_count: number;
  is_loaded: boolean;
  capabilities: ModelCapability;
}

export interface RouterDecisionLog {
  id: string;
  timestamp: string;
  client_name: string;
  requested_model: string;
  selected_model: string;
  intent_detected: string;
  reason: string;
  candidates_evaluated: Array<{
    model_key: string;
    avg_tps: number;
    score: number;
  }>;
}

export interface AutoRouterReport {
  model_performances: RouterModelPerformance[];
  recent_decisions: RouterDecisionLog[];
  algorithm_info: {
    description: string;
    window_size: number;
    weights: {
      intent: number;
      speed: number;
    };
  };
}

export interface DislikedFeedbackItem {
  id: string;
  message_id: string;
  rating: 'DISLIKE';
  comment?: string | null;
  created_at: string;
  client_id: string;
  message: {
    id: string;
    conversation_id: string;
    content: string;
    model: string;
    provider: string;
    client_name: string;
    created_at: string;
    conversation?: {
      id: string;
      title: string;
    } | null;
    parent?: {
      id: string;
      content: string;
      role: string;
    } | null;
  };
}



export interface AuditLogItem {
  id: string;
  client_id: string;
  client_name: string;
  action: string;
  ip_address?: string | null;
  conversation_id?: string | null;
  message_id?: string | null;
  model?: string | null;
  provider?: string | null;
  status: 'SUCCESS' | 'FAILURE' | 'WARNING';
  details?: Record<string, any> | null;
  created_at: string;
}

export interface StreamChunkEvent {
  type: 'token' | 'reasoning' | 'meta' | 'error' | 'done';
  token?: string;
  reasoning?: string;
  generation_id?: string;
  conversation_id?: string;
  message_id?: string;
  metrics?: GenerationMetrics;
  auto_selected_model?: string;
  auto_reason?: string;
  error?: string;
}

export type UserRole = 'USUARIO' | 'ADMINISTRADOR';

export interface UserItem {
  id: string;
  username: string;
  display_name: string;
  email?: string | null;
  role: UserRole;
  is_active: boolean;
  monthly_token_quota?: number | null;
  tokens_used_this_month?: number;
  rate_limit_rpm?: number;
  can_use_paid_llm?: boolean;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIProviderItem {
  id: string;
  name: string;
  type: string;
  base_url: string;
  api_key?: string | null;
  is_active: boolean;
  is_paid: boolean;
  priority: number;
  timeout_ms: number;
  created_at?: string;
  updated_at?: string;
}

export interface ADConfigData {
  ad_enabled: boolean;
  ad_url: string;
  ad_domain: string;
  ad_base_dn: string;
  ad_bind_dn?: string;
  ad_bind_password?: string;
  ad_search_filter: string;
  ad_admin_group?: string;
}

export interface AuthSessionResponse {
  success: boolean;
  token: string;
  user: UserItem;
}

// --- Hub de Conexões & Conhecimento ---
export type DataSourceCategory = 'database' | 'api' | 'storage' | 'web' | 'automation';

export interface DataSourceConnectorItem {
  id: string;
  name: string;
  category: DataSourceCategory;
  db_type: string; // mysql | mariadb | postgresql | sqlserver | rest_api | n8n | smb | s3 | web_url
  host?: string | null;
  port?: number | null;
  database?: string | null;
  username?: string | null;
  password?: string | null;
  use_ssl: boolean;
  is_active: boolean;
  description?: string | null;
  config_json?: string | null;
  semantic_dictionary?: string | null;
  cache_ttl_seconds: number;
  mode: 'live_query' | 'rag_sync' | 'action_tool';
  allowed_roles?: string | null;
  created_at: string;
  updated_at: string;
  presets?: DataSourcePresetItem[];
}

export interface DataSourcePresetItem {
  id: string;
  connector_id: string;
  title: string;
  description?: string | null;
  category: string; // SLA, Status, Financeiro, Técnico, Geral
  query_payload: string;
  visualization_type: 'table' | 'bar_chart' | 'pie_chart' | 'line_chart' | 'kpi';
  badge_color?: string | null;
  is_system?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SchemaColumnInfo {
  name: string;
  type: string;
  isNullable?: boolean;
  isPrimaryKey?: boolean;
  comment?: string | null;
}

export interface SchemaTableInfo {
  name: string;
  comment?: string | null;
  columns: SchemaColumnInfo[];
}

export interface SchemaIntrospectionResult {
  success: boolean;
  connectorId: string;
  connectorName: string;
  dbType: string;
  tables: SchemaTableInfo[];
  error?: string;
}

export interface NL2SQLRequest {
  connector_id: string;
  user_prompt: string;
}

export interface NL2SQLResponse {
  success: boolean;
  generated_query: string;
  explanation: string;
  visualization_suggestion?: 'table' | 'bar_chart' | 'pie_chart' | 'line_chart' | 'kpi';
  error?: string;
}

export interface QueryExecutionResult {
  success: boolean;
  connectorName?: string;
  rows?: any[];
  columns?: string[];
  totalRows?: number;
  executionTimeMs?: number;
  isCached?: boolean;
  ai_summary?: string;
  error?: string;
}

export interface LGPDConfigData {
  lgpd_level: number; // 0, 25, 50, 75, 100
  lgpd_mode: 'disabled' | 'low' | 'smart' | 'high' | 'strict';
  allow_admin_bypass: boolean;
  mask_cpf: 'none' | 'partial' | 'full';
  mask_email: 'none' | 'partial' | 'full';
  mask_phone: 'none' | 'partial' | 'full';
  mask_financial: 'none' | 'partial' | 'full';
  mask_names: 'none' | 'partial' | 'full';
  audit_sensitive_access: boolean;
  custom_legal_basis_prompt?: string;
}


