import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Zap,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Database,
  Network,
  Cpu,
  Layers,
  ShieldCheck,
  Save,
  ArrowRight,
  Info,
} from 'lucide-react';
import {
  fetchSemanticConfigApi,
  saveSemanticConfigApi,
  clearSemanticCacheApi,
  fetchSchemaDriftApi,
  syncSemanticSchemaApi,
  SemanticConfig,
  SemanticCacheStats,
  SchemaDriftResponse,
} from '../../services/semanticApi';

interface SemanticConfigViewProps {
  token: string;
  dataSourceId: string;
  dataSourceName: string;
}

export const SemanticConfigView: React.FC<SemanticConfigViewProps> = ({
  token,
  dataSourceId,
  dataSourceName,
}) => {
  const [config, setConfig] = useState<SemanticConfig>({
    cacheEnabled: true,
    cacheTtlSeconds: 300,
    driftDetectionEnabled: true,
    crossSourceEnabled: true,
    confidenceThreshold: 0.7,
  });

  const [cacheStats, setCacheStats] = useState<SemanticCacheStats>({
    size: 0,
    hits: 0,
    misses: 0,
    hitRatePct: 0,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Cache Actions
  const [isClearingCache, setIsClearingCache] = useState(false);

  // Drift State
  const [driftResult, setDriftResult] = useState<SchemaDriftResponse | null>(null);
  const [isCheckingDrift, setIsCheckingDrift] = useState(false);
  const [isSyncingDrift, setIsSyncingDrift] = useState(false);

  // Carregar Configurações
  const loadConfig = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetchSemanticConfigApi(token);
      if (res.success) {
        setConfig(res.config);
        if (res.cacheStats) {
          setCacheStats(res.cacheStats);
        }
      }
    } catch (err) {
      console.error('Falha ao carregar configurações semânticas:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, [token]);

  // Salvar Configurações
  const handleSave = async () => {
    if (!token) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const res = await saveSemanticConfigApi(token, config);
      if (res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert(`Erro ao salvar configurações: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Limpar Cache
  const handleClearCache = async () => {
    if (!token) return;
    if (!confirm('Deseja realmente limpar todo o cache semântico de consultas em memória?')) return;
    setIsClearingCache(true);
    try {
      const res = await clearSemanticCacheApi(token);
      if (res.success) {
        setCacheStats({ size: 0, hits: 0, misses: 0, hitRatePct: 0 });
        alert('Cache semântico limpo com sucesso!');
      } else {
        alert(`Erro ao limpar cache: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setIsClearingCache(false);
    }
  };

  // Verificar Drift
  const handleCheckDrift = async () => {
    if (!token || !dataSourceId) return;
    setIsCheckingDrift(true);
    try {
      const res = await fetchSchemaDriftApi(token, dataSourceId);
      if (res.success) {
        setDriftResult(res);
      } else {
        alert(`Erro ao checar drift: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Erro ao consultar divergências: ${err.message}`);
    } finally {
      setIsCheckingDrift(false);
    }
  };

  // Sincronizar catálogo a partir do drift
  const handleSyncFromDrift = async () => {
    if (!token || !dataSourceId) return;
    setIsSyncingDrift(true);
    try {
      const res = await syncSemanticSchemaApi(token, dataSourceId);
      if (res.success) {
        alert(
          `Sincronização concluída com sucesso em ${res.executionTimeMs}ms!\n\n` +
            `• Tabelas sincronizadas: ${res.tablesSynced}\n` +
            `• Colunas sincronizadas: ${res.columnsSynced}\n` +
            `• FKs detectadas: ${res.relationshipsDetected}`
        );
        handleCheckDrift();
      } else {
        alert(`Erro ao sincronizar: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setIsSyncingDrift(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-3">
        <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
        <span className="text-xs">Carregando configurações e métricas semânticas...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra de Ações do Topo */}
      <div className="flex items-center justify-between p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Painel de Configuração da Camada Semântica</h3>
            <p className="text-xs text-slate-400">
              Ajuste as opções de performance em cache, vigilância de schema drift e relacionamentos entre bancos.
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-cyan-950/30 transition cursor-pointer disabled:opacity-50"
        >
          {isSaving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : saveSuccess ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span>{saveSuccess ? 'Salvo com Sucesso!' : 'Salvar Alterações'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ==================================================== */}
        {/* 1. OPÇÃO 3: CACHE SEMÂNTICO DE CONSULTAS            */}
        {/* ==================================================== */}
        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Cache Semântico de Consultas (Opção 3)</h4>
                <p className="text-[11px] text-slate-400">Respostas sub-10ms para perguntas idênticas ou equivalentes</p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.cacheEnabled}
                onChange={(e) => setConfig({ ...config, cacheEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                Tempo de Expiração do Cache (TTL em Segundos)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="10"
                  max="86400"
                  value={config.cacheTtlSeconds}
                  onChange={(e) => setConfig({ ...config, cacheTtlSeconds: parseInt(e.target.value, 10) || 300 })}
                  className="w-32 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-500"
                />
                <span className="text-[11px] text-slate-400">
                  ≈ {Math.round(config.cacheTtlSeconds / 60)} minuto(s)
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Consultas executadas repetidamente dentro deste intervalo serão servidas instantaneamente da memória.
              </p>
            </div>

            {/* Painel de Métricas do Cache */}
            <div className="p-3.5 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-amber-400" />
                  Métricas em Tempo Real
                </span>
                <button
                  type="button"
                  onClick={handleClearCache}
                  disabled={isClearingCache || cacheStats.size === 0}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-semibold transition cursor-pointer disabled:opacity-40"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Limpar Cache</span>
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center pt-1">
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Itens no Cache</span>
                  <span className="text-xs font-bold text-slate-200 font-mono">{cacheStats.size}</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Cache Hits</span>
                  <span className="text-xs font-bold text-emerald-400 font-mono">{cacheStats.hits}</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Cache Misses</span>
                  <span className="text-xs font-bold text-slate-300 font-mono">{cacheStats.misses}</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Taxa de Acerto</span>
                  <span className="text-xs font-bold text-amber-400 font-mono">{cacheStats.hitRatePct}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ==================================================== */}
        {/* 2. OPÇÃO 5: HETEROGÊNEO / CROSS-SOURCE              */}
        {/* ==================================================== */}
        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Network className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Relacionamentos Heterogêneos / Cross-Source (Opção 5)</h4>
                <p className="text-[11px] text-slate-400">Interligação semântica entre diferentes bancos de dados</p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.crossSourceEnabled}
                onChange={(e) => setConfig({ ...config, crossSourceEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
            </label>
          </div>

          <div className="space-y-3 text-xs text-slate-300">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Quando habilitado, o construtor do Mapa de Dados permite traçar arestas relacionais entre tabelas de fontes distintas (ex: chamados do <strong>GLPI</strong> correlacionados a clientes no <strong>ERP/Vetor Lake</strong>).
            </p>

            <div className="p-3.5 bg-indigo-950/20 border border-indigo-500/20 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-indigo-300 font-semibold text-[11px]">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>Status da Federação Cross-Source:</span>
              </div>
              <p className="text-[10px] text-indigo-200/80 leading-relaxed">
                {config.crossSourceEnabled
                  ? '✅ Ativo. Arestas cross-source serão destacadas em lilás no visualizador e consideradas no cálculo de travessia do grafo.'
                  : '⏸ Desativado. As consultas serão estritamente isoladas dentro do banco de dados de cada conector.'}
              </p>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                Limiar Mínimo de Confiança da IA ({Math.round(config.confidenceThreshold * 100)}%)
              </label>
              <input
                type="range"
                min="0.4"
                max="0.95"
                step="0.05"
                value={config.confidenceThreshold}
                onChange={(e) => setConfig({ ...config, confidenceThreshold: parseFloat(e.target.value) })}
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>Mais permissivo (40%)</span>
                <span>Padrão (70%)</span>
                <span>Ultra-rigoroso (95%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* 3. OPÇÃO 4: DETECÇÃO PROATIVA DE SCHEMA DRIFT       */}
      {/* ==================================================== */}
      <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200">Vigilância de Schema Drift Proativo (Opção 4)</h4>
              <p className="text-[11px] text-slate-400">
                Auditoria não-destrutiva entre o banco físico ({dataSourceName}) e o catálogo semântico
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCheckDrift}
              disabled={isCheckingDrift}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingDrift ? 'animate-spin text-cyan-400' : ''}`} />
              <span>Verificar Divergências Agora</span>
            </button>
          </div>
        </div>

        {/* Painel de Resultados do Drift */}
        {driftResult ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="flex items-center gap-2.5">
                {driftResult.hasDrift ? (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                )}
                <div>
                  <span className="text-xs font-bold text-slate-100">
                    {driftResult.hasDrift
                      ? 'Divergências de Schema Detectadas!'
                      : 'Schema 100% Sincronizado com o Banco Físico.'}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    Última verificação: {new Date(driftResult.checkedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              {driftResult.hasDrift && (
                <button
                  type="button"
                  onClick={handleSyncFromDrift}
                  disabled={isSyncingDrift}
                  className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDrift ? 'animate-spin' : ''}`} />
                  <span>Sincronizar Catálogo Agora</span>
                </button>
              )}
            </div>

            {driftResult.hasDrift && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Tabelas Adicionadas */}
                <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl space-y-1.5">
                  <span className="text-[11px] font-bold text-emerald-400 flex items-center justify-between">
                    <span>Tabelas Novas no Banco Físico</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px]">
                      {driftResult.summary.addedTablesCount}
                    </span>
                  </span>
                  {driftResult.addedTables.length > 0 ? (
                    <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                      {driftResult.addedTables.map((t, i) => (
                        <div key={i} className="text-[10px] font-mono text-slate-300 bg-black/40 px-2 py-0.5 rounded">
                          + {t.schemaName}.{t.tableName}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-500">Nenhuma</span>
                  )}
                </div>

                {/* Tabelas Removidas / Ausentes */}
                <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-xl space-y-1.5">
                  <span className="text-[11px] font-bold text-rose-400 flex items-center justify-between">
                    <span>Tabelas Removidas do Banco</span>
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono text-[10px]">
                      {driftResult.summary.removedTablesCount}
                    </span>
                  </span>
                  {driftResult.removedTables.length > 0 ? (
                    <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                      {driftResult.removedTables.map((t, i) => (
                        <div key={i} className="text-[10px] font-mono text-slate-300 bg-black/40 px-2 py-0.5 rounded">
                          - {t.schemaName}.{t.tableName}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-500">Nenhuma</span>
                  )}
                </div>

                {/* Colunas Modificadas ou Novas */}
                <div className="p-3 bg-amber-950/20 border border-amber-500/20 rounded-xl space-y-1.5">
                  <span className="text-[11px] font-bold text-amber-400 flex items-center justify-between">
                    <span>Colunas Alteradas ou Novas</span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px]">
                      {driftResult.summary.addedColumnsCount + driftResult.summary.modifiedColumnsCount}
                    </span>
                  </span>
                  {driftResult.addedColumns.length > 0 || driftResult.modifiedColumns.length > 0 ? (
                    <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                      {driftResult.addedColumns.map((c, i) => (
                        <div key={i} className="text-[10px] font-mono text-emerald-300 bg-black/40 px-2 py-0.5 rounded">
                          + {c.tableName}.{c.columnName} ({c.dataType})
                        </div>
                      ))}
                      {driftResult.modifiedColumns.map((c, i) => (
                        <div key={i} className="text-[10px] font-mono text-amber-300 bg-black/40 px-2 py-0.5 rounded">
                          ~ {c.tableName}.{c.columnName}: {c.existingDataType} → {c.dataType}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-500">Nenhuma</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 bg-slate-950/40 border border-dashed border-slate-800 rounded-xl text-center space-y-2">
            <Info className="w-5 h-5 text-slate-500 mx-auto" />
            <p className="text-xs text-slate-400">
              Clique em <strong>Verificar Divergências Agora</strong> para comparar as tabelas e colunas físicas do banco com os metadados catalogados.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
