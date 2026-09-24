import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Table as TableIcon,
  Check,
  X,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  SemanticCoverageData,
  SuggestedRelItem,
  fetchSemanticDiagnosticApi,
  fetchSemanticSuggestionsApi,
  createSemanticRelationshipApi,
} from '../../services/semanticApi';

interface DiagnosticViewProps {
  token: string;
  dataSourceId: string;
}

export const DiagnosticView: React.FC<DiagnosticViewProps> = ({ token, dataSourceId }) => {
  const [coverage, setCoverage] = useState<SemanticCoverageData | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedRelItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadDiagnostic = async () => {
    if (!token || !dataSourceId) return;
    setIsLoading(true);
    try {
      const [diagRes, sugRes] = await Promise.all([
        fetchSemanticDiagnosticApi(token, dataSourceId),
        fetchSemanticSuggestionsApi(token, dataSourceId),
      ]);
      if (diagRes.success) setCoverage(diagRes.coverage);
      if (sugRes.success) setSuggestions(sugRes.suggestions);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnostic();
  }, [token, dataSourceId]);

  const handleApproveSuggestion = async (sug: SuggestedRelItem) => {
    if (!token) return;
    try {
      await createSemanticRelationshipApi(token, {
        dataSourceId,
        sourceTableId: sug.sourceTableId,
        sourceColumnId: sug.sourceColumnId,
        targetTableId: sug.targetTableId,
        targetColumnId: sug.targetColumnId,
        cardinality: sug.cardinality,
        relType: 'logical',
        joinType: 'INNER',
        businessDescription: sug.reason,
        confidence: 'automatic',
        status: 'validated',
        priority: 'normal',
      });
      alert('Relacionamento aprovado e adicionado com sucesso ao Grafo Semântico!');
      loadDiagnostic();
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  };

  const handleIgnoreSuggestion = (sug: SuggestedRelItem) => {
    setSuggestions((prev) =>
      prev.filter(
        (s) =>
          !(
            s.sourceTableId === sug.sourceTableId &&
            s.sourceColumnId === sug.sourceColumnId &&
            s.targetTableId === sug.targetTableId &&
            s.targetColumnId === sug.targetColumnId
          )
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Cards de Cobertura Semântica */}
      {coverage && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <span className="text-xs text-slate-400">Tabelas Documentadas</span>
            <div className="text-2xl font-bold text-cyan-400 mt-1">
              {coverage.tablesDocumentationPct}%
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {coverage.documentedTables} de {coverage.totalTables} tabelas
            </p>
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <span className="text-xs text-slate-400">Colunas Documentadas</span>
            <div className="text-2xl font-bold text-indigo-400 mt-1">
              {coverage.columnsDocumentationPct}%
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {coverage.documentedColumns} de {coverage.totalColumns} colunas
            </p>
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <span className="text-xs text-slate-400">Relações Validadas</span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {coverage.validatedRelationships}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {coverage.totalRelationships} conexões no total
            </p>
          </div>

          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <span className="text-xs text-slate-400">Conhecimento Corporativo</span>
            <div className="text-2xl font-bold text-purple-400 mt-1">
              {coverage.businessTermsCount + coverage.metricsCount + coverage.validatedQueriesCount}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Termos, métricas e queries
            </p>
          </div>
        </div>
      )}

      {/* Tabelas Isoladas */}
      {coverage && coverage.isolatedTablesCount > 0 && (
        <div className="p-4 bg-amber-950/30 border border-amber-500/30 rounded-2xl space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-amber-200">
              {coverage.isolatedTablesCount} Tabela(s) sem Relacionamentos no Grafo
            </h4>
          </div>
          <p className="text-[11px] text-slate-300">
            Tabelas sem relacionamentos não podem ser conectadas pelo Query Planner a outras entidades. Considere criar relações lógicas no Mapa de Dados.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {coverage.isolatedTableNames.map((tbl, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-slate-900/90 text-amber-300 border border-amber-500/20 font-mono text-[10px]">
                {tbl}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sugestões Automáticas de Relacionamentos (Detecção Assistida com Aprovação Humana) */}
      <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
              Sugestões Automáticas de Relacionamentos ({suggestions.length})
            </h4>
          </div>
          <span className="text-[10px] text-slate-400 italic">
            Exige aprovação humana (Zero Trust)
          </span>
        </div>

        {suggestions.length === 0 ? (
          <p className="text-xs text-slate-500">
            Nenhuma nova sugestão pendente de relacionamento detectada no momento.
          </p>
        ) : (
          <div className="space-y-3">
            {suggestions.map((sug, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-950 border border-slate-800/80 rounded-xl flex flex-wrap items-center justify-between gap-3 hover:border-slate-700 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-cyan-300 font-semibold">{sug.sourceTableName}.{sug.sourceColumnName}</span>
                    <span className="text-slate-500">→</span>
                    <span className="text-indigo-300 font-semibold">{sug.targetTableName}.{sug.targetColumnName}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                      Confiança: {Math.round(sug.confidenceScore * 100)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">{sug.reason}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleIgnoreSuggestion(sug)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Ignorar
                  </button>
                  <button
                    onClick={() => handleApproveSuggestion(sug)}
                    className="flex items-center gap-1 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-md transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" /> Aprovar Conexão
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
