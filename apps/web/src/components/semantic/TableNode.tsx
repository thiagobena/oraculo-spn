import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Table as TableIcon,
  Key,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ShieldAlert,
  Calendar,
  Hash,
  Layers,
} from 'lucide-react';
import { SemanticGraphNode } from '../../services/semanticApi';

interface TableNodeProps {
  data: SemanticGraphNode & {
    onSelectTable: (table: SemanticGraphNode) => void;
    onSelectColumn: (column: any, table: SemanticGraphNode) => void;
  };
  selected?: boolean;
}

export const TableNode: React.FC<TableNodeProps> = ({ data, selected }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const getClassificationBadge = (classification: string) => {
    switch (classification) {
      case 'identifier':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">ID</span>;
      case 'measure':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Métrica</span>;
      case 'date':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">Data</span>;
      case 'sensitive':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">Sensível</span>;
      case 'status':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">Status</span>;
      default:
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300">Dimensão</span>;
    }
  };

  return (
    <div
      onClick={() => data.onSelectTable(data)}
      className={`min-w-[280px] max-w-[340px] rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-200 cursor-pointer ${
        selected
          ? 'bg-[#151926] border-cyan-500 ring-2 ring-cyan-500/30 shadow-cyan-950/50'
          : data.aiEnabled
          ? 'bg-[#0f111a]/95 border-slate-800 hover:border-slate-700'
          : 'bg-[#0f111a]/70 border-slate-800/60 opacity-70'
      }`}
    >
      {/* Table Header */}
      <div className="p-3 border-b border-slate-800/80 bg-gradient-to-r from-slate-900/90 to-slate-900/40 rounded-t-xl flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="p-1.5 rounded-lg bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 shrink-0">
            <TableIcon className="w-4 h-4" />
          </div>
          <div className="overflow-hidden">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold text-slate-100 truncate" title={data.displayName || data.tableName}>
                {data.displayName || data.tableName}
              </h4>
              {data.domain && (
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium">
                  {data.domain}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-mono truncate" title={`${data.schemaName}.${data.tableName}`}>
              {data.schemaName}.{data.tableName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {data.aiEnabled && (
            <span title="Habilitado para IA" className="text-cyan-400">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-md transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Description Preview */}
      {data.businessDescription && (
        <div className="px-3 py-1.5 bg-slate-950/40 border-b border-slate-800/40 text-[10px] text-slate-300 line-clamp-1 italic">
          "{data.businessDescription}"
        </div>
      )}

      {/* Columns List */}
      {isExpanded && (
        <div className="p-1.5 space-y-1 max-h-[300px] overflow-y-auto no-scrollbar">
          {data.columns.map((col) => (
            <div
              key={col.id}
              onClick={(e) => {
                e.stopPropagation();
                data.onSelectColumn(col, data);
              }}
              className="relative flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-800/50 transition-colors group"
            >
              {/* React Flow Source & Target Handles for connections */}
              <Handle
                type="target"
                position={Position.Left}
                id={`${col.columnName}-target`}
                className="!w-2 !h-2 !bg-cyan-500 !border-slate-900 -ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
              />

              <div className="flex items-center gap-1.5 overflow-hidden">
                {col.isPk ? (
                  <span title="Chave Primária (PK)"><Key className="w-3 h-3 text-amber-400 shrink-0" /></span>
                ) : col.isFk ? (
                  <span title="Chave Estrangeira (FK)"><LinkIcon className="w-3 h-3 text-cyan-400 shrink-0" /></span>
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                )}

                <span
                  className={`text-[11px] font-mono truncate ${
                    col.isPk ? 'text-amber-200 font-semibold' : 'text-slate-300'
                  }`}
                  title={col.displayName || col.columnName}
                >
                  {col.displayName || col.columnName}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[9px] text-slate-500 font-mono">{col.dataType}</span>
                {getClassificationBadge(col.classification)}
              </div>

              <Handle
                type="source"
                position={Position.Right}
                id={`${col.columnName}-source`}
                className="!w-2 !h-2 !bg-indigo-500 !border-slate-900 -mr-1 opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
          ))}
        </div>
      )}

      {/* Footer info */}
      <div className="px-3 py-1.5 border-t border-slate-800/60 bg-slate-950/60 rounded-b-xl flex items-center justify-between text-[10px] text-slate-400">
        <span>{data.columnsCount} colunas</span>
        <span className="capitalize">{data.priority} prioridade</span>
      </div>
    </div>
  );
};
