import React, { useState } from 'react';
import {
  FlaskConical,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Layers,
  Code2,
  Table as TableIcon,
  ShieldCheck,
  BookmarkPlus,
} from 'lucide-react';
import { askSemanticLabApi, createValidatedQueryApi } from '../../services/semanticApi';

interface LaboratoryViewProps {
  token: string;
  dataSourceId: string;
  dataSourceName: string;
}

export const LaboratoryView: React.FC<LaboratoryViewProps> = ({
  token,
  dataSourceId,
  dataSourceName,
}) => {
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<any | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !dataSourceId) return;

    setIsLoading(true);
    setResponse(null);
    try {
      const res = await askSemanticLabApi(token, question, dataSourceId);
      setResponse(res);
    } catch (err: any) {
      alert(`Erro ao testar inteligência semântica: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePromoteToValidatedQuery = async () => {
    if (!token || !response || !response.sql) return;
    setIsValidating(true);
    try {
      const res = await createValidatedQueryApi(token, {
        dataSourceId,
        question: response.transparencyAudit?.questionInterpreted || question,
        sql: response.sql,
        tablesUsed: response.transparencyAudit?.tablesUsed || [],
        tags: 'laboratório, homologado',
      });
      if (res.success) {
        alert('Consulta promovida com sucesso para a biblioteca de Consultas Validadas (Few-Shot RAG)!');
      }
    } catch (err: any) {
      alert(`Erro ao salvar: ${err.message}`);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra de Pergunta do Laboratório */}
      <form onSubmit={handleTest} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-cyan-400" />
          <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
            Laboratório de Diagnóstico & Execução Semântica
          </h3>
        </div>
        <p className="text-[11px] text-slate-400">
          Simule perguntas reais para testar a interpretação do Intent Analyzer, seleção do Schema Retriever, rota do Grafo de Relacionamentos e compilação do SQL.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            required
            placeholder="Ex: Quais os 10 clientes que mais compraram genéricos nos últimos 90 dias?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            disabled={isLoading || !question.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-cyan-950/40 disabled:opacity-50 transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {isLoading ? 'Raciocinando...' : 'Executar Teste'}
          </button>
        </div>
      </form>

      {/* Resultados do Pipeline */}
      {response && (
        <div className="space-y-4 animate-in fade-in-50 duration-200">
          {/* Métricas do Diagnóstico */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400">Confiança Operacional</span>
              <div className="text-lg font-bold text-cyan-400">
                {Math.round((response.confidenceScore || 0) * 100)}%
              </div>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400">Tempo de Execução</span>
              <div className="text-lg font-bold text-emerald-400 flex items-center gap-1">
                <Clock className="w-4 h-4" /> {response.executionTimeMs}ms
              </div>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400">Linhas Retornadas</span>
              <div className="text-lg font-bold text-indigo-400">{response.totalRows} registros</div>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400">Motor Utilizado</span>
              <div className="text-lg font-bold text-purple-400">{response.usedEngine}</div>
            </div>
          </div>

          {/* Resposta Natural Gerada */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Resposta Interpretada</span>
              </h4>
              <button
                onClick={handlePromoteToValidatedQuery}
                disabled={isValidating}
                className="flex items-center gap-1.5 px-3 py-1 bg-purple-950/60 hover:bg-purple-900 border border-purple-500/30 text-purple-300 text-xs font-semibold rounded-lg shadow-sm"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                {isValidating ? 'Homologando...' : 'Homologar como Consulta Validada'}
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{response.answer}</p>
            {response.bulletPoints && response.bulletPoints.length > 0 && (
              <ul className="list-disc list-inside text-xs text-slate-400 space-y-1 pt-1">
                {response.bulletPoints.map((bp: string, i: number) => (
                  <li key={i}>{bp}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Pipeline Semântico — Rastreabilidade & Decisões */}
          {response.transparencyAudit && (
            <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-xl space-y-3 text-xs">
              <h4 className="text-xs font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Auditoria da Camada Semântica & Proveniência</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Tabelas Selecionadas:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {response.transparencyAudit.tablesUsed.map((t: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-slate-800 font-mono text-[11px]">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Relacionamentos Utilizados:</span>
                  <div className="space-y-1 mt-1">
                    {response.transparencyAudit.relationshipsUsed.map((r: string, i: number) => (
                      <div key={i} className="text-[11px] font-mono text-purple-300 bg-slate-900 p-1.5 rounded border border-slate-800">
                        {r}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {response.transparencyAudit.filtersApplied && response.transparencyAudit.filtersApplied.length > 0 && (
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Filtros de Negócio:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {response.transparencyAudit.filtersApplied.map((f: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-500/20 font-mono text-[11px]">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SQL Gerado e Validado */}
          {response.sql && (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200 flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-cyan-400" />
                  <span>SQL Gerado e Validado pelo Quality Gate</span>
                </span>
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px]">
                  Somente Leitura (SELECT)
                </span>
              </div>
              <div className="p-3 bg-black/60 rounded-lg text-xs font-mono text-cyan-300 border border-slate-800/80 overflow-x-auto">
                <pre>{response.sql}</pre>
              </div>
            </div>
          )}

          {/* Dados Brutos Retornados */}
          {response.rows && response.rows.length > 0 && (
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <TableIcon className="w-4 h-4 text-indigo-400" />
                <span>Dados Retornados do Banco ({response.rows.length} registros)</span>
              </span>
              <div className="overflow-x-auto max-h-60 rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 sticky top-0">
                    <tr>
                      {response.columns.map((col: string) => (
                        <th key={col} className="p-2 border-b border-slate-800 font-mono">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {response.rows.slice(0, 15).map((row: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        {response.columns.map((col: string) => (
                          <td key={col} className="p-2 font-mono text-[11px]">
                            {typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
