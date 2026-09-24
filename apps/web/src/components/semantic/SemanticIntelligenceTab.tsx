import React, { useState, useEffect } from 'react';
import {
  Database,
  Network,
  BookOpen,
  Target,
  Code2,
  FlaskConical,
  Activity,
  Layers,
  Sliders,
} from 'lucide-react';
import { DataMapCanvas } from './DataMapCanvas';
import { BusinessTermsView } from './BusinessTermsView';
import { MetricsView } from './MetricsView';
import { ValidatedQueriesView } from './ValidatedQueriesView';
import { LaboratoryView } from './LaboratoryView';
import { DiagnosticView } from './DiagnosticView';
import { SemanticConfigView } from './SemanticConfigView';
import { fetchDatabaseConnectorsApi } from '../../services/api';
import { DataSourceConnectorItem } from '@oraculo/shared';

interface SemanticIntelligenceTabProps {
  token: string;
}

export const SemanticIntelligenceTab: React.FC<SemanticIntelligenceTabProps> = ({ token }) => {
  const [connectors, setConnectors] = useState<DataSourceConnectorItem[]>([]);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<
    'map' | 'dictionary' | 'metrics' | 'validated' | 'lab' | 'diagnostic' | 'config'
  >('map');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadConnectors = async () => {
      setIsLoading(true);
      try {
        const data = await fetchDatabaseConnectorsApi(token);
        if (data.connectors && data.connectors.length > 0) {
          setConnectors(data.connectors);
          setSelectedConnectorId(data.connectors[0].id);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    loadConnectors();
  }, [token]);

  const selectedConnector = connectors.find((c) => c.id === selectedConnectorId);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* Cabeçalho da Camada Semântica & Seletor de Fonte */}
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Network className="w-5 h-5 text-cyan-400" />
            <span>Inteligência de Dados & Camada Semântica (Versão 2)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Mapeamento semântico visual, catálogo relacional, dicionário corporativo e pipeline NL2SQL com validação rigorosa.
          </p>
        </div>

        {/* Seletor de Fonte de Dados Ativa */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Fonte Ativa:</span>
          {connectors.length > 0 ? (
            <select
              value={selectedConnectorId}
              onChange={(e) => setSelectedConnectorId(e.target.value)}
              className="px-3.5 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs font-semibold text-cyan-300 focus:outline-none focus:border-cyan-500 shadow-md"
            >
              {connectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.db_type} - {c.database || 'default'})
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-amber-400">Nenhuma fonte cadastrada</span>
          )}
        </div>
      </div>

      {/* Sub-Navegação da Camada Semântica */}
      <div className="flex items-center gap-1.5 border-b border-slate-800/80 pb-3 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveSubTab('map')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeSubTab === 'map'
              ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40 shadow-md shadow-cyan-950/30'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          <Network className="w-4 h-4 text-cyan-400" /> Mapa de Dados (ERD)
        </button>

        <button
          onClick={() => setActiveSubTab('dictionary')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeSubTab === 'dictionary'
              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-md shadow-indigo-950/30'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4 text-indigo-400" /> Dicionário de Negócio
        </button>

        <button
          onClick={() => setActiveSubTab('metrics')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeSubTab === 'metrics'
              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 shadow-md shadow-emerald-950/30'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          <Target className="w-4 h-4 text-emerald-400" /> Métricas & KPIs
        </button>

        <button
          onClick={() => setActiveSubTab('validated')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeSubTab === 'validated'
              ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40 shadow-md shadow-purple-950/30'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          <Code2 className="w-4 h-4 text-purple-400" /> Consultas Validadas
        </button>

        <button
          onClick={() => setActiveSubTab('lab')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeSubTab === 'lab'
              ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40 shadow-md shadow-amber-950/30'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          <FlaskConical className="w-4 h-4 text-amber-400" /> Laboratório
        </button>

        <button
          onClick={() => setActiveSubTab('diagnostic')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeSubTab === 'diagnostic'
              ? 'bg-rose-600/20 text-rose-300 border border-rose-500/40 shadow-md shadow-rose-950/30'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4 text-rose-400" /> Diagnóstico & Cobertura
        </button>

        <button
          onClick={() => setActiveSubTab('config')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
            activeSubTab === 'config'
              ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40 shadow-md shadow-amber-950/30'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4 text-amber-400" /> Configurações & Otimização
        </button>
      </div>

      {/* Renderização da Sub-Aba Ativa */}
      {selectedConnectorId ? (
        <div>
          {activeSubTab === 'map' && (
            <DataMapCanvas
              token={token}
              dataSourceId={selectedConnectorId}
              dataSourceName={selectedConnector?.name || 'Fonte'}
            />
          )}

          {activeSubTab === 'dictionary' && (
            <BusinessTermsView token={token} dataSourceId={selectedConnectorId} />
          )}

          {activeSubTab === 'metrics' && (
            <MetricsView token={token} dataSourceId={selectedConnectorId} />
          )}

          {activeSubTab === 'validated' && (
            <ValidatedQueriesView token={token} dataSourceId={selectedConnectorId} />
          )}

          {activeSubTab === 'lab' && (
            <LaboratoryView
              token={token}
              dataSourceId={selectedConnectorId}
              dataSourceName={selectedConnector?.name || 'Fonte'}
            />
          )}

          {activeSubTab === 'diagnostic' && (
            <DiagnosticView token={token} dataSourceId={selectedConnectorId} />
          )}

          {activeSubTab === 'config' && (
            <SemanticConfigView
              token={token}
              dataSourceId={selectedConnectorId}
              dataSourceName={selectedConnector?.name || 'Fonte'}
            />
          )}
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-slate-400">
          Nenhuma fonte de dados selecionada.
        </div>
      )}
    </div>
  );
};
