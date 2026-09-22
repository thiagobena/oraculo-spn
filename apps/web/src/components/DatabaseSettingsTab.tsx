import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import {
  fetchDatabaseConnectorsApi,
  createDatabaseConnectorApi,
  updateDatabaseConnectorApi,
  deleteDatabaseConnectorApi,
  testDatabaseConnectionApi,
  queryDatabaseApi,
} from '../services/api';

export interface DatabaseConnectorItem {
  id: string;
  name: string;
  db_type: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  use_ssl: boolean;
  is_active: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

interface DatabaseSettingsTabProps {
  token: string;
}

export const DatabaseSettingsTab: React.FC<DatabaseSettingsTabProps> = ({ token }) => {
  const [connectors, setConnectors] = useState<DatabaseConnectorItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingConnector, setEditingConnector] = useState<DatabaseConnectorItem | null>(null);

  // Status de Teste de Conexão
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message?: string; error?: string; latencyMs?: number; dbVersion?: string }>
  >({});

  // Query Explorer Modal State
  const [showQueryModal, setShowQueryModal] = useState(false);
  const [queryConnector, setQueryConnector] = useState<DatabaseConnectorItem | null>(null);
  const DEFAULT_GLPI_QUERY = `SELECT 
  t.id, 
  t.name AS titulo, 
  t.date AS data_abertura, 
  CASE t.status 
    WHEN 1 THEN 'Novo' 
    WHEN 2 THEN 'Em atendimento (Atribuído)' 
    WHEN 3 THEN 'Em atendimento (Planejado)' 
    WHEN 4 THEN 'Pendente' 
    WHEN 5 THEN 'Solucionado' 
    WHEN 6 THEN 'Fechado' 
    ELSE 'Outro' 
  END AS status_nome,
  CASE t.priority 
    WHEN 1 THEN 'Muito Baixa' 
    WHEN 2 THEN 'Baixa' 
    WHEN 3 THEN 'Média' 
    WHEN 4 THEN 'Alta' 
    WHEN 5 THEN 'Muito Alta' 
    WHEN 6 THEN 'Maior' 
    ELSE 'Normal' 
  END AS prioridade,
  CASE t.type WHEN 1 THEN 'Incidente' WHEN 2 THEN 'Requisição' ELSE 'Geral' END AS tipo,
  COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
  COALESCE(NULLIF(CONCAT(COALESCE(u_req.firstname, ''), ' ', COALESCE(u_req.realname, '')), ' '), u_req.name, 'Não identificado') AS requerente,
  COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_req ON (t.id = tu_req.tickets_id AND tu_req.type = 1)
LEFT JOIN glpi_users u_req ON tu_req.users_id = u_req.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.is_deleted = 0
ORDER BY t.id DESC
LIMIT 50;`;

  const [activeSqlQuery, setActiveSqlQuery] = useState(DEFAULT_GLPI_QUERY);
  const [queryResult, setQueryResult] = useState<{
    success: boolean;
    rows?: any[];
    columns?: string[];
    totalRows?: number;
    error?: string;
  } | null>(null);
  const [isQueryExecuting, setIsQueryExecuting] = useState(false);

  // Form State
  const [formState, setFormState] = useState({
    name: '',
    db_type: 'mysql',
    host: '',
    port: 3306,
    database: '',
    username: '',
    password: '',
    use_ssl: false,
    is_active: true,
    description: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [modalTestResult, setModalTestResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    latencyMs?: number;
    dbVersion?: string;
  } | null>(null);
  const [isModalTesting, setIsModalTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
      console.error('Erro ao carregar conexões de banco:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingConnector(null);
    setFormState({
      name: '',
      db_type: 'mysql',
      host: '',
      port: 3306,
      database: '',
      username: '',
      password: '',
      use_ssl: false,
      is_active: true,
      description: '',
    });
    setModalTestResult(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (item: DatabaseConnectorItem) => {
    setEditingConnector(item);
    setFormState({
      name: item.name,
      db_type: item.db_type,
      host: item.host,
      port: item.port,
      database: item.database,
      username: item.username,
      password: '••••••••',
      use_ssl: item.use_ssl,
      is_active: item.is_active,
      description: item.description || '',
    });
    setModalTestResult(null);
    setShowModal(true);
  };

  const handleOpenQueryModal = (item: DatabaseConnectorItem) => {
    setQueryConnector(item);
    setQueryResult(null);
    setActiveSqlQuery(DEFAULT_GLPI_QUERY);
    setShowQueryModal(true);
  };

  const handleExecuteQuery = async () => {
    if (!queryConnector || !activeSqlQuery.trim()) return;
    setIsQueryExecuting(true);
    setQueryResult(null);
    try {
      const res = await queryDatabaseApi(token, queryConnector.id, activeSqlQuery);
      setQueryResult(res);
    } catch (err: any) {
      setQueryResult({ success: false, error: err.message });
    } finally {
      setIsQueryExecuting(false);
    }
  };

  const handleDbTypeChange = (type: string) => {
    let defaultPort = 3306;
    if (type === 'postgresql') defaultPort = 5432;
    if (type === 'sqlserver') defaultPort = 1433;
    if (type === 'oracle') defaultPort = 1521;

    setFormState((prev) => ({
      ...prev,
      db_type: type,
      port: prev.port === 3306 || prev.port === 5432 || prev.port === 1433 || prev.port === 1521 ? defaultPort : prev.port,
    }));
  };

  const handleTestConnectionItem = async (item: DatabaseConnectorItem) => {
    setTestingId(item.id);
    try {
      const res = await testDatabaseConnectionApi(token, {
        id: item.id,
        db_type: item.db_type,
        host: item.host,
        port: item.port,
        database: item.database,
        username: item.username,
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
        db_type: formState.db_type,
        host: formState.host,
        port: formState.port,
        database: formState.database,
        username: formState.username,
        password: formState.password,
        use_ssl: formState.use_ssl,
      });
      setModalTestResult(res);
    } catch (err: any) {
      setModalTestResult({ success: false, error: err.message });
    } finally {
      setIsModalTesting(false);
    }
  };

  const handleSaveConnector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name.trim() || !formState.host.trim() || !formState.database.trim() || !formState.username.trim()) {
      alert('Por favor, preencha todos os campos obrigatórios (Nome, Host, Banco e Usuário).');
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
          alert(`Erro ao atualizar conexão: ${res.error}`);
        }
      } else {
        const res = await createDatabaseConnectorApi(token, formState);
        if (res.success) {
          setShowModal(false);
          loadConnectors();
        } else {
          alert(`Erro ao criar conexão: ${res.error}`);
        }
      }
    } catch (err: any) {
      alert(`Erro ao salvar: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConnector = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir o conector de banco de dados "${name}"?`)) return;

    try {
      const res = await deleteDatabaseConnectorApi(token, id);
      if (res.success) {
        loadConnectors();
      } else {
        alert(`Erro ao excluir: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Erro ao excluir: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Premium Hero Banner */}
      <div className="relative overflow-hidden p-6 bg-gradient-to-r from-slate-900/90 via-cyan-950/40 to-slate-900/90 border border-cyan-500/25 rounded-2xl shadow-xl shadow-cyan-950/20 backdrop-blur-xl">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/40 rounded-xl text-cyan-400 shadow-inner">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  Conectores de Banco de Dados
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mt-0.5 text-[11px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 rounded-full">
                  <Zap className="w-3 h-3 text-cyan-400" /> GLPI / MySQL / Postgres Ready
                </span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-300/90 leading-relaxed pl-0 md:pl-12">
              Cadastre as credenciais de acesso direto aos bancos de dados corporativos (ex: GLPI, ERP, CRM) para consulta inteligente da IA em tempo real.
            </p>
          </div>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-cyan-500 via-cyan-400 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-500/25 hover:shadow-cyan-400/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Novo Conector de Banco
          </button>
        </div>
      </div>

      {/* Connectors Data Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-3 bg-[#0a0d16] border border-slate-800/60 rounded-2xl">
          <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
          <span className="text-sm font-medium">Carregando conectores de banco de dados...</span>
        </div>
      ) : connectors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-slate-800 rounded-2xl bg-[#090c15]/60 text-center space-y-4">
          <div className="p-4 bg-cyan-500/10 text-cyan-400 rounded-2xl border border-cyan-500/20 shadow-inner">
            <Server className="w-10 h-10" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-base font-bold text-white">Nenhum banco de dados conectado</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Cadastre seu banco de dados do GLPI ou outros sistemas para que o Oráculo consiga trazer informações da empresa.
            </p>
          </div>
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold rounded-xl border border-slate-700 transition shadow-sm"
          >
            + Adicionar Banco GLPI
          </button>
        </div>
      ) : (
        <div className="bg-[#0b0e17] border border-slate-800/90 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#060810] border-b border-slate-800/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Nome do Conector</th>
                  <th className="py-3.5 px-4">Tipo</th>
                  <th className="py-3.5 px-4">Host / Porta</th>
                  <th className="py-3.5 px-4">Banco de Dados</th>
                  <th className="py-3.5 px-4">Usuário</th>
                  <th className="py-3.5 px-4">Status & Teste</th>
                  <th className="py-3.5 px-4 text-right">Ações & Consulta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {connectors.map((item) => {
                  const testRes = testResults[item.id];
                  const isTesting = testingId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-slate-900/60 transition-colors group">
                      {/* Name & Desc */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gradient-to-br from-cyan-950/80 to-slate-900 border border-cyan-500/30 rounded-lg text-cyan-400 shrink-0">
                            <Database className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-white group-hover:text-cyan-300 transition-colors block text-sm">
                              {item.name}
                            </span>
                            {item.description && (
                              <span className="text-[11px] text-slate-400 line-clamp-1 italic block">
                                {item.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-4">
                        <span className="uppercase text-[10px] font-extrabold tracking-wider px-2.5 py-1 bg-slate-800/90 text-cyan-300 border border-cyan-500/25 rounded-md inline-block">
                          {item.db_type}
                        </span>
                      </td>

                      {/* Host & Port */}
                      <td className="py-3.5 px-4 font-mono text-slate-200 text-xs">
                        {item.host}:{item.port}
                      </td>

                      {/* Database */}
                      <td className="py-3.5 px-4 font-mono text-slate-300 text-xs">
                        {item.database}
                      </td>

                      {/* Username */}
                      <td className="py-3.5 px-4 font-mono text-cyan-400 font-medium text-xs">
                        {item.username}
                      </td>

                      {/* Status & Test Button */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
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
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/90 hover:bg-slate-700 text-cyan-300 hover:text-white text-[11px] font-semibold rounded-lg border border-slate-700 transition disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
                            {isTesting ? 'Testando...' : 'Testar'}
                          </button>

                          {/* Test Result Badge */}
                          {testRes && (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border ${
                                testRes.success
                                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                                  : 'bg-rose-950/60 text-rose-300 border-rose-500/30'
                              }`}
                              title={testRes.message || testRes.error}
                            >
                              {testRes.success ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>{testRes.latencyMs}ms</span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-3 h-3 text-rose-400" />
                                  <span>Erro</span>
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions & Query Button */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenQueryModal(item)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-950/90 to-blue-950/90 hover:from-cyan-900 hover:to-blue-900 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-semibold shadow-sm transition"
                            title="Consultar Dados / Chamados GLPI"
                          >
                            <Search className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Consultar Dados</span>
                          </button>

                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                            title="Editar Conexão"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteConnector(item.id, item.name)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition"
                            title="Excluir Conexão"
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

      {/* MODAL DE CONSULTA DE DADOS (GLPI QUERY EXPLORER) */}
      {showQueryModal && queryConnector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-4xl bg-[#0b0e17] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#080b13]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Consulta de Dados:</span>
                    <span className="text-cyan-400 font-mono">{queryConnector.name}</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Execute consultas de leitura (SELECT) ou selecione um preset para visualizar dados do GLPI.
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

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Presets Rápidos do GLPI */}
              <div className="space-y-2">
                <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider block">
                  Presets Rápidos GLPI:
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      setActiveSqlQuery(
                        `SELECT t.id, t.name AS titulo, t.date AS data_abertura, 
CASE t.status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento (Atribuído)' WHEN 3 THEN 'Em atendimento (Planejado)' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Outro' END AS status_nome,
CASE t.priority WHEN 1 THEN 'Muito Baixa' WHEN 2 THEN 'Baixa' WHEN 3 THEN 'Média' WHEN 4 THEN 'Alta' WHEN 5 THEN 'Muito Alta' WHEN 6 THEN 'Maior' ELSE 'Normal' END AS prioridade,
COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
COALESCE(NULLIF(CONCAT(COALESCE(u_req.firstname, ''), ' ', COALESCE(u_req.realname, '')), ' '), u_req.name, 'Não identificado') AS requerente,
COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_req ON (t.id = tu_req.tickets_id AND tu_req.type = 1)
LEFT JOIN glpi_users u_req ON tu_req.users_id = u_req.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE DATE(t.date) = CURDATE() AND t.is_deleted = 0
ORDER BY t.date DESC LIMIT 50;`
                      )
                    }
                    className="px-3 py-1.5 bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-500/30 rounded-lg font-medium transition flex items-center gap-1.5 text-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Abertos Hoje</span>
                  </button>

                  <button
                    onClick={() =>
                      setActiveSqlQuery(
                        `SELECT t.id, t.name AS titulo, t.date AS data_abertura, 
CASE t.status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento (Atribuído)' WHEN 3 THEN 'Em atendimento (Planejado)' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Outro' END AS status_nome,
CASE t.priority WHEN 1 THEN 'Muito Baixa' WHEN 2 THEN 'Baixa' WHEN 3 THEN 'Média' WHEN 4 THEN 'Alta' WHEN 5 THEN 'Muito Alta' WHEN 6 THEN 'Maior' ELSE 'Normal' END AS prioridade,
COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
COALESCE(NULLIF(CONCAT(COALESCE(u_req.firstname, ''), ' ', COALESCE(u_req.realname, '')), ' '), u_req.name, 'Não identificado') AS requerente,
COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_req ON (t.id = tu_req.tickets_id AND tu_req.type = 1)
LEFT JOIN glpi_users u_req ON tu_req.users_id = u_req.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.status IN (1, 2, 3, 4) AND t.is_deleted = 0
ORDER BY t.priority DESC, t.id DESC LIMIT 50;`
                      )
                    }
                    className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 rounded-lg font-medium transition flex items-center gap-1.5 text-xs"
                  >
                    <span>Em Aberto / Pendentes (1,2,3,4)</span>
                  </button>

                  <button
                    onClick={() =>
                      setActiveSqlQuery(
                        `SELECT t.id, t.name AS titulo, t.date AS data_abertura, 
CASE t.status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento (Atribuído)' WHEN 3 THEN 'Em atendimento (Planejado)' WHEN 4 THEN 'Pendente' WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Outro' END AS status_nome,
CASE t.priority WHEN 1 THEN 'Muito Baixa' WHEN 2 THEN 'Baixa' WHEN 3 THEN 'Média' WHEN 4 THEN 'Alta' WHEN 5 THEN 'Muito Alta' WHEN 6 THEN 'Maior' ELSE 'Normal' END AS prioridade,
COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.priority >= 4 AND t.status IN (1, 2, 3, 4) AND t.is_deleted = 0
ORDER BY t.priority DESC, t.date DESC LIMIT 50;`
                      )
                    }
                    className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-500/30 rounded-lg font-medium transition flex items-center gap-1.5 text-xs"
                  >
                    <span>Alta Prioridade / Críticos</span>
                  </button>

                  <button
                    onClick={() =>
                      setActiveSqlQuery(
                        `SELECT t.id, t.name AS titulo, t.date AS data_abertura, t.solvedate AS data_solucao,
CASE t.status WHEN 5 THEN 'Solucionado' WHEN 6 THEN 'Fechado' ELSE 'Finalizado' END AS status_nome,
COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.status IN (5, 6) AND t.is_deleted = 0
ORDER BY COALESCE(t.solvedate, t.closedate, t.date) DESC LIMIT 50;`
                      )
                    }
                    className="px-3 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/30 rounded-lg font-medium transition flex items-center gap-1.5 text-xs"
                  >
                    <span>Solucionados / Fechados (5,6)</span>
                  </button>

                  <button
                    onClick={() =>
                      setActiveSqlQuery(
                        `SELECT t.status AS id_status,
CASE t.status 
  WHEN 1 THEN '1 - Novo' 
  WHEN 2 THEN '2 - Em atendimento (Atribuído)' 
  WHEN 3 THEN '3 - Em atendimento (Planejado)' 
  WHEN 4 THEN '4 - Pendente' 
  WHEN 5 THEN '5 - Solucionado' 
  WHEN 6 THEN '6 - Fechado' 
  ELSE 'Outro' 
END AS status_descricao,
COUNT(*) AS total_chamados
FROM glpi_tickets t WHERE t.is_deleted = 0 GROUP BY t.status ORDER BY t.status ASC;`
                      )
                    }
                    className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 rounded-lg font-medium transition flex items-center gap-1.5 text-xs"
                  >
                    <span>Resumo por Status</span>
                  </button>

                  <button
                    onClick={() =>
                      setActiveSqlQuery(
                        `SELECT COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
COUNT(*) AS total_chamados,
SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS em_aberto,
SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS solucionados
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
WHERE t.is_deleted = 0 GROUP BY COALESCE(c.completename, c.name, 'Sem Categoria') ORDER BY total_chamados DESC LIMIT 30;`
                      )
                    }
                    className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 rounded-lg font-medium transition flex items-center gap-1.5 text-xs"
                  >
                    <span>Resumo por Categoria</span>
                  </button>

                  <button
                    onClick={() =>
                      setActiveSqlQuery(
                        `SELECT COALESCE(NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '), u.name, 'Sem Técnico Atribuído') AS tecnico,
COUNT(*) AS total_chamados,
SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS em_aberto,
SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS solucionados
FROM glpi_tickets t
INNER JOIN glpi_tickets_users tu ON (t.id = tu.tickets_id AND tu.type = 2)
INNER JOIN glpi_users u ON tu.users_id = u.id
WHERE t.is_deleted = 0 GROUP BY tecnico ORDER BY total_chamados DESC LIMIT 30;`
                      )
                    }
                    className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 rounded-lg font-medium transition flex items-center gap-1.5 text-xs"
                  >
                    <span>Resumo por Técnico</span>
                  </button>

                  <button
                    onClick={() =>
                      setActiveSqlQuery(
                        `SELECT t.id, t.name AS titulo, t.date AS data_abertura, t.time_to_resolve AS data_limite_sla,
TIMESTAMPDIFF(HOUR, t.time_to_resolve, NOW()) AS horas_em_atraso,
CASE t.status WHEN 1 THEN 'Novo' WHEN 2 THEN 'Em atendimento (Atribuído)' WHEN 3 THEN 'Em atendimento (Planejado)' WHEN 4 THEN 'Pendente' ELSE 'Em aberto' END AS status_nome,
COALESCE(c.completename, c.name, 'Sem Categoria') AS categoria,
COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Não atribuído') AS tecnico_atribuido
FROM glpi_tickets t
LEFT JOIN glpi_itilcategories c ON t.itilcategories_id = c.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.time_to_resolve IS NOT NULL AND t.time_to_resolve < NOW() AND t.status IN (1, 2, 3, 4) AND t.is_deleted = 0
ORDER BY t.time_to_resolve ASC LIMIT 50;`
                      )
                    }
                    className="px-3 py-1.5 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-500/30 rounded-lg font-medium transition flex items-center gap-1.5 text-xs"
                  >
                    <span>⚠️ Atrasados / SLA Vencido</span>
                  </button>

                  <button
                    onClick={() =>
                      setActiveSqlQuery(
                        `SELECT t.id AS ticket_id, t.name AS titulo_chamado, s.satisfaction AS nota_satisfacao_1_a_5, s.comment AS comentario_usuario, s.date_mod AS data_avaliacao,
COALESCE(NULLIF(CONCAT(COALESCE(u_tech.firstname, ''), ' ', COALESCE(u_tech.realname, '')), ' '), u_tech.name, 'Técnico Não Definido') AS tecnico_avaliado
FROM glpi_ticketsatisfactions s
INNER JOIN glpi_tickets t ON s.tickets_id = t.id
LEFT JOIN glpi_tickets_users tu_tech ON (t.id = tu_tech.tickets_id AND tu_tech.type = 2)
LEFT JOIN glpi_users u_tech ON tu_tech.users_id = u_tech.id
WHERE t.is_deleted = 0 ORDER BY s.id DESC LIMIT 50;`
                      )
                    }
                    className="px-3 py-1.5 bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-500/30 rounded-lg font-medium transition flex items-center gap-1.5 text-xs"
                  >
                    <span>⭐ Pesquisa Satisfação (CSAT)</span>
                  </button>

                  <button
                    onClick={() =>
                      setActiveSqlQuery(
                        `SELECT COALESCE(g.name, 'Sem Grupo Atribuído') AS grupo_tecnico, COUNT(t.id) AS total_chamados,
SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS em_aberto,
SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS solucionados
FROM glpi_tickets t
INNER JOIN glpi_groups_tickets gt ON (t.id = gt.tickets_id AND gt.type = 2)
INNER JOIN glpi_groups g ON gt.groups_id = g.id
WHERE t.is_deleted = 0 GROUP BY grupo_tecnico ORDER BY total_chamados DESC LIMIT 30;`
                      )
                    }
                    className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 rounded-lg font-medium transition flex items-center gap-1.5 text-xs"
                  >
                    <span>Resumo por Grupo / Equipe</span>
                  </button>

                  <button
                    onClick={() =>
                      setActiveSqlQuery(
                        `SELECT COALESCE(l.completename, l.name, 'Sem Localização') AS localizacao, COUNT(t.id) AS total_chamados,
SUM(CASE WHEN t.status IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS em_aberto,
SUM(CASE WHEN t.status IN (5, 6) THEN 1 ELSE 0 END) AS solucionados
FROM glpi_tickets t
LEFT JOIN glpi_locations l ON t.locations_id = l.id
WHERE t.is_deleted = 0 GROUP BY COALESCE(l.completename, l.name, 'Sem Localização') ORDER BY total_chamados DESC LIMIT 30;`
                      )
                    }
                    className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 rounded-lg font-medium transition flex items-center gap-1.5 text-xs"
                  >
                    <span>Resumo por Localização</span>
                  </button>
                </div>
              </div>

              {/* SQL Input Area */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-300">Instrução SQL (`SELECT` apenas):</label>
                  <span className="text-[10px] text-slate-500 font-mono">Limite automático 100 linhas</span>
                </div>
                <textarea
                  rows={3}
                  value={activeSqlQuery}
                  onChange={(e) => setActiveSqlQuery(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#050711] border border-slate-800 rounded-xl text-xs font-mono text-cyan-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500 resize-none"
                  placeholder="SELECT * FROM glpi_tickets LIMIT 20;"
                />
              </div>

              {/* Execute Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleExecuteQuery}
                  disabled={isQueryExecuting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-500/20 transition disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 fill-current ${isQueryExecuting ? 'animate-spin' : ''}`} />
                  {isQueryExecuting ? 'Executando SQL...' : 'Executar Consulta'}
                </button>
              </div>

              {/* Results Table */}
              {queryResult && (
                <div className="mt-4 space-y-3 pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 text-xs flex items-center gap-2">
                      <TableIcon className="w-4 h-4 text-cyan-400" />
                      <span>Resultado da Consulta</span>
                      {queryResult.totalRows !== undefined && (
                        <span className="px-2 py-0.5 bg-slate-800 text-cyan-300 rounded-full font-mono text-[11px]">
                          {queryResult.totalRows} registros
                        </span>
                      )}
                    </span>
                  </div>

                  {!queryResult.success ? (
                    <div className="p-4 bg-rose-950/40 border border-rose-500/40 rounded-xl text-rose-300 text-xs">
                      <p className="font-bold">Erro ao executar consulta SQL:</p>
                      <p className="font-mono text-[11px] mt-1">{queryResult.error}</p>
                    </div>
                  ) : !queryResult.rows || queryResult.rows.length === 0 ? (
                    <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-slate-400 text-xs">
                      Nenhum resultado retornado para a consulta especificada.
                    </div>
                  ) : (
                    <div className="bg-[#050711] border border-slate-800 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                      <table className="w-full text-left border-collapse font-mono text-[11px]">
                        <thead>
                          <tr className="bg-slate-900/80 border-b border-slate-800 text-cyan-300 uppercase">
                            {queryResult.columns?.map((col) => (
                              <th key={col} className="py-2 px-3">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {queryResult.rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/40 transition">
                              {queryResult.columns?.map((col) => (
                                <td key={col} className="py-2 px-3 text-slate-300 truncate max-w-xs">
                                  {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-slate-600 italic">null</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Modal Adicionar/Editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-xl bg-[#0b0e17] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#080b13]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400">
                  <Database className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">
                  {editingConnector ? 'Editar Conector de Banco' : 'Novo Conector de Banco de Dados'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveConnector} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">
                  Nome Amigável da Conexão <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: GLPI - Chamados TI"
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#060810] border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5">
                    Tipo de Banco <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={formState.db_type}
                    onChange={(e) => handleDbTypeChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#060810] border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition"
                  >
                    <option value="mysql">MySQL (GLPI Padrão)</option>
                    <option value="mariadb">MariaDB (GLPI)</option>
                    <option value="postgresql">PostgreSQL</option>
                    <option value="sqlserver">Microsoft SQL Server</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5">
                    Porta <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    value={formState.port}
                    onChange={(e) => setFormState({ ...formState, port: parseInt(e.target.value, 10) || 3306 })}
                    className="w-full px-3.5 py-2.5 bg-[#060810] border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5">
                    Host / IP do Servidor <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="192.168.1.50 ou glpi-db.local"
                    value={formState.host}
                    onChange={(e) => setFormState({ ...formState, host: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#060810] border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5">
                    Nome do Banco de Dados <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="glpi"
                    value={formState.database}
                    onChange={(e) => setFormState({ ...formState, database: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#060810] border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5">
                    Usuário <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="glpi_read"
                    value={formState.username}
                    onChange={(e) => setFormState({ ...formState, username: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#060810] border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5">Senha de Acesso</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={editingConnector ? 'Manter senha atual' : 'Senha do banco'}
                      value={formState.password}
                      onChange={(e) => setFormState({ ...formState, password: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-[#060810] border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">Descrição Opcional</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Banco GLPI para consulta de chamados e equipamentos por departamento."
                  value={formState.description}
                  onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#060810] border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.use_ssl}
                    onChange={(e) => setFormState({ ...formState, use_ssl: e.target.checked })}
                    className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span>Conexão SSL/TLS Seguro</span>
                </label>

                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.is_active}
                    onChange={(e) => setFormState({ ...formState, is_active: e.target.checked })}
                    className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span>Conexão Ativa</span>
                </label>
              </div>

              {/* Modal Test Results */}
              {modalTestResult && (
                <div
                  className={`p-3.5 rounded-xl text-xs border flex items-start gap-2.5 mt-4 ${
                    modalTestResult.success
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                  }`}
                >
                  {modalTestResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-bold flex items-center gap-2">
                      {modalTestResult.success ? 'Conexão Testada com Sucesso!' : 'Erro na Conexão'}
                      {modalTestResult.latencyMs && (
                        <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded font-mono font-normal">
                          ⚡ {modalTestResult.latencyMs}ms
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] opacity-90 mt-0.5">{modalTestResult.message || modalTestResult.error}</p>
                  </div>
                </div>
              )}

              {/* Footer Actions */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleTestModalForm}
                  disabled={isModalTesting}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold rounded-xl border border-slate-700 transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isModalTesting ? 'animate-spin' : ''}`} />
                  {isModalTesting ? 'Testando Conexão...' : 'Testar no Formulário'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition disabled:opacity-50"
                  >
                    {isSaving ? 'Salvando...' : 'Salvar Conexão'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
