import { create } from 'zustand';
import {
  ConversationSummary,
  ConversationDetail,
  ModelInfo,
  AssistantItem,
  MessageItem,
} from '@oraculo/shared';
import {
  fetchModels,
  fetchConversations,
  fetchConversationDetail,
  fetchAssistants,
  streamChatApi,
  cancelGenerationApi,
  fetchHealth,
} from '../services/api';

interface ChatStoreState {
  clientId: string;
  clientName: string;
  setIdentity: (name: string) => void;

  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  isLmStudioOnline: boolean;
  isDbOnline: boolean;
  checkSystemHealth: () => Promise<void>;

  models: ModelInfo[];
  selectedModel: string;
  setSelectedModel: (modelKey: string) => void;
  loadModels: () => Promise<void>;

  assistants: AssistantItem[];
  selectedAssistant: AssistantItem | null;
  setSelectedAssistant: (assistant: AssistantItem | null) => void;
  loadAssistants: () => Promise<void>;

  conversations: ConversationSummary[];
  activeConversation: ConversationDetail | null;
  loadConversations: () => Promise<void>;
  selectConversation: (id: string | null) => Promise<void>;
  startNewChat: () => void;

  isStreaming: boolean;
  streamingToken: string;
  streamingReasoning: string;
  streamingStartTime: number | null;
  activeGenerationId: string | null;

  sendMessage: (content: string, attachmentIds?: string[], attachmentItems?: any[]) => Promise<void>;
  regenerateLastMessage: () => Promise<void>;
  stopGeneration: () => void;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function getOrCreateClientId(): string {
  try {
    let id = localStorage.getItem('oraculo_client_id');
    if (!id) {
      id = generateUUID();
      localStorage.setItem('oraculo_client_id', id);
    }
    return id;
  } catch {
    return generateUUID();
  }
}

function getStoredClientName(): string {
  try {
    const authRaw = localStorage.getItem('oraculo_spn_user_info');
    if (authRaw) {
      const parsed = JSON.parse(authRaw);
      if (parsed.full_name) return parsed.full_name;
      if (parsed.username) return parsed.username;
    }
    return localStorage.getItem('oraculo_client_name') || '';
  } catch {
    return '';
  }
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  clientId: getOrCreateClientId(),
  clientName: getStoredClientName(),

  setIdentity: (name: string) => {
    localStorage.setItem('oraculo_client_name', name);
    set({ clientName: name });
  },

  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  searchQuery: '',
  setSearchQuery: (searchQuery) => {
    set({ searchQuery });
    get().loadConversations();
  },

  isLmStudioOnline: true,
  isDbOnline: true,

  checkSystemHealth: async () => {
    try {
      const res = await fetchHealth();
      set({
        isLmStudioOnline: res.services?.lm_studio?.status === 'ONLINE',
        isDbOnline: res.services?.database?.status === 'ONLINE',
      });
    } catch {
      set({ isLmStudioOnline: false, isDbOnline: false });
    }
  },

  models: [],
  selectedModel: 'auto',
  setSelectedModel: (modelKey) => set({ selectedModel: modelKey }),

  loadModels: async () => {
    try {
      const models = await fetchModels();
      set({ models });
    } catch (e) {
      console.error('Failed to load models:', e);
    }
  },

  assistants: [],
  selectedAssistant: null,
  setSelectedAssistant: (selectedAssistant) => set({ selectedAssistant }),

  loadAssistants: async () => {
    try {
      const assistants = await fetchAssistants();
      set({ assistants });
      if (!get().selectedAssistant && assistants.length > 0) {
        const defaultAss = assistants.find((a) => a.is_default) || assistants[0];
        set({ selectedAssistant: defaultAss });
      }
    } catch (e) {
      console.error('Failed to load assistants:', e);
    }
  },

  conversations: [],
  activeConversation: null,

  loadConversations: async () => {
    const { clientId, searchQuery } = get();
    try {
      const list = await fetchConversations(clientId, searchQuery);
      set({ conversations: list });
    } catch (e) {
      console.error('Failed to load conversations:', e);
    }
  },

  selectConversation: async (id) => {
    if (!id) {
      set({ activeConversation: null });
      return;
    }
    try {
      const detail = await fetchConversationDetail(id);
      set({ activeConversation: detail, selectedModel: detail.default_model });
    } catch (e) {
      console.error('Failed to load conversation detail:', e);
    }
  },

  startNewChat: () => {
    set({
      activeConversation: null,
      streamingToken: '',
      streamingReasoning: '',
      streamingStartTime: null,
      isStreaming: false,
      activeGenerationId: null,
    });
  },

  isStreaming: false,
  streamingToken: '',
  streamingReasoning: '',
  streamingStartTime: null,
  activeGenerationId: null,

  sendMessage: async (content, attachmentIds, attachmentItems) => {
    const {
      clientId,
      clientName,
      selectedModel,
      selectedAssistant,
      activeConversation,
      loadConversations,
      selectConversation,
    } = get();

    if (!content.trim() && (!attachmentIds || attachmentIds.length === 0)) return;
    if (!selectedModel) {
      alert('Selecione um modelo do LM Studio antes de enviar.');
      return;
    }

    set({
      isStreaming: true,
      streamingToken: '',
      streamingReasoning: '',
      streamingStartTime: Date.now(),
    });

    let currentConvId = activeConversation?.id;
    const initialTitle = content.replace(/^\[Estilo: .*?\]\s*/, '').slice(0, 45).trim() || 'Nova Conversa';

    const tempUserMsg: MessageItem = {
      id: `temp-${Date.now()}`,
      conversation_id: currentConvId || '',
      role: 'user',
      content,
      model: selectedModel,
      provider: 'lmstudio',
      client_id: clientId,
      client_name: clientName,
      created_at: new Date().toISOString(),
      attachments: attachmentItems && attachmentItems.length > 0
        ? attachmentItems.map((a) => ({
            id: a.id,
            filename: a.name || a.filename || 'anexo',
            original_name: a.name || a.original_name || 'anexo',
            mime_type: a.type || a.mime_type || 'application/octet-stream',
            file_size: 0,
            file_path: a.url || `/api/files/${a.id}/raw`,
            status: 'ready',
            created_at: new Date().toISOString(),
          }))
        : undefined,
    };

    if (activeConversation) {
      set({
        activeConversation: {
          ...activeConversation,
          title: activeConversation.title === 'Nova Conversa' ? initialTitle : activeConversation.title,
          messages: [...activeConversation.messages, tempUserMsg],
        },
      });
    } else {
      set({
        activeConversation: {
          id: currentConvId || `temp-conv-${Date.now()}`,
          title: initialTitle,
          default_model: selectedModel,
          pinned: false,
          archived: false,
          created_by_client: clientId,
          created_by_name: clientName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [tempUserMsg],
        },
      });
    }

    try {
      await streamChatApi(
        {
          conversation_id: currentConvId,
          content,
          model: selectedModel,
          assistant_id: selectedAssistant?.id,
          client_id: clientId,
          client_name: clientName,
          attachment_ids: attachmentIds,
        },
        async (chunk) => {
          if (chunk.type === 'meta') {
            if (chunk.conversation_id) {
              currentConvId = chunk.conversation_id;
              set((state) => ({
                activeConversation: state.activeConversation
                  ? {
                      ...state.activeConversation,
                      id: chunk.conversation_id!,
                      messages: state.activeConversation.messages.map((m) =>
                        m.id === tempUserMsg.id ? { ...m, conversation_id: chunk.conversation_id! } : m
                      ),
                    }
                  : null,
              }));
            }
            if (chunk.generation_id) {
              set({ activeGenerationId: chunk.generation_id });
            }
          } else if (chunk.type === 'token') {
            set((state) => ({ streamingToken: state.streamingToken + (chunk.token || '') }));
          } else if (chunk.type === 'reasoning') {
            set((state) => ({ streamingReasoning: state.streamingReasoning + (chunk.reasoning || '') }));
          } else if (chunk.type === 'done') {
            set({ isStreaming: false, streamingStartTime: null, activeGenerationId: null });
            if (currentConvId) {
              await selectConversation(currentConvId);
              await loadConversations();
            }
          } else if (chunk.type === 'error') {
            set({ isStreaming: false, streamingStartTime: null, activeGenerationId: null });
            alert(`Erro na resposta da IA: ${chunk.error}`);
          }
        }
      );
    } catch (err: any) {
      set({ isStreaming: false, streamingStartTime: null, activeGenerationId: null });
      alert(`Falha na comunicação com a API: ${err.message}`);
    }
  },

  regenerateLastMessage: async () => {
    const { activeConversation, isStreaming, sendMessage } = get();
    if (isStreaming || !activeConversation || activeConversation.messages.length === 0) return;

    const messages = activeConversation.messages;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;

    if (messages[messages.length - 1].role === 'assistant') {
      set({
        activeConversation: {
          ...activeConversation,
          messages: messages.slice(0, messages.length - 1),
        },
      });
    }

    const attachmentIds = lastUserMsg.attachments?.map((a) => a.id);
    await sendMessage(lastUserMsg.content, attachmentIds);
  },

  stopGeneration: () => {
    const { activeGenerationId } = get();
    if (activeGenerationId) {
      cancelGenerationApi(activeGenerationId);
      set({ isStreaming: false, streamingStartTime: null, activeGenerationId: null });
    }
  },
}));
