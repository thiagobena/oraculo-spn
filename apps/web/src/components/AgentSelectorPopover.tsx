import React, { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../store/useChatStore';
import { AssistantItem } from '@oraculo/shared';
import {
  Bot,
  Search,
  Check,
  Sparkles,
  Code2,
  Database,
  Wrench,
  Shield,
  Cpu,
  UserCheck,
} from 'lucide-react';

interface AgentSelectorPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAgent?: (agent: AssistantItem) => void;
}

function renderAssistantIcon(iconName: string | undefined | null) {
  const name = (iconName || '').toLowerCase().trim();
  if (name === 'code-2' || name === 'code' || name === 'coder') {
    return <Code2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  }
  if (name === 'database' || name === 'sql' || name === 'db') {
    return <Database className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
  }
  if (name === 'wrench' || name === 'suporte' || name === 'tools') {
    return <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  }
  if (name === 'shield' || name === 'security' || name === 'auditoria') {
    return <Shield className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
  }
  if (name === 'cpu' || name === 'ai') {
    return <Cpu className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
  }
  if (name === 'bot' || name === 'assistente') {
    return <Bot className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
  }
  return <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
}

export const AgentSelectorPopover: React.FC<AgentSelectorPopoverProps> = ({
  isOpen,
  onClose,
  onSelectAgent,
}) => {
  const { assistants, selectedAssistant, setSelectedAssistant, loadAssistants } = useChatStore();
  const [search, setSearch] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadAssistants();
    }
  }, [isOpen, loadAssistants]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredAssistants = assistants.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (assistant: AssistantItem) => {
    setSelectedAssistant(assistant);
    if (onSelectAgent) {
      onSelectAgent(assistant);
    }
    onClose();
  };

  const handleClear = () => {
    setSelectedAssistant(null);
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 bottom-full mb-2 w-[300px] sm:w-[320px] max-w-[calc(100vw-24px)] bg-[#0d0f18] border border-white/10 rounded-xl shadow-2xl p-2 z-[100] space-y-1.5 animate-in fade-in zoom-in-95 duration-150 select-none"
    >
      {/* Sleek Minimal Header */}
      <div className="space-y-1.5 pb-1 border-b border-white/5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-indigo-400" />
            <span>Mencionar Agente</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            {assistants.length} disponíveis
          </span>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar agente..."
            autoFocus
            className="w-full pl-8 pr-3 py-1 bg-[#161826] border border-white/10 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition"
          />
        </div>
      </div>

      {/* Currently Selected Agent Indicator */}
      {selectedAssistant && (
        <div className="flex items-center justify-between px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-[11px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <UserCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="text-indigo-200 font-medium truncate">
              {selectedAssistant.name}
            </span>
          </div>
          <button
            onClick={handleClear}
            className="text-slate-400 hover:text-red-400 text-[10px] transition shrink-0 ml-1 underline"
          >
            Remover
          </button>
        </div>
      )}

      {/* Agents List - Clean Minimal Rows */}
      <div className="max-h-56 overflow-y-auto space-y-0.5 divide-y divide-white/5 pt-0.5">
        {filteredAssistants.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500">
            Nenhum agente encontrado
          </div>
        ) : (
          filteredAssistants.map((assistant) => {
            const isSelected = selectedAssistant?.id === assistant.id;
            return (
              <div
                key={assistant.id}
                onClick={() => handleSelect(assistant)}
                className={`px-2.5 py-1.5 rounded-lg cursor-pointer transition flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-indigo-950/80 text-white font-medium'
                    : 'hover:bg-white/5 text-slate-300'
                }`}
              >
                {/* Left: Icon & Name */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {renderAssistantIcon(assistant.icon)}
                  <div className="truncate min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-100 truncate">
                        {assistant.name}
                      </span>
                      {assistant.is_default && (
                        <span className="text-[9px] font-mono text-slate-500">
                          (padrão)
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      {assistant.description}
                    </p>
                  </div>
                </div>

                {/* Right: Checkmark */}
                {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
