import React, { useState, useEffect } from 'react';
import {
  fetchSettings,
  fetchAssistants,
  createAssistantApi,
  updateAssistantApi,
  deleteAssistantApi,
  fetchAuditLogs,
  fetchProvidersApi,
  saveProviderApi,
  deleteProviderApi,
  testProviderApi,
  updateUserQuotaApi,
  fetchModelSettingsApi,
  saveModelSettingApi,
  resetModelSettingApi,
  manageModelMemoryApi,
} from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { AssistantItem, AuditLogItem, UserItem, ADConfigData, AIProviderItem, ModelInfo, ModelSettingItem } from '@oraculo/shared';
import { DatabaseSettingsTab } from '../components/DatabaseSettingsTab';
import { SemanticIntelligenceTab } from '../components/semantic/SemanticIntelligenceTab';
import { IntegrationsSettingsTab } from '../components/IntegrationsSettingsTab';
import { LGPDSettingsTab } from '../components/LGPDSettingsTab';
import {
  Network,
  Shield,
  Cpu,
  Bot,
  MessageSquare,
  FileText,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  RefreshCw,
  Database,
  Server,
  Users as UsersIcon,
  UserCheck,
  Ban,
  Check,
  Loader2,
  Coins,
  Zap,
  Sliders,
  Globe,
  Key,
  Edit3,
  DollarSign,
  Layers,
  Sparkles,
  Pin,
  Eye,
  Code2,
  Brain,
  RotateCcw,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export const AdminPage: React.FC = () => {
  const { token } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'providers' | 'models' | 'quotas' | 'ad' | 'users' | 'assistants' | 'audit' | 'databases' | 'semantic' | 'messaging' | 'lgpd'>('providers');

  // Gestão de LLMs & Parâmetros State
  const [llmModels, setLlmModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [searchModelTerm, setSearchModelTerm] = useState('');
  const [modelFilterCategory, setModelFilterCategory] = useState<'all' | 'active' | 'vram' | 'custom'>('all');
  const [editingModel, setEditingModel] = useState<ModelInfo | null>(null);
  const [showModelModal, setShowModelModal] = useState(false);
  const [memoryBusyKey, setMemoryBusyKey] = useState<string | null>(null);

  const [modelForm, setModelForm] = useState({
    custom_name: '',
    temperature: 0.7,
    top_p: 0.95,
    max_tokens: 4096,
    system_prompt: '',
    context_window: 4096,
    is_active: true,
    is_pinned: false,
    is_paid: false,
    vision: false,
    tools: false,
    reasoning: false,
  });

  // Multi-Provedores LLM State
  const [providers, setProviders] = useState<AIProviderItem[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Partial<AIProviderItem> | null>(null);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [providerTestResults, setProviderTestResults] = useState<Record<string, { success: boolean; models_count?: number; error?: string }>>({});

  // Active Directory Config
  const [adConfig, setAdConfig] = useState<ADConfigData>({
    ad_enabled: true,
    ad_url: 'ldaps://192.168.254.109:636',
    ad_domain: '',
    ad_base_dn: '',
    ad_bind_dn: '',
    ad_bind_password: '',
    ad_search_filter: '(sAMAccountName={{username}})',
    ad_admin_group: '',
  });

  const [adTestResult, setAdTestResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    userCount?: number;
  } | null>(null);
  const [isTestingAd, setIsTestingAd] = useState(false);
  const [isSavingAd, setIsSavingAd] = useState(false);

  // Users List (RBAC & Cotas)
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [editingUserQuota, setEditingUserQuota] = useState<UserItem | null>(null);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaForm, setQuotaForm] = useState({
    monthly_token_quota: 100000 as number | null,
    rate_limit_rpm: 30,
    can_use_paid_llm: true,
    isUnlimited: false,
  });

  // Assistants
  const [assistants, setAssistants] = useState<AssistantItem[]>([]);
  const [showAddAssistant, setShowAddAssistant] = useState(false);
  const [editingAssistant, setEditingAssistant] = useState<AssistantItem | null>(null);
  const [newAss, setNewAss] = useState({
    name: '',
    description: '',
    system_prompt: '',
    default_model: '',
  });

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditPage, setAuditPage] = useState<number>(1);
  const [auditTotal, setAuditTotal] = useState<number>(0);
  const [auditTotalPages, setAuditTotalPages] = useState<number>(1);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState<boolean>(false);

  useEffect(() => {
    loadSettings();
    loadProviders();
    loadLlmModels();
    loadUsersList();
    loadAssistantsList();
    loadLogs(1);
  }, []);

  const loadLlmModels = async () => {
    if (!token) return;
    setIsLoadingModels(true);
    try {
      const data = await fetchModelSettingsApi(token);
      if (data.success && data.models) {
        setLlmModels(data.models);
      }
    } catch (e: any) {
      console.error('Erro ao buscar modelos LLM:', e);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleOpenModelModal = (model: ModelInfo) => {
    setEditingModel(model);
    const s = model.settings;
    setModelForm({
      custom_name: s?.custom_name || model.custom_name || '',
      temperature: s?.temperature ?? 0.7,
      top_p: s?.top_p ?? 0.95,
      max_tokens: s?.max_tokens ?? 4096,
      system_prompt: s?.system_prompt || '',
      context_window: s?.context_window || model.context_length || 4096,
      is_active: model.is_active !== false,
      is_pinned: Boolean(model.is_pinned),
      is_paid: Boolean(model.is_paid),
      vision: Boolean(model.capabilities?.vision),
      tools: Boolean(model.capabilities?.tools),
      reasoning: Boolean(model.capabilities?.reasoning),
    });
    setShowModelModal(true);
  };

  const handleSaveModelSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingModel) return;

    try {
      const payload = {
        model_key: editingModel.key,
        custom_name: modelForm.custom_name.trim() || null,
        temperature: Number(modelForm.temperature),
        top_p: Number(modelForm.top_p),
        max_tokens: Number(modelForm.max_tokens),
        system_prompt: modelForm.system_prompt.trim() || null,
        context_window: Number(modelForm.context_window),
        is_active: modelForm.is_active,
        is_pinned: modelForm.is_pinned,
        is_paid: modelForm.is_paid,
        capabilities_override: {
          vision: modelForm.vision,
          tools: modelForm.tools,
          reasoning: modelForm.reasoning,
        },
      };

      const res = await saveModelSettingApi(token, payload);
      if (res.success) {
        setShowModelModal(false);
        setEditingModel(null);
        loadLlmModels();
      } else {
        alert(`Erro ao salvar parâmetros: ${res.error}`);
      }
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
  };

  const handleResetModelSettings = async (modelKey: string) => {
    if (!token || !confirm(`Desabilitar personalizações e restaurar os padrões para o modelo ${modelKey}?`)) return;

    try {
      const res = await resetModelSettingApi(token, modelKey);
      if (res.success) {
        loadLlmModels();
      } else {
        alert(`Erro: ${res.error}`);
      }
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
  };

  const handleToggleModelActiveQuick = async (model: ModelInfo) => {
    if (!token) return;
    const newActive = !model.is_active;
    try {
      await saveModelSettingApi(token, {
        model_key: model.key,
        is_active: newActive,
      });
      loadLlmModels();
    } catch (e: any) {
      console.error('Erro ao alternar status ativo:', e);
    }
  };

  const handleManageMemory = async (modelKey: string, action: 'load' | 'unload') => {
    if (!token) return;
    setMemoryBusyKey(modelKey);
    try {
      const res = await manageModelMemoryApi(token, modelKey, action);
      if (res.success) {
        alert(res.message);
        loadLlmModels();
      } else {
        alert(`LM Studio: ${res.error}`);
      }
    } catch (e: any) {
      alert(`Erro ao enviar comando: ${e.message}`);
    } finally {
      setMemoryBusyKey(null);
    }
  };

  const loadSettings = async () => {
    try {
      const res = await fetchSettings();
      if (res.ad) {
        setAdConfig({
          ad_enabled: res.ad.ad_enabled !== false,
          ad_url: res.ad.ad_url || 'ldaps://192.168.254.109:636',
          ad_domain: res.ad.ad_domain || '',
          ad_base_dn: res.ad.ad_base_dn || '',
          ad_bind_dn: res.ad.ad_bind_dn || '',
          ad_bind_password: res.ad.ad_bind_password || '',
          ad_search_filter: res.ad.ad_search_filter || '(sAMAccountName={{username}})',
          ad_admin_group: res.ad.ad_admin_group || '',
        });
      }
    } catch (e: any) {
      console.error('Erro ao carregar configurações:', e);
    }
  };

  const loadProviders = async () => {
    if (!token) return;
    setIsLoadingProviders(true);
    try {
      const data = await fetchProvidersApi(token);
      if (data.success && data.providers) {
        setProviders(data.providers);
      }
    } catch (e: any) {
      console.error('Erro ao buscar provedores:', e);
    } finally {
      setIsLoadingProviders(false);
    }
  };

  const loadUsersList = async () => {
    if (!token) return;
    setIsLoadingUsers(true);
    try {
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.users) {
        setUsers(data.users);
      }
    } catch (e: any) {
      console.error('Erro ao buscar usuários:', e);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const loadAssistantsList = async () => {
    const list = await fetchAssistants();
    setAssistants(list);
  };

  const loadLogs = async (page = auditPage) => {
    setIsLoadingAuditLogs(true);
    try {
      const res = await fetchAuditLogs(page, 20);
      setAuditLogs(res.items || []);
      setAuditTotal(res.total || 0);
      setAuditTotalPages(res.totalPages || 1);
      setAuditPage(res.page || page);
    } catch (e: any) {
      console.error('Erro ao buscar logs de auditoria:', e);
    } finally {
      setIsLoadingAuditLogs(false);
    }
  };

  // --- Handlers Multi-Provedores ---
  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingProvider?.name || !editingProvider?.base_url) return;

    try {
      const res = await saveProviderApi(token, editingProvider);
      if (res.success) {
        setShowProviderModal(false);
        setEditingProvider(null);
        loadProviders();
      } else {
        alert(`Erro ao salvar provedor: ${res.error}`);
      }
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!token || !confirm('Deseja excluir este provedor de IA?')) return;
    try {
      const res = await deleteProviderApi(token, id);
      if (res.success) {
        loadProviders();
      } else {
        alert(`Erro ao remover: ${res.error}`);
      }
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
  };

  const handleTestProviderConnection = async (prov: AIProviderItem) => {
    if (!token) return;
    setTestingProviderId(prov.id);
    try {
      const res = await testProviderApi(token, {
        type: prov.type,
        base_url: prov.base_url,
        api_key: prov.api_key || undefined,
      });
      setProviderTestResults((prev) => ({
        ...prev,
        [prov.id]: res,
      }));
    } catch (e: any) {
      setProviderTestResults((prev) => ({
        ...prev,
        [prov.id]: { success: false, error: e.message },
      }));
    } finally {
      setTestingProviderId(null);
    }
  };

  // --- Handlers Cotas ---
  const handleOpenQuotaModal = (user: UserItem) => {
    setEditingUserQuota(user);
    setQuotaForm({
      monthly_token_quota: user.monthly_token_quota ?? 100000,
      rate_limit_rpm: user.rate_limit_rpm ?? 30,
      can_use_paid_llm: user.can_use_paid_llm !== false,
      isUnlimited: user.monthly_token_quota === null,
    });
    setShowQuotaModal(true);
  };

  const handleSaveUserQuota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingUserQuota) return;

    try {
      const payload = {
        monthly_token_quota: quotaForm.isUnlimited ? null : Number(quotaForm.monthly_token_quota),
        rate_limit_rpm: Number(quotaForm.rate_limit_rpm),
        can_use_paid_llm: quotaForm.can_use_paid_llm,
      };

      const res = await updateUserQuotaApi(token, editingUserQuota.id, payload);
      if (res.success) {
        setShowQuotaModal(false);
        setEditingUserQuota(null);
        loadUsersList();
      } else {
        alert(`Erro: ${res.error}`);
      }
    } catch (e: any) {
      alert(`Erro ao salvar cota: ${e.message}`);
    }
  };

  const handleResetUserQuotaNow = async (userId: string) => {
    if (!token || !confirm('Confirma o reset do consumo mensal do usuário para 0 tokens?')) return;
    try {
      const res = await updateUserQuotaApi(token, userId, { reset_usage_now: true });
      if (res.success) {
        loadUsersList();
      } else {
        alert(`Erro: ${res.error}`);
      }
    } catch (e: any) {
      alert(`Erro ao resetar uso: ${e.message}`);
    }
  };

  // --- Handlers AD ---
  const handleTestAdConnection = async () => {
    if (!token) return;
    setIsTestingAd(true);
    setAdTestResult(null);

    try {
      const res = await fetch('/api/settings/test-ad', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(adConfig),
      });
      const data = await res.json();
      setAdTestResult(data);
    } catch (e: any) {
      setAdTestResult({ success: false, error: e.message });
    } finally {
      setIsTestingAd(false);
    }
  };

  const handleSaveAdSettings = async () => {
    if (!token) return;
    setIsSavingAd(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ad: adConfig }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Configurações do Active Directory salvas com sucesso!');
      } else {
        alert(`Erro: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Erro ao salvar AD: ${e.message}`);
    } finally {
      setIsSavingAd(false);
    }
  };

  // --- Handlers Usuários (RBAC) ---
  const handleUpdateUserRole = async (userId: string, newRole: 'USUARIO' | 'ADMINISTRADOR') => {
    if (!token) return;
    try {
      const res = await fetch(`/api/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        loadUsersList();
      } else {
        alert(`Erro ao alterar permissão: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
  };

  const handleToggleUserStatus = async (userId: string, currentActive: boolean) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/users/${userId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      const data = await res.json();
      if (data.success) {
        loadUsersList();
      } else {
        alert(`Erro ao alterar status: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
  };

  const handleOpenAddAssistant = () => {
    setEditingAssistant(null);
    const firstOnline = llmModels.find((m) => m.is_active !== false);
    setNewAss({
      name: '',
      description: '',
      system_prompt: '',
      default_model: firstOnline ? firstOnline.key : '',
    });
    setShowAddAssistant(true);
  };

  const handleOpenEditAssistant = (ass: AssistantItem) => {
    setEditingAssistant(ass);
    setNewAss({
      name: ass.name,
      description: ass.description || '',
      system_prompt: ass.system_prompt || '',
      default_model: ass.default_model || '',
    });
    setShowAddAssistant(true);
  };

  const handleSaveAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAss.name.trim() || !newAss.system_prompt.trim()) return;

    if (editingAssistant) {
      await updateAssistantApi(editingAssistant.id, newAss);
    } else {
      await createAssistantApi(newAss);
    }

    setEditingAssistant(null);
    setNewAss({ name: '', description: '', system_prompt: '', default_model: '' });
    setShowAddAssistant(false);
    loadAssistantsList();
  };

  const handleDeleteAssistant = async (id: string) => {
    if (confirm('Excluir este assistente?')) {
      await deleteAssistantApi(id);
      loadAssistantsList();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 max-w-6xl mx-auto w-full font-sans text-slate-200">
      <div className="border-b border-[#181b26] pb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            <span>Configurações & Gestão do Oráculo SPN</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Gestão restrita a Administradores (Provedores Multi-LLM, Cotas de Tokens, Active Directory e Usuários).
          </p>
        </div>
      </div>

      {/* Navegação por Abas */}
      <div className="flex items-center gap-1.5 border-b border-[#181b26] pb-3 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('providers')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeTab === 'providers'
              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-md shadow-indigo-950/30'
              : 'text-slate-400 hover:bg-[#141722] hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4 text-indigo-400" /> Provedores Multi-LLM
        </button>

        <button
          onClick={() => setActiveTab('models')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeTab === 'models'
              ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40 shadow-md shadow-purple-950/30'
              : 'text-slate-400 hover:bg-[#141722] hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4 text-purple-400" /> Parâmetros de LLMs
        </button>

        <button
          onClick={() => setActiveTab('quotas')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeTab === 'quotas'
              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 shadow-md shadow-emerald-950/30'
              : 'text-slate-400 hover:bg-[#141722] hover:text-slate-200'
          }`}
        >
          <Coins className="w-4 h-4 text-emerald-400" /> Cotas & Créditos
        </button>

        <button
          onClick={() => setActiveTab('ad')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeTab === 'ad'
              ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40 shadow-md shadow-cyan-950/30'
              : 'text-slate-400 hover:bg-[#141722] hover:text-slate-200'
          }`}
        >
          <Server className="w-4 h-4 text-cyan-400" /> Active Directory (LDAP)
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeTab === 'users'
              ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40 shadow-md shadow-amber-950/30'
              : 'text-slate-400 hover:bg-[#141722] hover:text-slate-200'
          }`}
        >
          <UsersIcon className="w-4 h-4 text-amber-400" /> Usuários (RBAC)
        </button>

        <button
          onClick={() => setActiveTab('assistants')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeTab === 'assistants'
              ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40 shadow-md shadow-cyan-950/30'
              : 'text-slate-400 hover:bg-[#141722] hover:text-slate-200'
          }`}
        >
          <Bot className="w-4 h-4 text-cyan-400" /> Assistentes
        </button>

        <button
          onClick={() => setActiveTab('databases')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeTab === 'databases'
              ? 'bg-gradient-to-r from-cyan-950/80 to-cyan-900/40 text-cyan-300 border border-cyan-500/50 shadow-md shadow-cyan-950/50 ring-1 ring-cyan-500/20'
              : 'text-slate-400 hover:bg-[#141722] hover:text-slate-200'
          }`}
        >
          <Database className="w-4 h-4 text-cyan-400 animate-pulse" /> Hub de Dados & Conexões
        </button>

        <button
          onClick={() => setActiveTab('semantic')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeTab === 'semantic'
              ? 'bg-gradient-to-r from-cyan-950/80 to-indigo-900/40 text-cyan-300 border border-cyan-500/50 shadow-md shadow-cyan-950/50 ring-1 ring-cyan-500/20'
              : 'text-slate-400 hover:bg-[#141722] hover:text-slate-200'
          }`}
        >
          <Network className="w-4 h-4 text-cyan-400" /> Inteligência de Dados & Mapa
        </button>

        <button
          onClick={() => setActiveTab('messaging')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeTab === 'messaging'
              ? 'bg-gradient-to-r from-emerald-950/80 to-cyan-950/40 text-emerald-300 border border-emerald-500/50 shadow-md shadow-emerald-950/50 ring-1 ring-emerald-500/20'
              : 'text-slate-400 hover:bg-[#141722] hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-emerald-400" /> WhatsApp & Telegram
        </button>

        <button
          onClick={() => setActiveTab('lgpd')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeTab === 'lgpd'
              ? 'bg-gradient-to-r from-indigo-950/80 to-purple-950/40 text-indigo-300 border border-indigo-500/50 shadow-md shadow-indigo-950/50 ring-1 ring-indigo-500/20'
              : 'text-slate-400 hover:bg-[#141722] hover:text-slate-200'
          }`}
        >
          <Shield className="w-4 h-4 text-indigo-400" /> LGPD & Privacidade
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeTab === 'audit'
              ? 'bg-slate-800 text-slate-200 border border-slate-700 shadow-md'
              : 'text-slate-400 hover:bg-[#141722] hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4 text-slate-400" /> Logs de Auditoria
        </button>
      </div>

      {/* ABA LGPD & PRIVACIDADE */}
      {activeTab === 'lgpd' && <LGPDSettingsTab token={token || ''} />}

      {/* ABA MENSAGERIA / WHATSAPP & TELEGRAM */}
      {activeTab === 'messaging' && <IntegrationsSettingsTab token={token || ''} />}

      {/* ABA BANCOS DE DADOS */}
      {activeTab === 'databases' && <DatabaseSettingsTab token={token || ''} />}

      {/* ABA INTELIGÊNCIA DE DADOS & CAMADA SEMÂNTICA (VERSÃO 2) */}
      {activeTab === 'semantic' && <SemanticIntelligenceTab token={token || ''} />}

      {/* ABA 1: PROVEDORES MULTI-LLM */}
      {activeTab === 'providers' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-200">Hub de Provedores e Motores de IA</h2>
              <p className="text-xs text-slate-400 mt-1">
                Conecte o servidor local (LM Studio/Ollama) ou APIs corporativas centrais (OpenAI, Claude, Gemini).
              </p>
            </div>
            <button
              onClick={() => {
                setEditingProvider({
                  name: '',
                  type: 'openai',
                  base_url: 'https://api.openai.com/v1',
                  api_key: '',
                  is_active: true,
                  is_paid: true,
                  priority: 1,
                  timeout_ms: 60000,
                });
                setShowProviderModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition shadow-sm"
            >
              <Plus className="w-4 h-4" /> Adicionar Provedor
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {providers.map((prov) => {
              const test = providerTestResults[prov.id];
              return (
                <div
                  key={prov.id}
                  className="bg-[#10121b] border border-[#1d2232] rounded-2xl p-5 space-y-4 relative overflow-hidden"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-100">{prov.name}</h3>
                        {prov.is_paid ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <DollarSign className="w-3 h-3" /> IA Paga / API
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                            <Cpu className="w-3 h-3" /> Gratuito / Local
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 font-mono">{prov.base_url}</p>
                    </div>
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        prov.is_active ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-slate-600'
                      }`}
                    />
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-400 border-t border-[#1a1e2d] pt-3">
                    <div>
                      Tipo: <span className="font-semibold text-slate-200 uppercase">{prov.type}</span>
                    </div>
                    <div>
                      Prioridade: <span className="font-semibold text-slate-200">#{prov.priority}</span>
                    </div>
                    <div>
                      Chave API: <span className="font-mono text-slate-300">{prov.api_key ? '••••••••' : 'Sem chave'}</span>
                    </div>
                  </div>

                  {test && (
                    <div
                      className={`text-xs p-3 rounded-xl flex items-center gap-2 ${
                        test.success
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                      }`}
                    >
                      {test.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      <span>
                        {test.success
                          ? `Conexão bem-sucedida! ${test.models_count ?? 0} modelo(s) encontrado(s).`
                          : `Erro: ${test.error}`}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-[#1a1e2d] pt-3">
                    <button
                      onClick={() => handleTestProviderConnection(prov)}
                      disabled={testingProviderId === prov.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#181c2b] hover:bg-[#202538] text-slate-300 rounded-lg text-xs font-medium transition"
                    >
                      {testingProviderId === prov.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />}
                      <span>Testar Conexão</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingProvider(prov);
                          setShowProviderModal(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#1c2033] rounded-lg transition"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProvider(prov.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-[#1c2033] rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ABA DE GESTÃO DE PARÂMETROS DE LLMS (VISÃO EM TABELA AMIGÁVEL E REFINADA) */}
      {activeTab === 'models' && (
        <div className="space-y-6">
          {/* Cabeçalho & Busca */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                <span>Gestão e Ajuste Fino de Parâmetros de LLMs</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Ajuste temperatura, limite de contexto, prompts do sistema e alocação de VRAM de forma centralizada.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filtrar por nome ou chave..."
                  value={searchModelTerm}
                  onChange={(e) => setSearchModelTerm(e.target.value)}
                  className="bg-[#10121b] border border-[#1d2232] rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 w-56"
                />
              </div>

              <button
                onClick={loadLlmModels}
                disabled={isLoadingModels}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#181c2b] hover:bg-[#202538] text-slate-300 rounded-xl text-xs font-semibold transition border border-[#252b40]"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isLoadingModels ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>
          </div>

          {/* Cards de Métricas Rápidas / Filtros */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={() => setModelFilterCategory('all')}
              className={`p-3.5 rounded-2xl border text-left transition ${
                modelFilterCategory === 'all'
                  ? 'bg-indigo-600/15 border-indigo-500/40 text-slate-100 shadow-sm'
                  : 'bg-[#10121b] border-[#1d2232] text-slate-400 hover:bg-[#141724]'
              }`}
            >
              <div className="text-[11px] font-medium text-slate-400">Total de Modelos</div>
              <div className="text-lg font-bold text-slate-100 mt-0.5">{llmModels.length}</div>
            </button>

            <button
              onClick={() => setModelFilterCategory('active')}
              className={`p-3.5 rounded-2xl border text-left transition ${
                modelFilterCategory === 'active'
                  ? 'bg-emerald-600/15 border-emerald-500/40 text-slate-100 shadow-sm'
                  : 'bg-[#10121b] border-[#1d2232] text-slate-400 hover:bg-[#141724]'
              }`}
            >
              <div className="text-[11px] font-medium text-slate-400">Modelos Ativos</div>
              <div className="text-lg font-bold text-emerald-400 mt-0.5">
                {llmModels.filter((m) => m.is_active !== false).length}
              </div>
            </button>

            <button
              onClick={() => setModelFilterCategory('vram')}
              className={`p-3.5 rounded-2xl border text-left transition ${
                modelFilterCategory === 'vram'
                  ? 'bg-cyan-600/15 border-cyan-500/40 text-slate-100 shadow-sm'
                  : 'bg-[#10121b] border-[#1d2232] text-slate-400 hover:bg-[#141724]'
              }`}
            >
              <div className="text-[11px] font-medium text-slate-400">Alocados em VRAM (RAM)</div>
              <div className="text-lg font-bold text-cyan-400 mt-0.5">
                {llmModels.filter((m) => m.is_loaded).length}
              </div>
            </button>

            <button
              onClick={() => setModelFilterCategory('custom')}
              className={`p-3.5 rounded-2xl border text-left transition ${
                modelFilterCategory === 'custom'
                  ? 'bg-purple-600/15 border-purple-500/40 text-slate-100 shadow-sm'
                  : 'bg-[#10121b] border-[#1d2232] text-slate-400 hover:bg-[#141724]'
              }`}
            >
              <div className="text-[11px] font-medium text-slate-400">Ajustados / Personalizados</div>
              <div className="text-lg font-bold text-purple-400 mt-0.5">
                {llmModels.filter((m) => m.settings && (m.settings.temperature !== null || m.settings.system_prompt || m.settings.custom_name)).length}
              </div>
            </button>
          </div>

          {/* Tabela de Parâmetros de LLMs */}
          <div className="bg-[#10121b] border border-[#1d2232] rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-[#1a1e2d] flex items-center justify-between bg-[#0e1018]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-200">Tabela de Controle de LLMs</span>
                {modelFilterCategory !== 'all' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                    Filtro: {modelFilterCategory.toUpperCase()}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400">
                {llmModels.filter((m) => {
                  const matchesSearch =
                    !searchModelTerm ||
                    m.display_name.toLowerCase().includes(searchModelTerm.toLowerCase()) ||
                    m.key.toLowerCase().includes(searchModelTerm.toLowerCase());
                  if (!matchesSearch) return false;
                  if (modelFilterCategory === 'active') return m.is_active !== false;
                  if (modelFilterCategory === 'vram') return Boolean(m.is_loaded);
                  if (modelFilterCategory === 'custom')
                    return Boolean(m.settings && (m.settings.temperature !== null || m.settings.system_prompt || m.settings.custom_name));
                  return true;
                }).length} modelo(s) exibido(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#141724] text-slate-400 font-semibold border-b border-[#1d2232]">
                  <tr>
                    <th className="py-3.5 px-4 min-w-[220px]">Modelo / Chave Original</th>
                    <th className="py-3.5 px-4">Status & Memória (VRAM)</th>
                    <th className="py-3.5 px-4">Temperatura</th>
                    <th className="py-3.5 px-4">Top P</th>
                    <th className="py-3.5 px-4">Max Tokens / Contexto</th>
                    <th className="py-3.5 px-4">System Prompt</th>
                    <th className="py-3.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#181c2b]">
                  {llmModels
                    .filter((m) => {
                      const matchesSearch =
                        !searchModelTerm ||
                        m.display_name.toLowerCase().includes(searchModelTerm.toLowerCase()) ||
                        m.key.toLowerCase().includes(searchModelTerm.toLowerCase());
                      if (!matchesSearch) return false;
                      if (modelFilterCategory === 'active') return m.is_active !== false;
                      if (modelFilterCategory === 'vram') return Boolean(m.is_loaded);
                      if (modelFilterCategory === 'custom')
                        return Boolean(m.settings && (m.settings.temperature !== null || m.settings.system_prompt || m.settings.custom_name));
                      return true;
                    })
                    .map((m) => {
                      const s = m.settings;
                      const hasCustomSettings = Boolean(s && (s.temperature !== null || s.system_prompt || s.custom_name));
                      const isLoaded = Boolean(m.is_loaded);
                      const temp = s?.temperature ?? 0.7;
                      const topP = s?.top_p ?? 0.95;
                      const maxTok = s?.max_tokens ?? 4096;
                      const ctxWindow = s?.context_window || m.context_length || 4096;

                      // Temp badge color theme
                      let tempColorClass = 'bg-purple-500/10 text-purple-300 border-purple-500/20';
                      if (temp < 0.4) tempColorClass = 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20';
                      else if (temp > 0.8) tempColorClass = 'bg-rose-500/10 text-rose-300 border-rose-500/20';

                      return (
                        <tr key={m.key} className="hover:bg-[#131624] transition group">
                          {/* Coluna 1: Nome & Capacidades */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-100 text-xs">{m.display_name}</span>
                                {m.is_pinned && (
                                  <span title="Modelo Fixado">
                                    <Pin className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                                  </span>
                                )}
                                {hasCustomSettings && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                                    Personalizado
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono break-all">{m.key}</div>
                              <div className="flex items-center gap-1.5 pt-0.5">
                                {m.capabilities?.vision && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1">
                                    <Eye className="w-2.5 h-2.5" /> Visão
                                  </span>
                                )}
                                {m.capabilities?.tools && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                                    <Code2 className="w-2.5 h-2.5" /> Coder
                                  </span>
                                )}
                                {m.capabilities?.reasoning && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                                    <Brain className="w-2.5 h-2.5" /> Raciocínio
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Coluna 2: Status & VRAM */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-2">
                              {/* Toggle Ativo */}
                              <button
                                onClick={() => handleToggleModelActiveQuick(m)}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1.5 transition ${
                                  m.is_active !== false
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-slate-700/20 text-slate-400 border border-slate-700/30'
                                }`}
                                title={m.is_active !== false ? 'Clique para ocultar dos usuários' : 'Clique para ativar para usuários'}
                              >
                                <span className={`w-2 h-2 rounded-full ${m.is_active !== false ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-slate-500'}`} />
                                {m.is_active !== false ? 'Ativo' : 'Ocultado'}
                              </button>

                              {/* Controle VRAM */}
                              <div>
                                {isLoaded ? (
                                  <button
                                    onClick={() => handleManageMemory(m.key, 'unload')}
                                    disabled={memoryBusyKey === m.key}
                                    className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 rounded-md text-[10px] font-medium transition"
                                    title="Descarregar VRAM no LM Studio"
                                  >
                                    {memoryBusyKey === m.key ? (
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                    ) : (
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                    )}
                                    Em VRAM (Descarregar)
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleManageMemory(m.key, 'load')}
                                    disabled={memoryBusyKey === m.key}
                                    className="flex items-center gap-1 px-2 py-0.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 rounded-md text-[10px] font-medium transition"
                                    title="Carregar VRAM via LM Studio"
                                  >
                                    {memoryBusyKey === m.key ? (
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                    ) : (
                                      <Cpu className="w-2.5 h-2.5 text-indigo-400" />
                                    )}
                                    Carregar VRAM
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Coluna 3: Temperatura */}
                          <td className="py-3.5 px-4 font-mono">
                            <span className={`px-2 py-1 rounded-lg border text-xs font-bold ${tempColorClass}`}>
                              {temp.toFixed(2)}
                            </span>
                            <span className="block text-[10px] text-slate-500 mt-1 font-sans">
                              {temp < 0.4 ? '🎯 Fatos/Código' : temp > 0.8 ? '🎨 Criativo' : '⚖️ Equilibrado'}
                            </span>
                          </td>

                          {/* Coluna 4: Top P */}
                          <td className="py-3.5 px-4 font-mono font-semibold text-slate-300">
                            {topP.toFixed(2)}
                          </td>

                          {/* Coluna 5: Max Tokens / Contexto */}
                          <td className="py-3.5 px-4 font-mono">
                            <div className="text-slate-200 font-semibold">{maxTok.toLocaleString('pt-BR')} tok</div>
                            <div className="text-[10px] text-slate-400 font-sans">Janela: {ctxWindow.toLocaleString('pt-BR')} tok</div>
                          </td>

                          {/* Coluna 6: System Prompt */}
                          <td className="py-3.5 px-4 max-w-[200px]">
                            {s?.system_prompt ? (
                              <div className="p-2 bg-[#141824] rounded-lg text-[11px] text-slate-300 border border-[#1e2336] line-clamp-2" title={s.system_prompt}>
                                <FileText className="w-3 h-3 text-indigo-400 inline mr-1" />
                                {s.system_prompt}
                              </div>
                            ) : (
                              <span className="text-slate-500 text-[11px]">Padrão do Sistema</span>
                            )}
                          </td>

                          {/* Coluna 7: Ações */}
                          <td className="py-3.5 px-4 text-right space-x-2">
                            <button
                              onClick={() => handleOpenModelModal(m)}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition shadow-sm inline-flex items-center gap-1"
                            >
                              <Sliders className="w-3.5 h-3.5" />
                              <span>Ajustar</span>
                            </button>

                            {hasCustomSettings && (
                              <button
                                onClick={() => handleResetModelSettings(m.key)}
                                className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-[#1c2033] rounded-lg transition inline-flex items-center"
                                title="Restaurar padrão"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: COTAS & CRÉDITOS DE IAS PAGAS */}
      {activeTab === 'quotas' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold text-slate-200">Gestão de Créditos & Cotas de Tokens por Usuário</h2>
            <p className="text-xs text-slate-400 mt-1">
              Controle o uso das chaves de API pagas (OpenAI, Claude, Gemini). Modelos locais permanecem 100% gratuitos e ilimitados.
            </p>
          </div>

          <div className="bg-[#10121b] border border-[#1d2232] rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-[#1a1e2d] flex items-center justify-between bg-[#0e1018]">
              <span className="text-xs font-semibold text-slate-300">Colaboradores & Limites Mensais</span>
              <button
                onClick={loadUsersList}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Atualizar Tabela
              </button>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-[#141724] text-slate-400 font-semibold border-b border-[#1d2232]">
                <tr>
                  <th className="py-3 px-4">Usuário</th>
                  <th className="py-3 px-4">Perfil</th>
                  <th className="py-3 px-4">Acesso a IAs Pagas</th>
                  <th className="py-3 px-4">Consumo no Mês</th>
                  <th className="py-3 px-4">Cota Mensal</th>
                  <th className="py-3 px-4">Rate Limit (RPM)</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181c2b]">
                {users.map((u) => {
                  const used = u.tokens_used_this_month || 0;
                  const quota = u.monthly_token_quota;
                  const isUnlimited = quota === null || quota === undefined;
                  const percentUsed = !isUnlimited && quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

                  return (
                    <tr key={u.id} className="hover:bg-[#131624] transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100">{u.display_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">@{u.username}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            u.role === 'ADMINISTRADOR'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-slate-700/30 text-slate-300'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {u.can_use_paid_llm !== false ? (
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Habilitado
                          </span>
                        ) : (
                          <span className="text-rose-400 font-semibold flex items-center gap-1">
                            <Ban className="w-3.5 h-3.5" /> Bloqueado
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-medium text-slate-200">
                        {used.toLocaleString('pt-BR')} tokens
                      </td>

                      <td className="py-3 px-4">
                        {isUnlimited ? (
                          <span className="text-indigo-400 font-bold">Ilimitado</span>
                        ) : (
                          <div className="space-y-1 max-w-[140px]">
                            <div className="flex justify-between text-[10px] text-slate-400">
                              <span>{used.toLocaleString('pt-BR')}</span>
                              <span>{quota.toLocaleString('pt-BR')}</span>
                            </div>
                            <div className="w-full bg-[#1e2336] h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  percentUsed > 90 ? 'bg-rose-500' : percentUsed > 70 ? 'bg-amber-400' : 'bg-emerald-400'
                                }`}
                                style={{ width: `${percentUsed}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-300">
                        {u.rate_limit_rpm || 30} req/min
                      </td>

                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenQuotaModal(u)}
                          className="px-2.5 py-1 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 rounded-lg font-medium transition"
                        >
                          Editar Cota
                        </button>
                        <button
                          onClick={() => handleResetUserQuotaNow(u.id)}
                          className="px-2 py-1 bg-[#181c2b] text-slate-400 hover:text-amber-400 rounded-lg transition"
                          title="Resetar uso mensal"
                        >
                          Reset
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 3: ACTIVE DIRECTORY */}
      {activeTab === 'ad' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold text-slate-200">Autenticação Corporativa (LDAP / Active Directory)</h2>
            <p className="text-xs text-slate-400 mt-1">
              Configure a conexão nativa com os Domain Controllers da SPN para autenticação unificada dos usuários.
            </p>
          </div>

          <div className="bg-[#10121b] border border-[#1d2232] rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[#181b26] pb-4">
              <div>
                <span className="text-sm font-semibold text-slate-200">Ativar Autenticação via Active Directory</span>
                <p className="text-xs text-slate-400">Permite que os colaboradores façam login utilizando o usuário da rede SPN.</p>
              </div>
              <input
                type="checkbox"
                checked={adConfig.ad_enabled}
                onChange={(e) => setAdConfig({ ...adConfig, ad_enabled: e.target.checked })}
                className="w-5 h-5 accent-indigo-500 rounded cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">URL do Servidor AD (LDAP / LDAPS)</label>
                <input
                  type="text"
                  value={adConfig.ad_url}
                  onChange={(e) => setAdConfig({ ...adConfig, ad_url: e.target.value })}
                  placeholder="ldaps://192.168.254.109:636"
                  className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Domínio do AD</label>
                <input
                  type="text"
                  value={adConfig.ad_domain}
                  onChange={(e) => setAdConfig({ ...adConfig, ad_domain: e.target.value })}
                  placeholder="spn.local"
                  className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Base DN</label>
                <input
                  type="text"
                  value={adConfig.ad_base_dn}
                  onChange={(e) => setAdConfig({ ...adConfig, ad_base_dn: e.target.value })}
                  placeholder="DC=spn,DC=local"
                  className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Filtro de Busca de Usuários</label>
                <input
                  type="text"
                  value={adConfig.ad_search_filter}
                  onChange={(e) => setAdConfig({ ...adConfig, ad_search_filter: e.target.value })}
                  placeholder="(sAMAccountName={{username}})"
                  className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            {adTestResult && (
              <div
                className={`p-4 rounded-xl text-xs flex items-center gap-3 ${
                  adTestResult.success
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                }`}
              >
                {adTestResult.success ? <CheckCircle className="w-5 h-5 shrink-0" /> : <XCircle className="w-5 h-5 shrink-0" />}
                <div>
                  <div className="font-semibold">{adTestResult.success ? 'Conexão Estabelecida' : 'Falha no Active Directory'}</div>
                  <div>{adTestResult.message || adTestResult.error}</div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-[#181b26] pt-4">
              <button
                onClick={handleTestAdConnection}
                disabled={isTestingAd}
                className="flex items-center gap-2 px-4 py-2 bg-[#181c2b] hover:bg-[#22283d] text-slate-200 rounded-xl text-xs font-medium transition"
              >
                {isTestingAd ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-cyan-400" />}
                <span>Testar Conexão AD</span>
              </button>

              <button
                onClick={handleSaveAdSettings}
                disabled={isSavingAd}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition"
              >
                {isSavingAd ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Salvar AD</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ABA 4: USUÁRIOS (RBAC) */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold text-slate-200">Usuários Registrados & Papéis de Acesso (RBAC)</h2>
            <p className="text-xs text-slate-400 mt-1">Gerencie privilégios de Administrador e ative/desative contas.</p>
          </div>

          <div className="bg-[#10121b] border border-[#1d2232] rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#141724] text-slate-400 font-semibold border-b border-[#1d2232]">
                <tr>
                  <th className="py-3 px-4">Nome Exibido</th>
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Papel (Role)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181c2b]">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[#131624] transition">
                    <td className="py-3 px-4 font-semibold text-slate-100">{u.display_name}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">@{u.username}</td>
                    <td className="py-3 px-4">
                      <select
                        value={u.role}
                        onChange={(e) => handleUpdateUserRole(u.id, e.target.value as any)}
                        className="bg-[#181c2b] border border-[#252b40] rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none"
                      >
                        <option value="USUARIO">USUÁRIO</option>
                        <option value="ADMINISTRADOR">ADMINISTRADOR</option>
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          u.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {u.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleToggleUserStatus(u.id, u.is_active)}
                        className="px-2.5 py-1 bg-[#181c2b] hover:bg-[#22283d] text-slate-300 rounded-lg font-medium transition"
                      >
                        {u.is_active ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 5: ASSISTENTES */}
      {activeTab === 'assistants' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <Bot className="w-5 h-5 text-cyan-400" />
                <span>Assistentes Personalizados & Agentes</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Crie e gerencie personas de assistentes virtuais com instruções comportamentais e modelos dedicados.
              </p>
            </div>
            <button
              onClick={handleOpenAddAssistant}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition shadow-sm"
            >
              <Plus className="w-4 h-4" /> Novo Assistente
            </button>
          </div>

          {assistants.length === 0 ? (
            <div className="bg-[#10121b] border border-[#1d2232] rounded-2xl p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center mx-auto">
                <Bot className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">Nenhum assistente cadastrado</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Cadastre personas de IA personalizadas para ajudar sua equipe em tarefas específicas.
              </p>
              <button
                onClick={handleOpenAddAssistant}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition"
              >
                Criar Primeiro Assistente
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assistants.map((ass) => (
                <div
                  key={ass.id}
                  className="bg-[#10121b] border border-[#1d2232] rounded-2xl p-5 space-y-4 relative overflow-hidden flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
                          <Bot className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-100">{ass.name}</h3>
                            {ass.is_default && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                                Padrão
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{ass.description || 'Sem descrição definida'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditAssistant(ass)}
                          className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-[#1c2033] rounded-lg transition"
                          title="Editar Assistente"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAssistant(ass.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-[#1c2033] rounded-lg transition"
                          title="Excluir Assistente"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="p-3 bg-[#0d0f17] border border-[#1a1e2d] rounded-xl text-xs space-y-1.5">
                      <span className="text-[10px] font-semibold uppercase text-slate-400">System Prompt:</span>
                      <p className="text-slate-300 font-mono text-[11px] line-clamp-3 leading-relaxed">
                        {ass.system_prompt}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-[#1a1e2d] pt-3 text-xs text-slate-400">
                    <div>
                      Modelo Padrão:{' '}
                      <span className="font-mono text-cyan-300 font-semibold">{ass.default_model || 'Automático'}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(ass.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ABA 6: LOGS DE AUDITORIA */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <FileText className="w-5 h-5 text-slate-400" />
                <span>Logs de Auditoria & Rastreador de Ações</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Histórico detalhado de interações, requisições aos modelos, logins e alterações de sistema.
              </p>
            </div>

            <button
              onClick={() => loadLogs(auditPage)}
              disabled={isLoadingAuditLogs}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#181c2b] hover:bg-[#202538] text-slate-300 rounded-xl text-xs font-semibold transition border border-[#252b40] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isLoadingAuditLogs ? 'animate-spin' : ''}`} />
              <span>Atualizar Logs</span>
            </button>
          </div>

          <div className="bg-[#10121b] border border-[#1d2232] rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-[#1a1e2d] flex flex-wrap items-center justify-between gap-2 bg-[#0e1018]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-200">
                  Registros de Eventos ({auditTotal.toLocaleString('pt-BR')})
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  20 logs por página
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Página {auditPage} de {auditTotalPages}
              </span>
            </div>

            {isLoadingAuditLogs && auditLogs.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                <span>Carregando logs de auditoria...</span>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">
                Nenhum log de auditoria registrado até o momento.
              </div>
            ) : (
              <>
                <div className={`overflow-x-auto transition-opacity duration-200 ${isLoadingAuditLogs ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#141724] text-slate-400 font-semibold border-b border-[#1d2232]">
                      <tr>
                        <th className="py-3 px-4">Data / Hora</th>
                        <th className="py-3 px-4">Usuário / Origem</th>
                        <th className="py-3 px-4">Ação</th>
                        <th className="py-3 px-4">Modelo / Provedor</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#181c2b]">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-[#131624] transition">
                          <td className="py-3 px-4 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString('pt-BR')}
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-200">{log.client_name || 'Sistema'}</div>
                            {log.ip_address && (
                              <div className="text-[10px] text-slate-400 font-mono">{log.ip_address}</div>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                              {log.action}
                            </span>
                          </td>

                          <td className="py-3 px-4 font-mono text-slate-300">
                            {log.model || log.provider || '-'}
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                log.status === 'SUCCESS'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : log.status === 'WARNING'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-slate-400 max-w-xs font-mono text-[11px] truncate">
                            {log.details ? JSON.stringify(log.details) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Paginação */}
                {auditTotal > 0 && (
                  <div className="p-4 border-t border-[#1a1e2d] flex flex-wrap items-center justify-between gap-3 bg-[#0e1018] text-xs text-slate-400">
                    <div>
                      Exibindo <span className="font-semibold text-slate-200">{((auditPage - 1) * 20) + 1}</span> a{' '}
                      <span className="font-semibold text-slate-200">{Math.min(auditPage * 20, auditTotal)}</span> de{' '}
                      <span className="font-semibold text-slate-200">{auditTotal.toLocaleString('pt-BR')}</span> logs
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => loadLogs(auditPage - 1)}
                        disabled={auditPage <= 1 || isLoadingAuditLogs}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#181c2b] hover:bg-[#202538] text-slate-300 rounded-lg font-medium transition border border-[#252b40] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Anterior</span>
                      </button>

                      <div className="flex items-center gap-1 px-1">
                        {Array.from({ length: auditTotalPages }, (_, i) => i + 1)
                          .filter((p) => p === 1 || p === auditTotalPages || Math.abs(p - auditPage) <= 1)
                          .reduce<(number | string)[]>((acc, p, idx, arr) => {
                            if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                              acc.push('...');
                            }
                            acc.push(p);
                            return acc;
                          }, [])
                          .map((item, idx) => (
                            item === '...' ? (
                              <span key={`dots-${idx}`} className="px-1 text-slate-500 font-mono text-[11px]">...</span>
                            ) : (
                              <button
                                key={item}
                                onClick={() => loadLogs(Number(item))}
                                disabled={isLoadingAuditLogs}
                                className={`w-7 h-7 rounded-lg text-xs font-semibold flex items-center justify-center transition ${
                                  auditPage === item
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : 'bg-[#141724] text-slate-400 hover:text-slate-200 hover:bg-[#1a1e2d] border border-[#202538]'
                                }`}
                              >
                                {item}
                              </button>
                            )
                          ))}
                      </div>

                      <button
                        onClick={() => loadLogs(auditPage + 1)}
                        disabled={auditPage >= auditTotalPages || isLoadingAuditLogs}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#181c2b] hover:bg-[#202538] text-slate-300 rounded-lg font-medium transition border border-[#252b40] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span>Próxima</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL CRIAR OU EDITAR ASSISTENTE */}
      {showAddAssistant && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveAssistant}
            className="bg-[#10121b] border border-[#1d2232] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-xs"
          >
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Bot className="w-5 h-5 text-cyan-400" />
              <span>{editingAssistant ? 'Editar Assistente Virtus / Persona' : 'Novo Assistente Virtus / Persona'}</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Nome do Assistente</label>
                <input
                  type="text"
                  required
                  value={newAss.name}
                  onChange={(e) => setNewAss({ ...newAss, name: e.target.value })}
                  placeholder="ex: Assistente de TI, Revisor de Código, Analista Financeiro"
                  className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Descrição Curta</label>
                <input
                  type="text"
                  value={newAss.description}
                  onChange={(e) => setNewAss({ ...newAss, description: e.target.value })}
                  placeholder="Finalidade do assistente..."
                  className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Modelo Padrão Associado (Apenas Modelos Online / Ativos)</label>
                <select
                  value={newAss.default_model}
                  onChange={(e) => setNewAss({ ...newAss, default_model: e.target.value })}
                  className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3 py-2 text-slate-200 focus:outline-none"
                >
                  <option value="">Nenhum (Usar modelo ativo global)</option>
                  {llmModels
                    .filter((m) => m.is_active !== false)
                    .map((m) => (
                      <option key={m.key} value={m.key}>
                        🟢 {m.display_name} ({m.key}) {m.is_paid ? '• IA Cloud/Paga' : '• Local'}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">System Prompt (Instruções da Persona)</label>
                <textarea
                  required
                  rows={4}
                  value={newAss.system_prompt}
                  onChange={(e) => setNewAss({ ...newAss, system_prompt: e.target.value })}
                  placeholder="Você é um especialista altamente capacitado..."
                  className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#181b26] pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowAddAssistant(false);
                  setEditingAssistant(null);
                }}
                className="px-4 py-2 bg-[#181c2b] text-slate-300 rounded-xl hover:bg-[#22283d] transition font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition"
              >
                {editingAssistant ? 'Salvar Alterações' : 'Criar Assistente'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL PROVEDOR */}
      {showProviderModal && editingProvider && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveProvider}
            className="bg-[#10121b] border border-[#1d2232] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-xs"
          >
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              <span>{editingProvider.id ? 'Editar Provedor de IA' : 'Novo Provedor de IA'}</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Nome do Provedor</label>
                <input
                  type="text"
                  required
                  value={editingProvider.name || ''}
                  onChange={(e) => setEditingProvider({ ...editingProvider, name: e.target.value })}
                  placeholder="ex: OpenAI Corporativa, LM Studio Local"
                  className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Tipo de Motor</label>
                  <select
                    value={editingProvider.type || 'openai'}
                    onChange={(e) => {
                      const t = e.target.value;
                      let defaultUrl = editingProvider.base_url;
                      if (t === 'openai') defaultUrl = 'https://api.openai.com/v1';
                      if (t === 'anthropic') defaultUrl = 'https://api.anthropic.com/v1';
                      if (t === 'gemini') defaultUrl = 'https://generativelanguage.googleapis.com/v1beta';
                      if (t === 'lmstudio') defaultUrl = 'http://localhost:1234';
                      if (t === 'ollama') defaultUrl = 'http://localhost:11434';
                      setEditingProvider({
                        ...editingProvider,
                        type: t,
                        base_url: defaultUrl,
                        is_paid: ['openai', 'anthropic', 'gemini'].includes(t),
                      });
                    }}
                    className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3 py-2 text-slate-200 focus:outline-none"
                  >
                    <option value="openai">OpenAI (ChatGPT)</option>
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="lmstudio">LM Studio (Local)</option>
                    <option value="ollama">Ollama (Local)</option>
                    <option value="custom">Custom (Compatible)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Prioridade</label>
                  <input
                    type="number"
                    value={editingProvider.priority ?? 1}
                    onChange={(e) => setEditingProvider({ ...editingProvider, priority: Number(e.target.value) })}
                    className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3 py-2 text-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">URL Base (Endpoint)</label>
                <input
                  type="text"
                  required
                  value={editingProvider.base_url || ''}
                  onChange={(e) => setEditingProvider({ ...editingProvider, base_url: e.target.value })}
                  className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Chave de API (API Key)</label>
                <input
                  type="password"
                  value={editingProvider.api_key || ''}
                  onChange={(e) => setEditingProvider({ ...editingProvider, api_key: e.target.value })}
                  placeholder="sk-proj-..."
                  className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingProvider.is_active !== false}
                    onChange={(e) => setEditingProvider({ ...editingProvider, is_active: e.target.checked })}
                    className="w-4 h-4 accent-indigo-500"
                  />
                  <span>Provedor Ativo</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingProvider.is_paid !== false}
                    onChange={(e) => setEditingProvider({ ...editingProvider, is_paid: e.target.checked })}
                    className="w-4 h-4 accent-emerald-500"
                  />
                  <span>IA Paga (Requer Cota)</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#181b26] pt-4">
              <button
                type="button"
                onClick={() => setShowProviderModal(false)}
                className="px-4 py-2 bg-[#181c2b] text-slate-300 rounded-xl hover:bg-[#22283d] transition font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition"
              >
                Salvar Provedor
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL COTA */}
      {showQuotaModal && editingUserQuota && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveUserQuota}
            className="bg-[#10121b] border border-[#1d2232] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-xs"
          >
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Coins className="w-5 h-5 text-emerald-400" />
              <span>Ajustar Cota: {editingUserQuota.display_name}</span>
            </h3>

            <div className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer bg-[#141724] p-3 rounded-xl border border-[#202538]">
                <input
                  type="checkbox"
                  checked={quotaForm.can_use_paid_llm}
                  onChange={(e) => setQuotaForm({ ...quotaForm, can_use_paid_llm: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500"
                />
                <div>
                  <div className="font-semibold text-slate-200">Autorizar Acesso a IAs Pagas</div>
                  <div className="text-[11px] text-slate-400">Se desativado, o usuário só pode acessar modelos locais.</div>
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer bg-[#141724] p-3 rounded-xl border border-[#202538]">
                <input
                  type="checkbox"
                  checked={quotaForm.isUnlimited}
                  onChange={(e) => setQuotaForm({ ...quotaForm, isUnlimited: e.target.checked })}
                  className="w-4 h-4 accent-indigo-500"
                />
                <div>
                  <div className="font-semibold text-slate-200">Cota Mensal Ilimitada</div>
                  <div className="text-[11px] text-slate-400">Sem limite de consumo de tokens no mês.</div>
                </div>
              </label>

              {!quotaForm.isUnlimited && (
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Cota Mensal de Tokens</label>
                  <input
                    type="number"
                    value={quotaForm.monthly_token_quota || 100000}
                    onChange={(e) => setQuotaForm({ ...quotaForm, monthly_token_quota: Number(e.target.value) })}
                    className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3 py-2 text-slate-200 focus:outline-none font-mono"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setQuotaForm({ ...quotaForm, monthly_token_quota: 50000 })}
                      className="px-2 py-1 bg-[#181c2b] text-[11px] text-slate-300 rounded hover:bg-[#20263b]"
                    >
                      50k
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuotaForm({ ...quotaForm, monthly_token_quota: 100000 })}
                      className="px-2 py-1 bg-[#181c2b] text-[11px] text-slate-300 rounded hover:bg-[#20263b]"
                    >
                      100k
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuotaForm({ ...quotaForm, monthly_token_quota: 500000 })}
                      className="px-2 py-1 bg-[#181c2b] text-[11px] text-slate-300 rounded hover:bg-[#20263b]"
                    >
                      500k
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-medium mb-1">Rate Limit (Requisições por Minuto)</label>
                <input
                  type="number"
                  value={quotaForm.rate_limit_rpm}
                  onChange={(e) => setQuotaForm({ ...quotaForm, rate_limit_rpm: Number(e.target.value) })}
                  className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3 py-2 text-slate-200 focus:outline-none font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#181b26] pt-4">
              <button
                type="button"
                onClick={() => setShowQuotaModal(false)}
                className="px-4 py-2 bg-[#181c2b] text-slate-300 rounded-xl hover:bg-[#22283d] transition font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition"
              >
                Salvar Cota
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE PARÂMETROS DA LLM */}
      {showModelModal && editingModel && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#10121b] border border-[#1d2232] rounded-2xl w-full max-w-2xl p-6 space-y-6 shadow-2xl relative">
            <div className="flex items-start justify-between border-b border-[#181b26] pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-indigo-400" />
                  <span>Configurar Parâmetros de LLM</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">{editingModel.key}</p>
              </div>
              <button
                onClick={() => setShowModelModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveModelSettings} className="space-y-5 text-xs">
              {/* Apelido Amigável */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nome Personalizado (Apelido no Seletor)</label>
                <input
                  type="text"
                  value={modelForm.custom_name}
                  onChange={(e) => setModelForm({ ...modelForm, custom_name: e.target.value })}
                  placeholder={editingModel.display_name || editingModel.key}
                  className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              {/* Sliders de Temperatura & Top P com Presets Rápidos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4 bg-[#0d0f17] border border-[#1a1e2d] rounded-xl">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-slate-300 font-semibold">Temperatura (`temperature`)</label>
                    <span className="font-mono text-indigo-400 font-bold">{modelForm.temperature}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={modelForm.temperature}
                    onChange={(e) => setModelForm({ ...modelForm, temperature: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <div className="flex gap-1.5 mt-2.5">
                    <button
                      type="button"
                      onClick={() => setModelForm({ ...modelForm, temperature: 0.1 })}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                        modelForm.temperature === 0.1
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-[#141724] text-slate-400 border-[#202538] hover:text-slate-200'
                      }`}
                    >
                      🎯 0.1 Código/Fatos
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelForm({ ...modelForm, temperature: 0.7 })}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                        modelForm.temperature === 0.7
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : 'bg-[#141724] text-slate-400 border-[#202538] hover:text-slate-200'
                      }`}
                    >
                      ⚖️ 0.7 Padrão
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelForm({ ...modelForm, temperature: 1.2 })}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                        modelForm.temperature === 1.2
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-[#141724] text-slate-400 border-[#202538] hover:text-slate-200'
                      }`}
                    >
                      🎨 1.2 Criativo
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-slate-300 font-semibold">Top P (`top_p`)</label>
                    <span className="font-mono text-cyan-400 font-bold">{modelForm.top_p}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={modelForm.top_p}
                    onChange={(e) => setModelForm({ ...modelForm, top_p: parseFloat(e.target.value) })}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                  <div className="flex gap-1.5 mt-2.5">
                    <button
                      type="button"
                      onClick={() => setModelForm({ ...modelForm, top_p: 0.5 })}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                        modelForm.top_p === 0.5
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-[#141724] text-slate-400 border-[#202538] hover:text-slate-200'
                      }`}
                    >
                      0.5 Focus
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelForm({ ...modelForm, top_p: 0.95 })}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                        modelForm.top_p === 0.95
                          ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                          : 'bg-[#141724] text-slate-400 border-[#202538] hover:text-slate-200'
                      }`}
                    >
                      0.95 Padrão
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelForm({ ...modelForm, top_p: 1.0 })}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                        modelForm.top_p === 1.0
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : 'bg-[#141724] text-slate-400 border-[#202538] hover:text-slate-200'
                      }`}
                    >
                      1.0 Completo
                    </button>
                  </div>
                </div>
              </div>

              {/* Max Tokens & Janela de Contexto com Sliders e Trava de Segurança */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4 bg-[#0d0f17] border border-[#1a1e2d] rounded-xl">
                {/* Janela de Contexto */}
                <div>
                  {(() => {
                    const maxAllowedCtx = Math.min(editingModel.max_context_length || editingModel.context_length || 16384, 16384);
                    return (
                      <>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-slate-300 font-semibold">Janela de Contexto (`context_window`)</label>
                          <span className="font-mono text-purple-400 font-bold">{modelForm.context_window.toLocaleString('pt-BR')} tok</span>
                        </div>
                        <input
                          type="range"
                          min="1024"
                          max={maxAllowedCtx}
                          step="512"
                          value={Math.min(modelForm.context_window, maxAllowedCtx)}
                          onChange={(e) => {
                            const newCtx = Number(e.target.value);
                            const newMaxTokens = Math.min(modelForm.max_tokens, Math.floor(newCtx / 2));
                            setModelForm({
                              ...modelForm,
                              context_window: newCtx,
                              max_tokens: newMaxTokens > 0 ? newMaxTokens : 256,
                            });
                          }}
                          className="w-full accent-purple-500 cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                          <span>1.024 tok</span>
                          <span className="text-purple-400 font-medium">🔒 Trava: max {maxAllowedCtx.toLocaleString('pt-BR')} tok</span>
                        </div>
                        <div className="flex gap-1 mt-2.5 flex-wrap">
                          {[2048, 4096, 8192, 16384].filter(val => val <= maxAllowedCtx).map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => {
                                const newMaxTokens = Math.min(modelForm.max_tokens, Math.floor(val / 2));
                                setModelForm({
                                  ...modelForm,
                                  context_window: val,
                                  max_tokens: newMaxTokens > 0 ? newMaxTokens : 256,
                                });
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border transition ${
                                modelForm.context_window === val
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                  : 'bg-[#141724] text-slate-400 border-[#202538] hover:text-slate-200'
                              }`}
                            >
                              {val / 1024}k
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Max Tokens por Resposta */}
                <div>
                  {(() => {
                    const maxAllowedOutput = Math.min(Math.floor(modelForm.context_window / 2), 8192);
                    return (
                      <>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-slate-300 font-semibold">Max Tokens por Resposta (`max_tokens`)</label>
                          <span className="font-mono text-emerald-400 font-bold">{modelForm.max_tokens.toLocaleString('pt-BR')} tok</span>
                        </div>
                        <input
                          type="range"
                          min="256"
                          max={maxAllowedOutput}
                          step="256"
                          value={Math.min(modelForm.max_tokens, maxAllowedOutput)}
                          onChange={(e) => setModelForm({ ...modelForm, max_tokens: Number(e.target.value) })}
                          className="w-full accent-emerald-500 cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                          <span>256 tok</span>
                          <span className="text-emerald-400 font-medium">🔒 Trava dinâmica: max {maxAllowedOutput.toLocaleString('pt-BR')} tok</span>
                        </div>
                        <div className="flex gap-1 mt-2.5 flex-wrap">
                          {[512, 1024, 2048, 4096, 8192].filter(val => val <= maxAllowedOutput).map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setModelForm({ ...modelForm, max_tokens: val })}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border transition ${
                                modelForm.max_tokens === val
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-[#141724] text-slate-400 border-[#202538] hover:text-slate-200'
                              }`}
                            >
                              {val < 1024 ? `${val}` : `${val / 1024}k`}
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* System Prompt Customizado da LLM */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">System Prompt Customizado da LLM</label>
                <textarea
                  rows={3}
                  value={modelForm.system_prompt}
                  onChange={(e) => setModelForm({ ...modelForm, system_prompt: e.target.value })}
                  placeholder="Instruções comportamentais fixas injetadas sempre que este modelo for utilizado..."
                  className="w-full bg-[#181c2b] border border-[#252b40] rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Options & Capabilities */}
              <div className="space-y-3 p-4 bg-[#0d0f17] border border-[#1a1e2d] rounded-xl">
                <span className="text-slate-300 font-semibold block text-xs">Comportamento e Capacidades Override</span>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modelForm.is_active}
                      onChange={(e) => setModelForm({ ...modelForm, is_active: e.target.checked })}
                      className="w-4 h-4 accent-indigo-500 rounded"
                    />
                    <span>Modelo Ativo (Visível)</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modelForm.is_pinned}
                      onChange={(e) => setModelForm({ ...modelForm, is_pinned: e.target.checked })}
                      className="w-4 h-4 accent-amber-500 rounded"
                    />
                    <span>Fixar no Topo do Seletor</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modelForm.vision}
                      onChange={(e) => setModelForm({ ...modelForm, vision: e.target.checked })}
                      className="w-4 h-4 accent-cyan-500 rounded"
                    />
                    <span>Suporta Visão (Imagens)</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modelForm.tools}
                      onChange={(e) => setModelForm({ ...modelForm, tools: e.target.checked })}
                      className="w-4 h-4 accent-indigo-500 rounded"
                    />
                    <span>Especialista em Código/Tools</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modelForm.reasoning}
                      onChange={(e) => setModelForm({ ...modelForm, reasoning: e.target.checked })}
                      className="w-4 h-4 accent-purple-500 rounded"
                    />
                    <span>Suporta Raciocínio Profundo</span>
                  </label>
                </div>
              </div>

              {/* Footer buttons */}
              <div className="flex justify-end gap-3 border-t border-[#181b26] pt-4">
                <button
                  type="button"
                  onClick={() => setShowModelModal(false)}
                  className="px-4 py-2 bg-[#181c2b] text-slate-300 rounded-xl hover:bg-[#22283d] transition font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition shadow-sm"
                >
                  Salvar Parâmetros
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
