import React, { useState, useEffect } from 'react';
import { BarChart3, Plus, Trash2, Search, Target, Hash } from 'lucide-react';
import {
  SemanticMetricItem,
  fetchSemanticMetricsApi,
  createSemanticMetricApi,
  deleteSemanticMetricApi,
} from '../../services/semanticApi';

interface MetricsViewProps {
  token: string;
  dataSourceId?: string;
}

export const MetricsView: React.FC<MetricsViewProps> = ({ token, dataSourceId }) => {
  const [metrics, setMetrics] = useState<SemanticMetricItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    formula: '',
    aggregation: 'SUM',
    baseTable: '',
    requiredRelationships: '',
    defaultFilters: '',
    timeColumn: '',
    synonyms: '',
  });

  const loadMetrics = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const data = await fetchSemanticMetricsApi(token, dataSourceId);
      if (data.success) {
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, [token, dataSourceId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.formula || !form.baseTable) return;
    try {
      await createSemanticMetricApi(token, {
        dataSourceId,
        ...form,
      });
      setShowAddModal(false);
      setForm({
        name: '',
        description: '',
        formula: '',
        aggregation: 'SUM',
        baseTable: '',
        requiredRelationships: '',
        defaultFilters: '',
        timeColumn: '',
        synonyms: '',
      });
      loadMetrics();
    } catch (err: any) {
      alert(`Erro ao cadastrar métrica: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta métrica oficial?')) return;
    try {
      await deleteSemanticMetricApi(token, id);
      loadMetrics();
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  };

  const filtered = metrics.filter(
    (m) =>
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.baseTable.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar métricas ou tabelas base..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-bold rounded-xl shadow-md transition-all"
        >
          <Plus className="w-4 h-4" /> Nova Métrica / KPI
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-xs text-slate-400">Carregando métricas...</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-950/40 space-y-2">
          <Target className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-xs text-slate-300 font-medium">Nenhuma métrica ou KPI oficial cadastrado ainda.</p>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
            Cadastre fórmulas de KPIs como Ticket Médio, Margem, Qtd Vendas para que o Query Planner use as regras oficiais da empresa.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-100">{m.name}</h4>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                    {m.aggregation}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(m.id)}
                  className="p-1 text-slate-500 hover:text-rose-400 rounded-md transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-xs text-slate-300">{m.description || 'Sem descrição cadastrada.'}</p>

              <div className="p-2 bg-slate-950 rounded-lg text-[11px] font-mono text-emerald-300 border border-slate-800/60">
                <span className="text-slate-500">Fórmula: </span>{m.formula}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
                <span>Tabela Base: <strong className="text-slate-200">{m.baseTable}</strong></span>
                {m.timeColumn && <span>Coluna Temporal: <strong className="text-slate-200">{m.timeColumn}</strong></span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Nova Métrica */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f111a] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-100">Cadastrar Métrica / KPI</h3>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-semibold">Nome da Métrica / KPI</label>
                <input
                  type="text"
                  required
                  placeholder="ex: Ticket Médio"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 font-semibold">Tabela Base</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: tb_vendas"
                    value={form.baseTable}
                    onChange={(e) => setForm({ ...form, baseTable: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-semibold">Tipo de Agregação</label>
                  <select
                    value={form.aggregation}
                    onChange={(e) => setForm({ ...form, aggregation: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                  >
                    <option value="SUM">SUM (Soma)</option>
                    <option value="AVG">AVG (Média)</option>
                    <option value="COUNT">COUNT (Contagem)</option>
                    <option value="COUNT_DISTINCT">COUNT DISTINCT</option>
                    <option value="MIN">MIN (Mínimo)</option>
                    <option value="MAX">MAX (Máximo)</option>
                    <option value="CUSTOM">CUSTOM (Fórmula Livre)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-semibold">Fórmula de Cálculo</label>
                <input
                  type="text"
                  required
                  placeholder="ex: SUM(valor_total) / COUNT(DISTINCT id_venda)"
                  value={form.formula}
                  onChange={(e) => setForm({ ...form, formula: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 font-semibold">Coluna Temporal de Referência (opcional)</label>
                <input
                  type="text"
                  placeholder="ex: data_venda"
                  value={form.timeColumn}
                  onChange={(e) => setForm({ ...form, timeColumn: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 font-semibold">Descrição / Explicação Empresarial</label>
                <textarea
                  rows={2}
                  placeholder="Explique como essa métrica é interpretada na organização..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl"
                >
                  Salvar Métrica
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
