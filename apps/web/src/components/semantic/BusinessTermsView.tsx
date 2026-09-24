import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, Search, Sparkles, Filter } from 'lucide-react';
import {
  BusinessTermItem,
  fetchBusinessTermsApi,
  createBusinessTermApi,
  deleteBusinessTermApi,
} from '../../services/semanticApi';

interface BusinessTermsViewProps {
  token: string;
  dataSourceId?: string;
}

export const BusinessTermsView: React.FC<BusinessTermsViewProps> = ({ token, dataSourceId }) => {
  const [terms, setTerms] = useState<BusinessTermItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    synonyms: '',
    businessDomain: '',
    formula: '',
    defaultFilters: '',
  });

  const loadTerms = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const data = await fetchBusinessTermsApi(token, dataSourceId);
      if (data.success) {
        setTerms(data.terms);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTerms();
  }, [token, dataSourceId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.description) return;
    try {
      await createBusinessTermApi(token, {
        dataSourceId,
        ...form,
      });
      setShowAddModal(false);
      setForm({ name: '', description: '', synonyms: '', businessDomain: '', formula: '', defaultFilters: '' });
      loadTerms();
    } catch (err: any) {
      alert(`Erro ao cadastrar termo: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este termo do dicionário?')) return;
    try {
      await deleteBusinessTermApi(token, id);
      loadTerms();
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  };

  const filtered = terms.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.synonyms && t.synonyms.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar termos ou sinônimos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition-all"
        >
          <Plus className="w-4 h-4" /> Novo Termo Empresarial
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-xs text-slate-400">Carregando dicionário...</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-950/40 space-y-2">
          <BookOpen className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-xs text-slate-300 font-medium">Nenhum termo empresarial cadastrado ainda.</p>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
            Cadastre termos como "Faturamento", "Cliente Ativo" ou "Venda Válida" para impedir que a IA invente definições de negócio.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-100">{t.name}</h4>
                  {t.businessDomain && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      {t.businessDomain}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="p-1 text-slate-500 hover:text-rose-400 rounded-md transition-colors"
                  title="Excluir termo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-xs text-slate-300">{t.description}</p>

              {t.synonyms && (
                <div className="flex flex-wrap gap-1 text-[10px]">
                  <span className="text-slate-500">Sinônimos:</span>
                  {t.synonyms.split(',').map((s, idx) => (
                    <span key={idx} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {s.trim()}
                    </span>
                  ))}
                </div>
              )}

              {t.formula && (
                <div className="p-2 bg-slate-950 rounded-lg text-[11px] font-mono text-cyan-300 border border-slate-800/60">
                  <span className="text-slate-500">Fórmula: </span>{t.formula}
                </div>
              )}

              {t.defaultFilters && (
                <div className="text-[10px] text-amber-400/90 font-mono">
                  Filtro obrigatório: {t.defaultFilters}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Novo Termo */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f111a] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-100">Cadastrar Termo de Negócio</h3>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-semibold">Nome do Conceito / Termo</label>
                <input
                  type="text"
                  required
                  placeholder="ex: Faturamento Líquido"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>

              <div>
                <label className="text-slate-400 font-semibold">Descrição do Significado Empresarial</label>
                <textarea
                  rows={2}
                  required
                  placeholder="ex: Somatório do valor líquido das vendas com cupom finalizado..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 font-semibold">Domínio de Negócio</label>
                  <input
                    type="text"
                    placeholder="ex: Vendas, CRM, Fiscal"
                    value={form.businessDomain}
                    onChange={(e) => setForm({ ...form, businessDomain: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-semibold">Sinônimos (vírgula)</label>
                  <input
                    type="text"
                    placeholder="receita, vendas, faturado"
                    value={form.synonyms}
                    onChange={(e) => setForm({ ...form, synonyms: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-semibold">Expressão / Fórmula Canônica (opcional)</label>
                <input
                  type="text"
                  placeholder="ex: SUM(valor_liquido)"
                  value={form.formula}
                  onChange={(e) => setForm({ ...form, formula: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 font-semibold">Filtro Obrigatório Padrão (opcional)</label>
                <input
                  type="text"
                  placeholder="ex: status = 'FINALIZADA'"
                  value={form.defaultFilters}
                  onChange={(e) => setForm({ ...form, defaultFilters: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono"
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
                  className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl"
                >
                  Salvar Termo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
