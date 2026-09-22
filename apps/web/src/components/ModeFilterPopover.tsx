import React, { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../store/useChatStore';
import {
  SlidersHorizontal,
  Check,
  Target,
  Code2,
  ShieldCheck,
  BarChart3,
  BookOpen,
  Sparkles,
  Eye,
  Brain,
  Zap,
} from 'lucide-react';

interface ModeFilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  activeTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
}

interface ModePreset {
  id: string;
  name: string;
  tag: string;
  description: string;
  icon: React.ReactNode;
}

const PRESET_MODES: ModePreset[] = [
  {
    id: 'executivo',
    name: 'Executivo & Direto',
    tag: 'Executivo',
    description: 'Respostas concisas e objetivas',
    icon: <Target className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
  },
  {
    id: 'codigo',
    name: 'Especialista em Código',
    tag: 'Código & TI',
    description: 'Sintaxe limpa, scripts e TI',
    icon: <Code2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
  },
  {
    id: 'auditoria',
    name: 'Auditoria & Compliance SPN',
    tag: 'Auditoria SPN',
    description: 'Segurança e conformidade',
    icon: <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />,
  },
  {
    id: 'dados',
    name: 'Análise de Dados',
    tag: 'Análise de Dados',
    description: 'Métricas, estatísticas e tabelas',
    icon: <BarChart3 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />,
  },
  {
    id: 'didatico',
    name: 'Didático / Passo a Passo',
    tag: 'Didático',
    description: 'Explicações simples e tutoriais',
    icon: <BookOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" />,
  },
  {
    id: 'criativo',
    name: 'Criativo & Brainstorming',
    tag: 'Criativo',
    description: 'Ideias fora da caixa e resumos',
    icon: <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />,
  },
];

export const ModeFilterPopover: React.FC<ModeFilterPopoverProps> = ({
  isOpen,
  onClose,
  activeTags,
  onToggleTag,
  onClearTags,
}) => {
  const { models, selectedModel, setSelectedModel } = useChatStore();
  const [activeTab, setActiveTab] = useState<'modos' | 'filtros'>('modos');
  const popoverRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 bottom-full mb-2 w-[300px] sm:w-[320px] max-w-[calc(100vw-24px)] bg-[#0d0f18] border border-white/10 rounded-xl shadow-2xl p-2 z-[100] space-y-1.5 animate-in fade-in zoom-in-95 duration-150 select-none"
    >
      {/* Sleek Minimal Header */}
      <div className="space-y-1.5 pb-1 border-b border-white/5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
            <span>Modos & Filtros</span>
          </span>
          {activeTags.length > 0 && (
            <button
              onClick={onClearTags}
              className="text-[10px] text-indigo-400 hover:text-indigo-300 underline"
            >
              Limpar ({activeTags.length})
            </button>
          )}
        </div>

        {/* Minimal Category Tabs */}
        <div className="flex items-center gap-1 text-[10px] font-medium pt-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('modos')}
            className={`flex-1 py-1 rounded-md text-center transition cursor-pointer ${
              activeTab === 'modos'
                ? 'bg-indigo-600/90 text-white font-semibold shadow-sm'
                : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
            }`}
          >
            Estilos de Resposta
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('filtros')}
            className={`flex-1 py-1 rounded-md text-center transition cursor-pointer ${
              activeTab === 'filtros'
                ? 'bg-indigo-600/90 text-white font-semibold shadow-sm'
                : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
            }`}
          >
            Filtros de IA
          </button>
        </div>
      </div>

      {/* Tab: MODOS */}
      {activeTab === 'modos' && (
        <div className="max-h-56 overflow-y-auto space-y-0.5 divide-y divide-white/5 pt-0.5">
          {PRESET_MODES.map((preset) => {
            const isActive = activeTags.includes(preset.tag);
            return (
              <div
                key={preset.id}
                onClick={() => onToggleTag(preset.tag)}
                className={`px-2.5 py-1.5 rounded-lg cursor-pointer transition flex items-center justify-between gap-2 ${
                  isActive
                    ? 'bg-indigo-950/80 text-white font-medium'
                    : 'hover:bg-white/5 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {preset.icon}
                  <div className="truncate min-w-0">
                    <span className="text-xs font-semibold text-slate-100 truncate block">
                      {preset.name}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate block">
                      {preset.description}
                    </span>
                  </div>
                </div>

                {isActive && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: FILTROS */}
      {activeTab === 'filtros' && (
        <div className="space-y-1 pt-0.5">
          <div
            onClick={() => {
              const visionModel = models.find((m) => m.capabilities?.vision);
              if (visionModel) setSelectedModel(visionModel.key);
            }}
            className="px-2.5 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer transition flex items-center gap-2 text-slate-300"
          >
            <Eye className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <div className="truncate min-w-0">
              <span className="text-xs font-semibold text-slate-100 block">Leitura Visual (Visão)</span>
              <span className="text-[10px] text-slate-400 block">Ativa modelo com suporte a imagens</span>
            </div>
          </div>

          <div
            onClick={() => {
              const reasoningModel = models.find((m) => m.capabilities?.reasoning);
              if (reasoningModel) setSelectedModel(reasoningModel.key);
            }}
            className="px-2.5 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer transition flex items-center gap-2 text-slate-300"
          >
            <Brain className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div className="truncate min-w-0">
              <span className="text-xs font-semibold text-slate-100 block">Raciocínio Profundo</span>
              <span className="text-[10px] text-slate-400 block">Ativa modelo analítico avançado</span>
            </div>
          </div>

          <div
            onClick={() => {
              const fastModel = models.find((m) => !m.capabilities?.reasoning);
              if (fastModel) setSelectedModel(fastModel.key);
            }}
            className="px-2.5 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer transition flex items-center gap-2 text-slate-300"
          >
            <Zap className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <div className="truncate min-w-0">
              <span className="text-xs font-semibold text-slate-100 block">Resposta Rápida</span>
              <span className="text-[10px] text-slate-400 block">Ativa modelo ultrarrápido</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
