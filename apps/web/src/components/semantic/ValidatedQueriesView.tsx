import React, { useState, useEffect } from 'react';
import { CheckCircle2, Plus, Search, Code2, Tag, TrendingUp } from 'lucide-react';
import {
  ValidatedQueryItem,
  fetchValidatedQueriesApi,
  createValidatedQueryApi,
} from '../../services/semanticApi';

interface ValidatedQueriesViewProps {
  token: string;
  dataSourceId?: string;
}

export const ValidatedQueriesView: React.FC<ValidatedQueriesViewProps> = ({ token, dataSourceId }) => {
  const [queries, setQueries] = useState<ValidatedQueryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const [form, setForm] = useState({
    question: '',
    sql: '',
    tags: '',
  });

  const loadQueries = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const data = await fetchValidatedQueriesApi(token, dataSourceId);
      if (data.success) {
        setQueries(data.queries);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQueries();
  }, [token, dataSourceId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.question || !form.sql) return;
    try {
      await createValidatedQueryApi(token, {
        dataSourceId,
        ...form,
      });
      setShowAddModal(false);
      setForm({ question: '', sql: '', tags: '' });
      loadQueries();
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  };

  const filtered = queries.filter(
    (q) =>
      q.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.sql.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (q.tags && q.tags.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar perguntas ou queries validadas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition-all"
        >
          <Plus className="w-4 h-4" /> Validar Nova Consulta (Few-Shot)
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-xs text-slate-400">Carregando consultas validadas...</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-950/40 space-y-2">
          <Code2 className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-xs text-slate-300 font-medium">Nenhuma consulta validada cadastrada ainda.</p>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
            Consultas validadas servem de exemplos perfeitos (Few-Shot RAG) para o SQL Generator, garantindo 100% de precisão para perguntas recorrentes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => (
            <div
              key={q.id}
              className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <h4 className="text-xs font-bold text-slate-100">"{q.question}"</h4>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-cyan-400" />
                    Utilizado {q.usageCount}x pela IA
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    Homologado
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-950 rounded-lg text-[11px] font-mono text-cyan-300 border border-slate-800/80 overflow-x-auto">
                <pre>{q.sql}</pre>
              </div>

              {q.tags && (
                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Tag className="w-3 h-3 text-indigo-400" />
                  <span>Tags: {q.tags}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Nova Consulta */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f111a] border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-100">Homologar Consulta Validada (Few-Shot)</h3>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-semibold">Pergunta do Usuário</label>
                <input
                  type="text"
                  required
                  placeholder="ex: Qual o faturamento por loja ontem?"
                  value={form.question}
                  onChange={(e) => setForm({ ...form, question: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>

              <div>
                <label className="text-slate-400 font-semibold">SQL Canônico Validado</label>
                <textarea
                  rows={5}
                  required
                  placeholder="SELECT f.nome_filial, SUM(i.valor_liquido) ... FROM ..."
                  value={form.sql}
                  onChange={(e) => setForm({ ...form, sql: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 font-semibold">Tags (vírgula)</label>
                <input
                  type="text"
                  placeholder="vendas, lojas, faturamento, ontem"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
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
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl"
                >
                  Salvar Consulta Validada
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
