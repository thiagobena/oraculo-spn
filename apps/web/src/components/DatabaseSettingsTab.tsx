import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Pencil,
  Trash2,
  Server,
  Eye,
  EyeOff,
  Zap,
  Play,
  Search,
  Table as TableIcon,
  Sparkles,
  Layers,
  Globe,
  FolderSync,
  Bot,
  BarChart3,
  PieChart as PieChartIcon,
  FileSpreadsheet,
  FileCode,
  Clock,
  ShieldCheck,
  BookmarkPlus,
  BookOpen,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import {
  fetchDatabaseConnectorsApi,
  createDatabaseConnectorApi,
  updateDatabaseConnectorApi,
  deleteDatabaseConnectorApi,
  testDatabaseConnectionApi,
  queryDatabaseApi,
  introspectSchemaApi,
  generateNL2SQLApi,
  fetchConnectorPresetsApi,
  createConnectorPresetApi,
  deleteConnectorPresetApi,
} from '../services/api';
import {
  DataSourceConnectorItem,
  DataSourcePresetItem,
  SchemaIntrospectionResult,
  SchemaTableInfo,
  SchemaColumnInfo,
} from '@oraculo/shared';

interface DatabaseSettingsTabProps {
  token: string;
}

const COLORS = ['#06b6d4', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#ef4444', '#14b8a6'];

export const DatabaseSettingsTab: React.FC<DatabaseSettingsTabProps> = ({ token }) => {
  const [connectors, setConnectors] = useState<DataSourceConnectorItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal de Criação / Edição de Conector
  const [showModal, setShowModal] = useState(false);
  const [editingConnector, setEditingConnector] = useState<DataSourceConnectorItem | null>(null);
  const [modalTab, setModalTab] = useState<'connection' | 'semantic' | 'governance'>('connection');
  const [showPassword, setShowPassword] = useState(false);

  // Form State do Conector
  const [formState, setFormState] = useState({
    name: '',
    category: 'database' as 'database' | 'api' | 'storage' | 'web' | 'automation',
    db_type: 'mysql',
    host: '',
    port: 3306,
    database: '',
    username: '',
    password: '',
    use_ssl: false,
    is_active: true,
    description: '',
    config_json: '',
    semantic_dictionary: '',
    cache_ttl_seconds: 0,
    mode: 'live_query' as 'live_query' | 'rag_sync' | 'action_tool',
    allowed_roles: 'ADMINISTRADOR,USUARIO',
  });

  // Status de Teste de Conexão no Card / Tabela
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message?: string; error?: string; latencyMs?: number; dbVersion?: string }>
  >({});

  // Status de Teste no Modal
  const [modalTestResult, setModalTestResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    latencyMs?: number;
    dbVersion?: string;
  } | null>(null);
  const [isModalTesting, setIsModalTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Modal de Introspecção de Esquema
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [schemaConnector, setSchemaConnector] = useState<DataSourceConnectorItem | null>(null);
  const [schemaResult, setSchemaResult] = useState<SchemaIntrospectionResult | null>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);

  // --- QUERY EXPLORER & NL2SQL MODAL ---
  const [showQueryModal, setShowQueryModal] = useState(false);
  const [queryConnector, setQueryConnector] = useState<DataSourceConnectorItem | null>(null);
  const [queryModeTab, setQueryModeTab] = useState<'nl2sql' | 'presets' | 'sql'>('nl2sql');

  // NL2SQL State
  const [nlPrompt, setNlPrompt] = useState('');
  const [isGeneratingNL, setIsGeneratingNL] = useState(false);
  const [nlExplanation, setNlExplanation] = useState<string | null>(null);

  // Presets State
  const [presets, setPresets] = useState<DataSourcePresetItem[]>([]);
  const [showNewPresetModal, setShowNewPresetModal] = useState(false);
  const [newPresetForm, setNewPresetForm] = useState({
    title: '',
    description: '',
    category: 'Operacional',
    query_payload: '',
    visualization_type: 'table' as 'table' | 'bar_chart' | 'pie_chart' | 'line_chart' | 'kpi',
    badge_color: 'cyan',
  });

  // Query Execution State
  const [activeSqlQuery, setActiveSqlQuery] = useState('');
  const [visualizationType, setVisualizationType] = useState<'table' | 'bar_chart' | 'pie_chart' | 'line_chart' | 'kpi'>('table');
  const [queryResult, setQueryResult] = useState<{
    success: boolean;
    rows?: any[];
    columns?: string[];
    totalRows?: number;
    executionTimeMs?: number;
    isCached?: boolean;
    ai_summary?: string;
    error?: string;
  } | null>(null);
  const [isQueryExecuting, setIsQueryExecuting] = useState(false);
  const [generateAISummary, setGenerateAISummary] = useState(true);

  useEffect(() => {
    loadConnectors();
  }, [token]);

  const loadConnectors = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const data = await fetchDatabaseConnectorsApi(token);
      if (data.success && data.connectors) {
        setConnectors(data.connectors);
      }
    } catch (err) {
      console.error('Erro ao carregar conectores:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Filtragem de Conectores
  const filteredConnectors = useMemo(() => {
    return connectors.filter((c) => {
      const matchCategory = activeCategoryFilter === 'all' || c.category === activeCategoryFilter;
      const matchSearch =
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.database || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.db_type.toLowerCase().includes(searchTerm.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [connectors, activeCategoryFilter, searchTerm]);

  // Contagens por Categoria
  const categoryCounts = useMemo(() => {
    const counts = { all: connectors.length, database: 0, api: 0, storage: 0, web: 0, automation: 0 };
    connectors.forEach((c) => {
      if (counts[c.category as keyof typeof counts] !== undefined) {
        counts[c.category as keyof typeof counts]++;
      }
    });
    return counts;
  }, [connectors]);

  // Handlers Modal de Conector
  const handleOpenAddModal = (category: 'database' | 'api' | 'storage' | 'web' | 'automation' = 'database') => {
    setEditingConnector(null);
    let defaultType = 'mysql';
    if (category === 'api') defaultType = 'rest_api';
    if (category === 'automation') defaultType = 'n8n';
    if (category === 'storage') defaultType = 'smb';
    if (category === 'web') defaultType = 'web_url';

    setFormState({
      name: '',
      category,
      db_type: defaultType,
      host: '',
      port: defaultType === 'mysql' ? 3306 : 80,
      database: '',
      username: '',
      password: '',
      use_ssl: false,
      is_active: true,
      description: '',
      config_json: '',
      semantic_dictionary: '',
      cache_ttl_seconds: 0,
      mode: 'live_query',
      allowed_roles: 'ADMINISTRADOR,USUARIO',
    });
    setModalTab('connection');
    setModalTestResult(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (item: DataSourceConnectorItem) => {
    setEditingConnector(item);
    setFormState({
      name: item.name,
      category: item.category || 'database',
      db_type: item.db_type,
      host: item.host || '',
      port: item.port || 3306,
      database: item.database || '',
      username: item.username || '',
      password: '••••••••',
      use_ssl: item.use_ssl,
      is_active: item.is_active,
      description: item.description || '',
      config_json: item.config_json || '',
      semantic_dictionary: item.semantic_dictionary || '',
      cache_ttl_seconds: item.cache_ttl_seconds || 0,
      mode: item.mode || 'live_query',
      allowed_roles: item.allowed_roles || 'ADMINISTRADOR,USUARIO',
    });
    setModalTab('connection');
    setModalTestResult(null);
    setShowModal(true);
  };

  const handleSaveConnector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name.trim()) {
      alert('Por favor, informe o nome do conector.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingConnector) {
        const res = await updateDatabaseConnectorApi(token, editingConnector.id, formState);
        if (res.success) {
          setShowModal(false);
          loadConnectors();
        } else {
          alert(`Erro ao atualizar: ${res.error}`);
        }
      } else {
        const res = await createDatabaseConnectorApi(token, formState);
        if (res.success) {
          setShowModal(false);
          loadConnectors();
        } else {
          alert(`Erro ao cadastrar: ${res.error}`);
        }
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConnector = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente remover o conector "${name}"? Todos os presets associados serão excluídos.`)) return;
    try {
      const res = await deleteDatabaseConnectorApi(token, id);
      if (res.success) {
        loadConnectors();
      } else {
        alert(`Erro: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  };

  const handleTestConnectionItem = async (item: DataSourceConnectorItem) => {
    setTestingId(item.id);
    try {
      const res = await testDatabaseConnectionApi(token, {
        id: item.id,
        category: item.category,
        db_type: item.db_type,
        host: item.host,
        port: item.port,
        database: item.database,
        username: item.username,
        config_json: item.config_json,
      });

      setTestResults((prev) => ({
        ...prev,
        [item.id]: res,
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [item.id]: { success: false, error: err.message },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleTestModalForm = async () => {
    setIsModalTesting(true);
    setModalTestResult(null);
    try {
      const res = await testDatabaseConnectionApi(token, {
        id: editingConnector?.id,
        category: formState.category,
        db_type: formState.db_type,
        host: formState.host,
        port: formState.port,
        database: formState.database,
        username: formState.username,
        password: formState.password,
        use_ssl: formState.use_ssl,
        config_json: formState.config_json,
      });
      setModalTestResult(res);
    } catch (err: any) {
      setModalTestResult({ success: false, error: err.message });
    } finally {
      setIsModalTesting(false);
    }
  };

  // --- Handlers de Introspecção de Esquema ---
  const handleOpenSchemaModal = async (item: DataSourceConnectorItem) => {
    setSchemaConnector(item);
    setShowSchemaModal(true);
    setIsLoadingSchema(true);
    setSchemaResult(null);
    try {
      const res = await introspectSchemaApi(token, item.id);
      setSchemaResult(res);
    } catch (err: any) {
      setSchemaResult({
        success: false,
        connectorId: item.id,
        connectorName: item.name,
        dbType: item.db_type,
        tables: [],
        error: err.message,
      });
    } finally {
      setIsLoadingSchema(false);
    }
  };

  // --- Handlers do Query Explorer ---
  const handleOpenQueryModal = async (item: DataSourceConnectorItem) => {
    setQueryConnector(item);
    setQueryResult(null);
    setNlExplanation(null);
    setNlPrompt('');
    setQueryModeTab(item.category === 'database' ? 'nl2sql' : 'presets');
    setShowQueryModal(true);

    // Carregar presets
    if (item.presets && item.presets.length > 0) {
      setPresets(item.presets);
      setActiveSqlQuery(item.presets[0].query_payload);
      setVisualizationType(item.presets[0].visualization_type || 'table');
    } else {
      try {
        const pRes = await fetchConnectorPresetsApi(token, item.id);
        if (pRes.success && pRes.presets) {
          setPresets(pRes.presets);
          if (pRes.presets.length > 0) {
            setActiveSqlQuery(pRes.presets[0].query_payload);
            setVisualizationType(pRes.presets[0].visualization_type || 'table');
          }
        }
      } catch (_) {}
    }
  };

  const handleGenerateNL2SQL = async (customPrompt?: string) => {
    const p = customPrompt || nlPrompt;
    if (!queryConnector || !p.trim()) return;

    setIsGeneratingNL(true);
    setNlExplanation(null);
    try {
      const res = await generateNL2SQLApi(token, queryConnector.id, p);
      if (res.success && res.generated_query) {
        setActiveSqlQuery(res.generated_query);
        setNlExplanation(res.explanation);
        if (res.visualization_suggestion) {
          setVisualizationType(res.visualization_suggestion);
        }
        await executeQuery(res.generated_query);
      } else {
        alert(`Erro da IA: ${res.error || 'Não foi possível gerar a consulta.'}`);
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setIsGeneratingNL(false);
    }
  };

  const executeQuery = async (queryToRun?: string) => {
    if (!queryConnector) return;
    const sql = queryToRun || activeSqlQuery;
    if (!sql.trim()) return;

    setIsQueryExecuting(true);
    setQueryResult(null);
    try {
      const res = await queryDatabaseApi(token, queryConnector.id, sql, generateAISummary);
      setQueryResult(res);
    } catch (err: any) {
      setQueryResult({ success: false, error: err.message });
    } finally {
      setIsQueryExecuting(false);
    }
  };

  const handleSelectPreset = (preset: DataSourcePresetItem) => {
    setActiveSqlQuery(preset.query_payload);
    setVisualizationType(preset.visualization_type || 'table');
    setNlExplanation(preset.description || null);
    executeQuery(preset.query_payload);
  };

  const handleSaveNewPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryConnector || !newPresetForm.title || !newPresetForm.query_payload) return;

    try {
      const res = await createConnectorPresetApi(token, queryConnector.id, newPresetForm);
      if (res.success && res.preset) {
        setPresets((prev) => [...prev, res.preset]);
        setShowNewPresetModal(false);
        setNewPresetForm({
          title: '',
          description: '',
          category: 'Operacional',
          query_payload: '',
          visualization_type: 'table',
          badge_color: 'cyan',
        });
        loadConnectors();
      } else {
        alert(`Erro ao criar preset: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  };

  const handleDeletePreset = async (presetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Deseja excluir este preset de consulta?')) return;
    try {
      const res = await deleteConnectorPresetApi(token, presetId);
      if (res.success) {
        setPresets((prev) => prev.filter((p) => p.id !== presetId));
        loadConnectors();
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  };

  // Exportações
  const handleExportCSV = () => {
    if (!queryResult?.rows || queryResult.rows.length === 0) return;
    const headers = queryResult.columns || Object.keys(queryResult.rows[0]);
    const csvRows = [
      headers.join(';'),
      ...queryResult.rows.map((row) =>
        headers
          .map((h) => {
            const val = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
            return `"${val.replace(/"/g, '""')}"`;
          })
          .join(';')
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `consulta_${queryConnector?.name || 'dados'}_${Date.now()}.csv`;
    link.click();
  };

  const handleExportJSON = () => {
    if (!queryResult?.rows) return;
    const blob = new Blob([JSON.stringify(queryResult.rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `consulta_${queryConnector?.name || 'dados'}_${Date.now()}.json`;
    link.click();
  };

  // Preparação de dados para Gráficos
  const chartData = useMemo(() => {
    if (!queryResult?.rows || queryResult.rows.length === 0) return [];
    const cols = queryResult.columns || Object.keys(queryResult.rows[0]);
    const labelCol = cols.find((c) => typeof queryResult.rows![0][c] === 'string') || cols[0];
    const numCols = cols.filter((c) => typeof queryResult.rows![0][c] === 'number' || !isNaN(Number(queryResult.rows![0][c])));
    const valueCol = numCols.find((c) => c !== labelCol) || cols[1] || cols[0];

    return queryResult.rows.slice(0, 20).map((row) => ({
      name: String(row[labelCol] || 'Item').slice(0, 25),
      valor: Number(row[valueCol]) || 0,
      ...row,
    }));
  }, [queryResult]);

  return (
    <div className="space-y-5">
      {/* Hero Banner Central */}
      <div className="relative overflow-hidden p-5 bg-gradient-to-r from-slate-900/95 via-cyan-950/30 to-slate-900/95 border border-cyan-500/20 rounded-2xl shadow-xl shadow-cyan-950/20 backdrop-blur-xl">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 rounded-xl text-cyan-400 shadow-inner shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Hub de Conexões & Conhecimento
                </h2>
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-slate-800/80 border border-slate-700/60 rounded-lg text-[11px] font-mono text-slate-300">
                  <span className="text-cyan-400 font-semibold">{connectors.length}</span>
                  <span>conectores cadastrados</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                Central de orquestração de dados corporativos para a IA. Conecte bancos relacionais, APIs REST e automações para consultas em tempo real e RAG.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-start lg:self-center">
            <button
              onClick={() => handleOpenAddModal('database')}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 via-cyan-400 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl shadow-md shadow-cyan-500/20 hover:shadow-cyan-400/30 hover:scale-[1.01] active:scale-[0.99] transition-all"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              Novo Conector
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Filtros por Categoria & Busca */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#0a0d16] border border-slate-800/80 p-2 rounded-xl">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          <button
            onClick={() => setActiveCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 shrink-0 ${
              activeCategoryFilter === 'all'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Todos</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 rounded-md font-mono text-slate-300">{categoryCounts.all}</span>
          </button>

          <button
            onClick={() => setActiveCategoryFilter('database')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 shrink-0 ${
              activeCategoryFilter === 'database'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>Bancos SQL / DW</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 rounded-md font-mono text-slate-300">{categoryCounts.database}</span>
          </button>

          <button
            onClick={() => setActiveCategoryFilter('api')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 shrink-0 ${
              activeCategoryFilter === 'api'
                ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-purple-400" />
            <span>APIs REST & Webhooks</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 rounded-md font-mono text-slate-300">{categoryCounts.api}</span>
          </button>

          <button
            onClick={() => setActiveCategoryFilter('storage')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 shrink-0 ${
              activeCategoryFilter === 'storage'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <FolderSync className="w-3.5 h-3.5 text-emerald-400" />
            <span>Arquivos & SMB</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 rounded-md font-mono text-slate-300">{categoryCounts.storage}</span>
          </button>

          <button
            onClick={() => setActiveCategoryFilter('automation')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 shrink-0 ${
              activeCategoryFilter === 'automation'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Automações n8n</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 rounded-md font-mono text-slate-300">{categoryCounts.automation}</span>
          </button>
        </div>

        <div className="relative min-w-[260px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nome, tipo ou banco..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#060810] border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition"
          />
        </div>
      </div>

      {/* Lista / Tabela Consolidada de Conectores */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-3 bg-[#0a0d16] border border-slate-800/60 rounded-2xl">
          <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
          <span className="text-sm font-medium">Carregando catálogo de conectores...</span>
        </div>
      ) : filteredConnectors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-slate-800 rounded-2xl bg-[#090c15]/60 text-center space-y-4">
          <div className="p-4 bg-cyan-500/10 text-cyan-400 rounded-2xl border border-cyan-500/20 shadow-inner">
            <Server className="w-10 h-10" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-base font-bold text-white">Nenhum conector encontrado</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Adicione seu banco de dados (ex: GLPI, ERP, CRM) ou API corporativa para que o Oráculo consiga trazer informações da empresa.
            </p>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => handleOpenAddModal('database')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
            >
              + Adicionar Banco GLPI
            </button>
            <button
              onClick={() => handleOpenAddModal('api')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
            >
              + Adicionar API REST / n8n
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-[#0b0e17] border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-[#060810]/90 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-[26%]">Conector & Metadados</th>
                  <th className="py-3.5 px-3 w-[14%]">Tipo & Categoria</th>
                  <th className="py-3.5 px-3 w-[19%]">Origem / Endpoint</th>
                  <th className="py-3.5 px-3 w-[10%]">Governança</th>
                  <th className="py-3.5 px-3 w-[13%]">Status & Teste</th>
                  <th className="py-3.5 px-4 w-[18%] text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-xs">
                {filteredConnectors.map((item) => {
                  const testRes = testResults[item.id];
                  const isTesting = testingId === item.id;

                  const isApi = item.category === 'api';
                  const isAutomation = item.category === 'automation';
                  const isStorage = item.category === 'storage';

                  const badgeColor = isApi
                    ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                    : isAutomation
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : isStorage
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30';

                  return (
                    <tr key={item.id} className="hover:bg-slate-900/50 transition-colors group">
                      {/* Col 1: Conector & Metadados */}
                      <td className="py-3.5 px-4 align-middle">
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl border shrink-0 ${badgeColor}`}>
                            {isApi ? (
                              <Globe className="w-4 h-4 text-purple-400" />
                            ) : isStorage ? (
                              <FolderSync className="w-4 h-4 text-emerald-400" />
                            ) : isAutomation ? (
                              <Zap className="w-4 h-4 text-amber-400" />
                            ) : (
                              <Database className="w-4 h-4 text-cyan-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white group-hover:text-cyan-300 transition-colors text-sm truncate">
                                {item.name}
                              </span>
                              {item.presets && item.presets.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 bg-slate-800/90 text-slate-300 rounded border border-slate-700 font-mono shrink-0">
                                  <BookmarkPlus className="w-2.5 h-2.5 text-cyan-400" />
                                  {item.presets.length} presets
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate mt-0.5">
                              {item.description || (isApi ? 'Endpoint API REST corporativo' : 'Banco de dados transacional')}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Col 2: Tipo & Categoria */}
                      <td className="py-3.5 px-3 align-middle">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`uppercase text-[10px] font-extrabold tracking-wider px-2 py-0.5 rounded-md border inline-block ${badgeColor}`}>
                            {item.db_type}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium capitalize">
                            {item.category === 'database' ? 'Banco Relacional' : item.category === 'api' ? 'API REST / Webhook' : item.category}
                          </span>
                        </div>
                      </td>

                      {/* Col 3: Origem / Endpoint */}
                      <td className="py-3.5 px-3 align-middle font-mono text-slate-300 text-[11px]">
                        {item.host ? (
                          <div className="space-y-0.5">
                            <div className="font-medium text-slate-200 truncate max-w-[200px]" title={item.host}>
                              {item.host.replace(/^https?:\/\//, '')}
                              {item.port && !item.host.includes(':') && item.port !== 80 && item.port !== 443 ? `:${item.port}` : ''}
                            </div>
                            {item.database && (
                              <div className="text-[10px] text-slate-400 font-sans flex items-center gap-1">
                                <span>Base:</span>
                                <span className="text-cyan-300 font-mono font-semibold">{item.database}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px] font-sans italic">Config JSON</span>
                        )}
                      </td>

                      {/* Col 4: Governança & Cache */}
                      <td className="py-3.5 px-3 align-middle">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-[11px] text-slate-300">
                            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{item.cache_ttl_seconds > 0 ? `${item.cache_ttl_seconds}s` : 'Tempo Real'}</span>
                          </div>
                          <span className="inline-block text-[10px] px-1.5 py-0.2 bg-slate-800/80 text-slate-400 rounded font-mono">
                            {item.mode}
                          </span>
                        </div>
                      </td>

                      {/* Col 5: Status & Teste */}
                      <td className="py-3.5 px-3 align-middle">
                        <div className="flex flex-col gap-1.5 items-start">
                          <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
                            <span
                              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                                item.is_active
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : 'bg-slate-800/60 text-slate-500 border-slate-700/50'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${item.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                              {item.is_active ? 'Ativo' : 'Inativo'}
                            </span>

                            <button
                              onClick={() => handleTestConnectionItem(item)}
                              disabled={isTesting}
                              className="flex items-center gap-1 px-2 py-0.5 bg-slate-800/90 hover:bg-slate-700 text-cyan-300 hover:text-white text-[10px] font-semibold rounded-md border border-slate-700 transition disabled:opacity-50 shrink-0"
                              title="Testar Conectividade Agora"
                            >
                              <RefreshCw className={`w-2.5 h-2.5 ${isTesting ? 'animate-spin' : ''}`} />
                              {isTesting ? '...' : 'Testar'}
                            </button>
                          </div>

                          {testRes && (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                                testRes.success
                                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                                  : 'bg-rose-950/60 text-rose-300 border-rose-500/30'
                              }`}
                              title={testRes.message || testRes.error}
                            >
                              {testRes.success ? (
                                <>
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                  <span>{testRes.latencyMs}ms</span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-2.5 h-2.5 text-rose-400" />
                                  <span>Erro</span>
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Col 6: Ações & Consulta */}
                      <td className="py-3.5 px-4 align-middle text-right">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap shrink-0">
                          {item.category === 'database' && (
                            <button
                              onClick={() => handleOpenSchemaModal(item)}
                              className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 rounded-lg border border-transparent hover:border-cyan-500/30 transition shrink-0"
                              title="Inspecionar Esquema de Tabelas"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenQueryModal(item)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-cyan-950/90 to-blue-950/90 hover:from-cyan-900 hover:to-blue-900 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-semibold shadow-sm transition shrink-0"
                            title="Consultar Dados / NL2SQL"
                          >
                            <Search className="w-3 h-3 text-cyan-400" />
                            <span>Consultar</span>
                          </button>

                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition shrink-0"
                            title="Editar Conector"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteConnector(item.id, item.name)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition shrink-0"
                            title="Excluir Conector"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- MODAL 1: CADASTRO E EDIÇÃO DO CONECTOR (3 ABAS) --- */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-3xl bg-[#0b0e17] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#080b13]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingConnector ? `Editar Conector: ${editingConnector.name}` : 'Cadastrar Novo Conector de Dados'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Defina os parâmetros de acesso, semântica para IA e políticas de cache.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Tabs Navigation */}
            <div className="flex border-b border-slate-800 bg-[#080b13] px-6">
              <button
                onClick={() => setModalTab('connection')}
                className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
                  modalTab === 'connection'
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Server className="w-3.5 h-3.5" /> 1. Conexão & Credenciais
              </button>
              <button
                onClick={() => setModalTab('semantic')}
                className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
                  modalTab === 'semantic'
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Bot className="w-3.5 h-3.5" /> 2. Dicionário Semântico (IA)
              </button>
              <button
                onClick={() => setModalTab('governance')}
                className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
                  modalTab === 'governance'
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" /> 3. Governança & Cache
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveConnector} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {modalTab === 'connection' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Nome de Identificação *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: GLPI Suporte SPN, ERP Protheus, API Jira"
                        value={formState.name}
                        onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                        className="w-full px-3 py-2 bg-[#060810] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Categoria da Fonte</label>
                      <select
                        value={formState.category}
                        onChange={(e) => {
                          const cat = e.target.value as any;
                          let sub = 'mysql';
                          if (cat === 'api') sub = 'rest_api';
                          if (cat === 'automation') sub = 'n8n';
                          if (cat === 'storage') sub = 'smb';
                          if (cat === 'web') sub = 'web_url';
                          setFormState({ ...formState, category: cat, db_type: sub });
                        }}
                        className="w-full px-3 py-2 bg-[#060810] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="database">Banco de Dados Relacional / DW</option>
                        <option value="api">API REST Corporativa</option>
                        <option value="automation">Automação & Webhook (n8n)</option>
                        <option value="storage">Arquivos & Pastas de Rede (SMB/S3)</option>
                        <option value="web">Portal Web / URL</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Driver / Tipo</label>
                      <select
                        value={formState.db_type}
                        onChange={(e) => setFormState({ ...formState, db_type: e.target.value })}
                        className="w-full px-3 py-2 bg-[#060810] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                      >
                        {formState.category === 'database' && (
                          <>
                            <option value="mysql">MySQL / MariaDB (GLPI Ready)</option>
                            <option value="postgresql">PostgreSQL</option>
                            <option value="sqlserver">Microsoft SQL Server</option>
                            <option value="oracle">Oracle Database</option>
                          </>
                        )}
                        {formState.category === 'api' && (
                          <>
                            <option value="rest_api">REST API (JSON / Swagger)</option>
                            <option value="graphql">GraphQL API</option>
                          </>
                        )}
                        {formState.category === 'automation' && (
                          <>
                            <option value="n8n">n8n Webhook / Workflow</option>
                            <option value="make">Make / Integromat Webhook</option>
                          </>
                        )}
                        {formState.category === 'storage' && (
                          <>
                            <option value="smb">SMB / Pasta Compartilhada Windows</option>
                            <option value="s3">Amazon S3 / MinIO Local</option>
                          </>
                        )}
                        {formState.category === 'web' && (
                          <>
                            <option value="web_url">URL Web / Crawler Intranet</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        {formState.category === 'api' || formState.category === 'automation' || formState.category === 'web'
                          ? 'URL Base / Endpoint'
                          : 'Host / IP Servidor'}
                      </label>
                      <input
                        type="text"
                        placeholder={
                          formState.category === 'api' || formState.category === 'automation'
                            ? 'https://api.empresa.com.br/v1 ou webhook n8n'
                            : 'ex: 82.112.244.169 ou 192.168.1.10'
                        }
                        value={formState.host}
                        onChange={(e) => setFormState({ ...formState, host: e.target.value })}
                        className="w-full px-3 py-2 bg-[#060810] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                      />
                    </div>
                  </div>

                  {formState.category === 'database' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">Porta</label>
                        <input
                          type="number"
                          value={formState.port}
                          onChange={(e) => setFormState({ ...formState, port: Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-[#060810] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">Nome do Banco</label>
                        <input
                          type="text"
                          placeholder="ex: glpi ou erp_db"
                          value={formState.database}
                          onChange={(e) => setFormState({ ...formState, database: e.target.value })}
                          className="w-full px-3 py-2 bg-[#060810] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">Usuário</label>
                        <input
                          type="text"
                          placeholder="ex: glpi_user"
                          value={formState.username}
                          onChange={(e) => setFormState({ ...formState, username: e.target.value })}
                          className="w-full px-3 py-2 bg-[#060810] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        {formState.category === 'api' ? 'API Key / Token Bearer' : 'Senha / Credencial'}
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder={editingConnector ? '•••••••• (Mantenha para não alterar)' : 'Senha de acesso'}
                          value={formState.password}
                          onChange={(e) => setFormState({ ...formState, password: e.target.value })}
                          className="w-full px-3 py-2 bg-[#060810] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500 font-mono pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Descrição / Finalidade</label>
                      <input
                        type="text"
                        placeholder="Ex: Base de chamados técnicos de TI e suporte"
                        value={formState.description}
                        onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                        className="w-full px-3 py-2 bg-[#060810] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-6 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formState.use_ssl}
                        onChange={(e) => setFormState({ ...formState, use_ssl: e.target.checked })}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                      />
                      <span className="text-slate-300 font-medium">Habilitar Conexão Segura SSL / TLS</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formState.is_active}
                        onChange={(e) => setFormState({ ...formState, is_active: e.target.checked })}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                      />
                      <span className="text-slate-300 font-medium">Conector Ativo</span>
                    </label>
                  </div>
                </div>
              )}

              {modalTab === 'semantic' && (
                <div className="space-y-3">
                  <div className="p-3 bg-cyan-950/40 border border-cyan-500/20 rounded-xl flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-cyan-200 leading-relaxed">
                      O <strong>Dicionário Semântico</strong> ensina a IA como interpretar as tabelas, siglas e regras de negócio da sua empresa. Insira aqui descrições em linguagem natural das tabelas principais.
                    </p>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Instruções e Metadados para a IA (NL2SQL):
                    </label>
                    <textarea
                      rows={8}
                      placeholder={`Exemplo:
- Tabela glpi_tickets: Armazena todos os chamados abertos.
  - status: 1 (Novo), 2 (Em atendimento), 4 (Pendente), 5 (Solucionado), 6 (Fechado).
  - priority: 1 a 6 (Muito baixa até Crítica).
  - itilcategories_id: Categoria do chamado (cruzar com glpi_itilcategories).
- Usuários e Técnicos: Estão na tabela glpi_users cruzada com glpi_tickets_users.`}
                      value={formState.semantic_dictionary}
                      onChange={(e) => setFormState({ ...formState, semantic_dictionary: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-[#060810] border border-slate-800 rounded-xl font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              )}

              {modalTab === 'governance' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Tempo de Cache (TTL em Segundos)</label>
                      <input
                        type="number"
                        min="0"
                        max="86400"
                        placeholder="0 = Sem cache (tempo real)"
                        value={formState.cache_ttl_seconds}
                        onChange={(e) => setFormState({ ...formState, cache_ttl_seconds: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-[#060810] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                      />
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        Recomendado: 300s (5min) para dashboards operacionais; 0s para chamados em tempo real.
                      </span>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Modo de Operação</label>
                      <select
                        value={formState.mode}
                        onChange={(e) => setFormState({ ...formState, mode: e.target.value as any })}
                        className="w-full px-3 py-2 bg-[#060810] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="live_query">Consulta em Tempo Real (Live Query / On-Demand)</option>
                        <option value="rag_sync">Indexação e Busca Vetorial (RAG / Documentos)</option>
                        <option value="action_tool">Ferramenta de Ação (Disparo via n8n)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Perfis com Acesso Permitido (RBAC)</label>
                    <input
                      type="text"
                      placeholder="ADMINISTRADOR,USUARIO"
                      value={formState.allowed_roles}
                      onChange={(e) => setFormState({ ...formState, allowed_roles: e.target.value })}
                      className="w-full px-3 py-2 bg-[#060810] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Resultado do Teste no Modal */}
              {modalTestResult && (
                <div
                  className={`p-3 rounded-xl flex items-center gap-2.5 text-xs ${
                    modalTestResult.success
                      ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {modalTestResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
                  <span>{modalTestResult.message || modalTestResult.error}</span>
                </div>
              )}

              {/* Modal Actions Footer */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleTestModalForm}
                  disabled={isModalTesting}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl font-semibold transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isModalTesting ? 'animate-spin' : ''}`} />
                  {isModalTesting ? 'Testando Conexão...' : 'Testar Conexão Agora'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded-xl font-medium transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl shadow-md transition disabled:opacity-50"
                  >
                    {isSaving ? 'Salvando...' : editingConnector ? 'Salvar Alterações' : 'Cadastrar Conector'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: INTROSPECÇÃO DE ESQUEMA (TABELAS E COLUNAS) --- */}
      {showSchemaModal && schemaConnector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-4xl bg-[#0b0e17] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#080b13]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Esquema de Dados:</span>
                    <span className="text-cyan-400 font-mono">{schemaConnector.name}</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Tabelas e estruturas descobertas automaticamente via Introspecção DDL.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSchemaModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 text-xs space-y-4">
              {isLoadingSchema ? (
                <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
                  <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                  <span>Inspecionando banco de dados e catálogo de tabelas...</span>
                </div>
              ) : schemaResult && schemaResult.tables && schemaResult.tables.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Total de Tabelas Descobertas: <strong className="text-white">{schemaResult.tables.length}</strong></span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {schemaResult.tables.map((tbl: SchemaTableInfo) => (
                      <div key={tbl.name} className="p-4 bg-[#060810] border border-slate-800/80 rounded-xl space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="font-mono font-bold text-cyan-300">{tbl.name}</span>
                          <span className="text-[10px] text-slate-500">{tbl.columns.length} colunas</span>
                        </div>
                        <div className="max-h-36 overflow-y-auto space-y-1 font-mono text-[11px] text-slate-400 no-scrollbar">
                          {tbl.columns.map((col: SchemaColumnInfo) => (
                            <div key={col.name} className="flex items-center justify-between py-0.5">
                              <span className="text-slate-300">{col.name}</span>
                              <span className="text-[10px] text-slate-500">{col.type}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  {schemaResult?.error || 'Nenhuma tabela encontrada no esquema da base.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 3: QUERY EXPLORER & ANALYTICS 3.0 (NL2SQL + PRESETS + GRÁFICOS) --- */}
      {showQueryModal && queryConnector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-5xl bg-[#0b0e17] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#080b13]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 rounded-xl text-cyan-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Query Explorer & Analytics:</span>
                    <span className="text-cyan-400 font-mono">{queryConnector.name}</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Consulte em linguagem natural (NL2SQL), utilize presets dinâmicos ou escreva instruções SQL diretas.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowQueryModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Navigation Modes */}
            <div className="flex items-center justify-between border-b border-slate-800 bg-[#080b13] px-6">
              <div className="flex">
                <button
                  onClick={() => setQueryModeTab('nl2sql')}
                  className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
                    queryModeTab === 'nl2sql'
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" /> 💬 Chat com os Dados (NL2SQL)
                </button>
                <button
                  onClick={() => setQueryModeTab('presets')}
                  className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
                    queryModeTab === 'presets'
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" /> ⚡ Presets Rápidos ({presets.length})
                </button>
                <button
                  onClick={() => setQueryModeTab('sql')}
                  className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
                    queryModeTab === 'sql'
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" /> 💻 Modo SQL / Payload Direto
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={generateAISummary}
                    onChange={(e) => setGenerateAISummary(e.target.checked)}
                    className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                  />
                  <span>Gerar Síntese de IA</span>
                </label>
              </div>
            </div>

            {/* Modal Interactive Content */}
            <div className="p-6 overflow-y-auto flex-1 text-xs space-y-4">
              {/* MODO 1: CHAT COM DADOS (NL2SQL) */}
              {queryModeTab === 'nl2sql' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-semibold block">
                      O que você deseja saber desta base de dados? (Linguagem Natural)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Ex: Quais chamados críticos estão atrasados? ou Quantos chamados foram abertos hoje por categoria?"
                        value={nlPrompt}
                        onChange={(e) => setNlPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleGenerateNL2SQL();
                        }}
                        className="flex-1 px-4 py-2.5 bg-[#060810] border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-xs"
                      />
                      <button
                        onClick={() => handleGenerateNL2SQL()}
                        disabled={isGeneratingNL || !nlPrompt.trim()}
                        className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50 transition"
                      >
                        <Sparkles className={`w-4 h-4 ${isGeneratingNL ? 'animate-spin' : ''}`} />
                        {isGeneratingNL ? 'Consultando IA...' : 'Perguntar'}
                      </button>
                    </div>
                  </div>

                  {/* Sugestões Rápidas de Prompt */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Exemplos Rápidos:</span>
                    <button
                      onClick={() => {
                        setNlPrompt('Quais chamados foram abertos hoje?');
                        handleGenerateNL2SQL('Quais chamados foram abertos hoje?');
                      }}
                      className="px-2.5 py-1 bg-slate-800/70 hover:bg-slate-700 text-cyan-300 rounded-lg text-[11px] transition"
                    >
                      "Abertos hoje"
                    </button>
                    <button
                      onClick={() => {
                        setNlPrompt('Mostre o volume de chamados agrupados por status');
                        handleGenerateNL2SQL('Mostre o volume de chamados agrupados por status');
                      }}
                      className="px-2.5 py-1 bg-slate-800/70 hover:bg-slate-700 text-purple-300 rounded-lg text-[11px] transition"
                    >
                      "Resumo por Status"
                    </button>
                    <button
                      onClick={() => {
                        setNlPrompt('Quais chamados estão com SLA vencido?');
                        handleGenerateNL2SQL('Quais chamados estão com SLA vencido?');
                      }}
                      className="px-2.5 py-1 bg-slate-800/70 hover:bg-slate-700 text-amber-300 rounded-lg text-[11px] transition"
                    >
                      "SLA Vencido"
                    </button>
                    <button
                      onClick={() => {
                        setNlPrompt('Top técnicos com mais chamados');
                        handleGenerateNL2SQL('Top técnicos com mais chamados');
                      }}
                      className="px-2.5 py-1 bg-slate-800/70 hover:bg-slate-700 text-emerald-300 rounded-lg text-[11px] transition"
                    >
                      "Ranking de Técnicos"
                    </button>
                  </div>
                </div>
              )}

              {/* MODO 2: PRESETS DINÂMICOS */}
              {queryModeTab === 'presets' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                      Selecione um Preset de Consulta:
                    </span>
                    <button
                      onClick={() => setShowNewPresetModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1 bg-cyan-950/80 hover:bg-cyan-900/90 text-cyan-300 border border-cyan-500/30 rounded-lg text-xs font-semibold transition"
                    >
                      <Plus className="w-3.5 h-3.5" /> + Novo Preset
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {presets.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleSelectPreset(p)}
                        className={`group px-3 py-2 bg-slate-900/90 hover:bg-slate-800 border rounded-xl cursor-pointer transition flex items-center justify-between gap-3 ${
                          activeSqlQuery === p.query_payload
                            ? 'border-cyan-500 text-cyan-300 shadow-md shadow-cyan-950/40'
                            : 'border-slate-800 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs">{p.title}</span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded">
                            {p.category}
                          </span>
                        </div>
                        {!p.is_system && (
                          <button
                            onClick={(e) => handleDeletePreset(p.id, e)}
                            className="text-slate-500 hover:text-rose-400 p-0.5 transition opacity-0 group-hover:opacity-100"
                            title="Excluir preset"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* MODO 3: EDITOR SQL / PAYLOAD */}
              {queryModeTab === 'sql' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-300">Instrução SQL (`SELECT` apenas):</label>
                    <span className="text-[10px] text-cyan-500 font-mono">Agregações 100% da base | Limite seguro 500 linhas</span>
                  </div>
                  <textarea
                    rows={4}
                    value={activeSqlQuery}
                    onChange={(e) => setActiveSqlQuery(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#050711] border border-slate-800 rounded-xl text-xs font-mono text-cyan-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500 resize-none"
                    placeholder="SELECT * FROM glpi_tickets LIMIT 100;"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() => executeQuery()}
                      disabled={isQueryExecuting}
                      className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl flex items-center gap-2 transition"
                    >
                      <Play className="w-3.5 h-3.5" /> Executar Consulta
                    </button>
                  </div>
                </div>
              )}

              {/* Explicação da IA / Lógica da Consulta */}
              {nlExplanation && (
                <div className="p-3.5 bg-cyan-950/30 border border-cyan-500/30 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-cyan-400 font-semibold text-xs">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Lógica da Consulta Interpretada:</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{nlExplanation}</p>
                </div>
              )}

              {/* BARRA DE VISUALIZAÇÃO E EXPORTAÇÃO DOS RESULTADOS */}
              {queryResult && queryResult.success && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs">
                      Encontrados: <strong className="text-white">{queryResult.totalRows ?? 0}</strong> linhas em{' '}
                      <strong className="text-cyan-400 font-mono">{queryResult.executionTimeMs}ms</strong>
                      {queryResult.isCached && <span className="ml-1 text-[10px] text-emerald-400 font-bold">(Cache)</span>}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Botões de Alternância de Visualização */}
                    <div className="flex items-center bg-[#060810] border border-slate-800 rounded-xl p-0.5">
                      <button
                        onClick={() => setVisualizationType('table')}
                        className={`p-1.5 rounded-lg transition ${
                          visualizationType === 'table' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
                        }`}
                        title="Tabela de Dados"
                      >
                        <TableIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setVisualizationType('bar_chart')}
                        className={`p-1.5 rounded-lg transition ${
                          visualizationType === 'bar_chart' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
                        }`}
                        title="Gráfico de Barras"
                      >
                        <BarChart3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setVisualizationType('pie_chart')}
                        className={`p-1.5 rounded-lg transition ${
                          visualizationType === 'pie_chart' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
                        }`}
                        title="Gráfico de Pizza"
                      >
                        <PieChartIcon className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Botões de Exportação */}
                    <button
                      onClick={handleExportCSV}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                      title="Exportar para CSV"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                      <span>CSV</span>
                    </button>
                    <button
                      onClick={handleExportJSON}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
                      title="Exportar JSON"
                    >
                      <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                      <span>JSON</span>
                    </button>
                  </div>
                </div>
              )}

              {/* CARD DE SÍNTESE / INSIGHTS DE IA */}
              {queryResult?.ai_summary && (
                <div className="p-3.5 bg-gradient-to-r from-purple-950/40 via-cyan-950/30 to-slate-900 border border-purple-500/30 rounded-xl space-y-1">
                  <div className="flex items-center gap-2 text-purple-300 font-bold text-xs">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>Síntese Executiva Gerada pela IA:</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed font-sans">{queryResult.ai_summary}</p>
                </div>
              )}

              {/* EXIBIÇÃO DE RESULTADOS */}
              {isQueryExecuting ? (
                <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
                  <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                  <span>Executando consulta nos servidores...</span>
                </div>
              ) : queryResult && !queryResult.success ? (
                <div className="p-4 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-300 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-rose-400" /> Falha na execução da consulta:
                  </div>
                  <p className="font-mono text-xs">{queryResult.error}</p>
                </div>
              ) : queryResult && queryResult.rows ? (
                <div>
                  {/* Visualização 1: Tabela */}
                  {visualizationType === 'table' && (
                    <div className="border border-slate-800 rounded-xl overflow-x-auto max-h-72">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#060810] border-b border-slate-800 sticky top-0 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                            {(queryResult.columns || Object.keys(queryResult.rows[0] || {})).map((col) => (
                              <th key={col} className="py-2.5 px-3.5 font-mono whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                          {queryResult.rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/40 transition">
                              {(queryResult.columns || Object.keys(row)).map((col) => (
                                <td key={col} className="py-2 px-3.5 text-slate-300 whitespace-nowrap">
                                  {row[col] !== undefined && row[col] !== null ? String(row[col]) : '—'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Visualização 2: Gráfico de Barras */}
                  {visualizationType === 'bar_chart' && (
                    <div className="p-4 bg-[#060810] border border-slate-800 rounded-xl h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f293d" />
                          <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                          <YAxis stroke="#94a3b8" fontSize={11} />
                          <Tooltip contentStyle={{ backgroundColor: '#0b0e17', borderColor: '#334155' }} />
                          <Bar dataKey="valor" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Visualização 3: Gráfico de Pizza */}
                  {visualizationType === 'pie_chart' && (
                    <div className="p-4 bg-[#060810] border border-slate-800 rounded-xl h-72 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartData}
                            dataKey="valor"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            fontSize={11}
                          >
                            {chartData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: '#0b0e17', borderColor: '#334155' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 4: NOVO PRESET SALVO --- */}
      {showNewPresetModal && queryConnector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-lg bg-[#0b0e17] border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <BookmarkPlus className="w-5 h-5 text-cyan-400" />
              <span>Salvar Novo Preset de Consulta</span>
            </h3>
            <form onSubmit={handleSaveNewPreset} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Título do Preset *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Chamados do Setor Financeiro"
                  value={newPresetForm.title}
                  onChange={(e) => setNewPresetForm({ ...newPresetForm, title: e.target.value })}
                  className="w-full px-3 py-2 bg-[#060810] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Categoria</label>
                  <select
                    value={newPresetForm.category}
                    onChange={(e) => setNewPresetForm({ ...newPresetForm, category: e.target.value })}
                    className="w-full px-3 py-2 bg-[#060810] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Operacional">Operacional</option>
                    <option value="SLA">SLA</option>
                    <option value="Analytics">Analytics</option>
                    <option value="Técnico">Técnico</option>
                    <option value="Financeiro">Financeiro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Visualização Padrão</label>
                  <select
                    value={newPresetForm.visualization_type}
                    onChange={(e) => setNewPresetForm({ ...newPresetForm, visualization_type: e.target.value as any })}
                    className="w-full px-3 py-2 bg-[#060810] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="table">Tabela</option>
                    <option value="bar_chart">Gráfico de Barras</option>
                    <option value="pie_chart">Gráfico de Pizza</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Instrução SQL *</label>
                <textarea
                  rows={4}
                  required
                  value={newPresetForm.query_payload || activeSqlQuery}
                  onChange={(e) => setNewPresetForm({ ...newPresetForm, query_payload: e.target.value })}
                  className="w-full px-3 py-2 bg-[#060810] border border-slate-800 rounded-xl text-cyan-300 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewPresetModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl"
                >
                  Salvar Preset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
