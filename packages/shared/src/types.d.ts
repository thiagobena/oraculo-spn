export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';
export interface ModelCapability {
    vision: boolean;
    tools: boolean;
    reasoning: boolean;
}
export interface ModelInfo {
    key: string;
    display_name: string;
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
        errors: number;
    }>;
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
    message_id?: string;
    metrics?: GenerationMetrics;
    error?: string;
}
//# sourceMappingURL=types.d.ts.map