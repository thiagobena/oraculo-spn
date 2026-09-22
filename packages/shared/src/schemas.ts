import { z } from 'zod';

export const CreateConversationSchema = z.object({
  title: z.string().optional(),
  folder_id: z.string().optional().nullable(),
  assistant_id: z.string().optional().nullable(),
  default_model: z.string(),
  client_id: z.string(),
  client_name: z.string(),
});

export const UpdateConversationSchema = z.object({
  title: z.string().optional(),
  folder_id: z.string().optional().nullable(),
  default_model: z.string().optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export const SendMessageSchema = z.object({
  conversation_id: z.string().optional(),
  parent_message_id: z.string().optional().nullable(),
  content: z.string().min(1, 'Mensagem não pode estar vazia'),
  model: z.string(),
  provider: z.string().default('lmstudio'),
  assistant_id: z.string().optional().nullable(),
  client_id: z.string(),
  client_name: z.string(),
  attachment_ids: z.array(z.string()).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().positive().optional(),
});

export const RegenerateMessageSchema = z.object({
  message_id: z.string(),
  model: z.string(),
  client_id: z.string(),
  client_name: z.string(),
});

export const EditMessageSchema = z.object({
  message_id: z.string(),
  new_content: z.string().min(1),
  model: z.string(),
  client_id: z.string(),
  client_name: z.string(),
});

export const UserFeedbackSchema = z.object({
  message_id: z.string(),
  rating: z.enum(['LIKE', 'DISLIKE']),
  comment: z.string().optional(),
  client_id: z.string(),
});

export const CreateAssistantSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  description: z.string().default(''),
  icon: z.string().default('bot'),
  system_prompt: z.string(),
  default_model: z.string(),
  temperature: z.number().default(0.7),
  top_p: z.number().default(0.95),
  max_tokens: z.number().default(4096),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
});

export const UpdateAssistantSchema = CreateAssistantSchema.partial();

export const LMStudioConfigSchema = z.object({
  base_url: z.string().url('URL inválida'),
  api_token: z.string().optional(),
  timeout_ms: z.number().positive().default(60000),
});

export const FolderSchema = z.object({
  name: z.string().min(1, 'Nome da pasta é obrigatório'),
  color: z.string().optional(),
  icon: z.string().optional(),
  position: z.number().default(0),
  client_id: z.string(),
});

export const LoginSchema = z.object({
  username: z.string().min(1, 'Usuário é obrigatório'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export const ADConfigSchema = z.object({
  ad_enabled: z.boolean().default(true),
  ad_url: z.string().min(1, 'URL do AD é obrigatória'), // ex: ldaps://192.168.254.109:636
  ad_domain: z.string().min(1, 'Domínio do AD é obrigatório'), // ex: empresa.local
  ad_base_dn: z.string().min(1, 'Base DN é obrigatória'), // ex: DC=empresa,DC=local
  ad_bind_dn: z.string().optional().default(''), // Service account (opcional)
  ad_bind_password: z.string().optional().default(''),
  ad_search_filter: z.string().default('(sAMAccountName={{username}})'),
  ad_admin_group: z.string().optional().default(''),
});

export const TestADConfigSchema = ADConfigSchema;

export const UpdateUserRoleSchema = z.object({
  role: z.enum(['USUARIO', 'ADMINISTRADOR']).optional(),
  is_active: z.boolean().optional(),
});

export const UpdateUserQuotaSchema = z.object({
  monthly_token_quota: z.number().nullable().optional(),
  rate_limit_rpm: z.number().min(1).max(1000).optional(),
  can_use_paid_llm: z.boolean().optional(),
  reset_usage_now: z.boolean().optional(),
});

export const SaveAIProviderSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nome é obrigatório'),
  type: z.enum(['lmstudio', 'openai', 'anthropic', 'gemini', 'ollama', 'custom']),
  base_url: z.string().min(1, 'URL base é obrigatória'),
  api_key: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  is_paid: z.boolean().default(false),
  priority: z.number().default(1),
  timeout_ms: z.number().default(60000),
});

export const SaveModelSettingSchema = z.object({
  model_key: z.string().min(1, 'Model key é obrigatória'),
  custom_name: z.string().nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  top_p: z.number().min(0).max(1).nullable().optional(),
  max_tokens: z.number().positive().nullable().optional(),
  system_prompt: z.string().nullable().optional(),
  context_window: z.number().positive().nullable().optional(),
  is_active: z.boolean().optional(),
  is_pinned: z.boolean().optional(),
  is_paid: z.boolean().optional(),
  capabilities_override: z.object({
    vision: z.boolean().optional(),
    tools: z.boolean().optional(),
    reasoning: z.boolean().optional(),
  }).nullable().optional(),
});




