import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../store/useChatStore';
import { ModelInfo } from '@oraculo/shared';
import { Cpu, Search, Eye, Brain, ChevronDown, Check, Zap, Code2, Sparkles, Clock } from 'lucide-react';

function getModelFirstName(fullName: string | null | undefined): string {
  if (!fullName) return 'Modelo IA';
  const clean = fullName.split(/[:/\-_]/)[0].trim();
  if (clean.toLowerCase() === 'deepseek') return 'DeepSeek';
  if (clean.toLowerCase() === 'llama') return 'Llama';
  if (clean.toLowerCase() === 'qwen') return 'Qwen';
  if (clean.toLowerCase() === 'mistral') return 'Mistral';
  if (clean.toLowerCase() === 'gemma') return 'Gemma';
  if (clean.toLowerCase() === 'phi') return 'Phi';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

interface CapabilityMeta {
  category: 'raciocinio' | 'visao' | 'codigo' | 'geral';
  shortLabel: string;
  fullLabel: string;
  description: string;
  badgeClass: string;
  icon: React.ReactNode;
}

function getModelCapabilityMeta(m: ModelInfo | undefined, modelKey: string): CapabilityMeta {
  const k = modelKey.toLowerCase();
  const name = m?.display_name || modelKey;
  const n = name.toLowerCase();

  // Vision Capability Priority
  if (
    m?.capabilities?.vision ||
    k.includes('vision') || n.includes('vision') ||
    k.includes('vl') || n.includes('vl') ||
    k.includes('llava') || n.includes('llava') ||
    k.includes('gemma-4') || n.includes('gemma-4') ||
    k.includes('gemma4') || n.includes('gemma4')
  ) {
    return {
      category: 'visao',
      shortLabel: 'Análise de Imagens',
      fullLabel: '👁️ Leitura de Imagens & Fotos',
      description: 'Ideal para entender fotos, gráficos, prints e PDFs visuais',
      badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      icon: <Eye className="w-3.5 h-3.5 text-purple-400 shrink-0" />,
    };
  }

  // Reasoning Capability
  if (
    m?.capabilities?.reasoning ||
    k.includes('r1') || n.includes('r1') ||
    k.includes('reason') || n.includes('reason') ||
    k.includes('think') || n.includes('think')
  ) {
    return {
      category: 'raciocinio',
      shortLabel: 'Raciocínio Profundo',
      fullLabel: '🧠 Raciocínio & Lógica Complexa',
      description: 'Ideal para problemas difíceis, matemática e análises detalhadas',
      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      icon: <Brain className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
    };
  }

  // Coding Capability
  if (
    m?.capabilities?.tools ||
    k.includes('coder') || n.includes('coder') ||
    k.includes('code') || n.includes('code')
  ) {
    return {
      category: 'codigo',
      shortLabel: 'Código & TI',
      fullLabel: '💻 Programação & Scripts',
      description: 'Especialista em escrever, depurar e otimizar código',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      icon: <Code2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
    };
  }

  // General Fast
  return {
    category: 'geral',
    shortLabel: 'Geral & Rápido',
    fullLabel: '⚡ Respostas Rápidas & Conversa',
    description: 'Excelente para tarefas do dia a dia, resumos e e-mails rápidos',
    badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    icon: <Zap className="w-3.5 h-3.5 text-indigo-400 shrink-0" />,
  };
}

function getModelSpeedBadge(m: ModelInfo) {
  if (m.avg_duration_ms) {
    const sec = (m.avg_duration_ms / 1000).toFixed(1);
    const tps = m.avg_tokens_per_second ? ` (${m.avg_tokens_per_second} t/s)` : '';
    return {
      text: `~${sec}s${tps}`,
      title: `Tempo médio real de resposta: ${sec} segundos`,
    };
  }
  if (m.capabilities?.reasoning) {
    return { text: '~4-7s', title: 'Velocidade estimada: Modelo analítico' };
  }
  if (m.capabilities?.vision) {
    return { text: '~2-4s', title: 'Velocidade estimada: Processamento visual' };
  }
  return { text: '~1-2s', title: 'Velocidade estimada: Resposta ultrarrápida' };
}

export const ModelSelector: React.FC = () => {
  const { models, selectedModel, setSelectedModel, loadModels } = useChatStore();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'todos' | 'raciocinio' | 'geral' | 'codigo' | 'visao'>('todos');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAutoMode = selectedModel === 'auto' || selectedModel === 'auto-select' || !selectedModel;
  const activeModelObj = models.find((m) => m.key === selectedModel);
  const activeFirstName = isAutoMode ? 'Auto Seleção' : getModelFirstName(activeModelObj ? activeModelObj.display_name : selectedModel);
  const activeMeta = isAutoMode
    ? {
        category: 'geral' as const,
        shortLabel: 'Auto',
        description: 'Escolha automática pelo contexto',
        icon: <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
      }
    : getModelCapabilityMeta(activeModelObj, selectedModel);

  const filteredModels = models.filter((m) => {
    const matchesSearch =
      m.display_name.toLowerCase().includes(search.toLowerCase()) ||
      m.key.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (categoryFilter === 'todos') return true;

    if (categoryFilter === 'visao') return Boolean(m.capabilities?.vision);
    if (categoryFilter === 'raciocinio') return Boolean(m.capabilities?.reasoning);
    if (categoryFilter === 'codigo') return Boolean(m.capabilities?.tools);
    return true;
  });

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button - Clean & Minimal */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-[#121420] hover:bg-[#1a1c2c] border border-white/10 hover:border-indigo-500/40 rounded-full text-xs font-medium text-slate-200 transition shadow-sm cursor-pointer"
        title={`Modelo: ${activeFirstName}`}
      >
        <Cpu className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span className="font-semibold text-slate-100 text-xs truncate max-w-[130px]">
          {activeFirstName}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Minimalist Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 bottom-full mb-2 w-[320px] sm:w-[350px] max-w-[calc(100vw-24px)] bg-[#0d0f18] border border-white/10 rounded-xl shadow-2xl p-2.5 z-[100] space-y-2 animate-in fade-in zoom-in-95 duration-150">
          
          {/* Header & Minimal Search */}
          <div className="space-y-2 pb-1 border-b border-white/5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Modelo de Inteligência</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {models.length} disponíveis
              </span>
            </div>

            {/* Minimal Search Bar */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar modelo..."
                className="w-full pl-8 pr-3 py-1 bg-[#161826] border border-white/10 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition"
              />
            </div>

            {/* Minimal Category Filter Tabs */}
            <div className="flex items-center gap-1 text-[10px] font-medium pt-0.5">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'visao', label: 'Visão' },
                { id: 'raciocinio', label: 'Raciocínio' },
                { id: 'codigo', label: 'Código' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id as any)}
                  className={`flex-1 py-1 rounded-md text-center transition cursor-pointer ${
                    categoryFilter === cat.id
                      ? 'bg-indigo-600/90 text-white font-semibold shadow-sm'
                      : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Auto Selector Option */}
          <div
            onClick={() => {
              setSelectedModel('auto');
              setIsOpen(false);
            }}
            className={`px-2.5 py-2 rounded-lg cursor-pointer transition flex items-center justify-between gap-2 ${
              isAutoMode
                ? 'bg-indigo-950/80 text-white border border-indigo-500/40'
                : 'hover:bg-white/5 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <div className="truncate">
                <div className="text-xs font-semibold text-slate-100">Auto (Recomendado)</div>
                <div className="text-[10px] text-slate-400 truncate">Roteia automaticamente pela pergunta</div>
              </div>
            </div>
            {isAutoMode && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
          </div>

          {/* Clean Model List */}
          <div className="max-h-56 overflow-y-auto space-y-0.5 divide-y divide-white/5 pt-1">
            {filteredModels.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">
                Nenhum modelo encontrado
              </div>
            ) : (
              filteredModels.map((m) => {
                const isSelected = m.key === selectedModel;
                const firstName = getModelFirstName(m.display_name);
                const meta = getModelCapabilityMeta(m, m.key);
                const speed = getModelSpeedBadge(m);

                return (
                  <div
                    key={m.key}
                    onClick={() => {
                      setSelectedModel(m.key);
                      setIsOpen(false);
                    }}
                    className={`px-2.5 py-2 rounded-lg cursor-pointer transition flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-indigo-950/80 text-white font-medium'
                        : 'hover:bg-white/5 text-slate-300'
                    }`}
                  >
                    {/* Left: Capability Icon & Name */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="shrink-0">{meta.icon}</span>
                      <span className="text-xs font-semibold text-slate-100 truncate">
                        {firstName}
                      </span>
                      {m.is_loaded && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Carregado na VRAM" />
                      )}
                    </div>

                    {/* Right: Speed & Selection Checkmark */}
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-400" title={speed.title}>
                        {speed.text.split(' ')[0]}
                      </span>
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      ) : (
                        <span className="w-3.5 h-3.5 shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};



