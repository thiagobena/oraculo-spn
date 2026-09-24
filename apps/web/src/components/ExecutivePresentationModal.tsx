import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Tv,
  Sparkles,
  CheckCircle2,
  Layers,
  Copy,
  Check,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Slide {
  id: number;
  title: string;
  subtitle?: string;
  content: string;
  bullets: string[];
  kpis: { label: string; value: string; trend?: string }[];
  isCover?: boolean;
}

interface ExecutivePresentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawMarkdown: string;
  title?: string;
}

export const ExecutivePresentationModal: React.FC<ExecutivePresentationModalProps> = ({
  isOpen,
  onClose,
  rawMarkdown,
  title = 'Apresentação Executiva — Oráculo IA',
}) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Parser: Quebra o markdown em slides inteligentes
  const slides: Slide[] = useMemo(() => {
    if (!rawMarkdown) {
      return [
        {
          id: 1,
          title: 'Relatório Executivo',
          subtitle: 'Oráculo SPN Inteligência Farmacêutica',
          content: 'Nenhum dado disponível para apresentação.',
          bullets: [],
          kpis: [],
          isCover: true,
        },
      ];
    }

    // Dividir por divisores explícitos '---' ou por títulos nível 1/2 ('# ' ou '## ')
    const rawSections = rawMarkdown
      .split(/\n---\n|\n(?=##?\s)/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    if (rawSections.length === 0) {
      return [
        {
          id: 1,
          title: 'Sumário Executivo',
          subtitle: 'Oráculo SPN Business Intelligence',
          content: rawMarkdown,
          bullets: [],
          kpis: [],
          isCover: true,
        },
      ];
    }

    const parsedSlides: Slide[] = rawSections.map((section, idx) => {
      const lines = section.split('\n');
      let slideTitle = `Destaque ${idx + 1}`;
      const bullets: string[] = [];
      const kpis: { label: string; value: string; trend?: string }[] = [];

      // Extrair título
      const titleMatch = section.match(/^#+\s*(.+)$/m);
      if (titleMatch) {
        slideTitle = titleMatch[1].replace(/[*_#]/g, '').trim();
      }

      // Extrair tópicos com bullet points
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
          const bulletText = trimmed.replace(/^[-*•]\s*/, '').replace(/[*_]/g, '').trim();
          if (bulletText.length > 0) bullets.push(bulletText);
        }

        // Tentar identificar KPIs (Ex: "Faturamento: R$ 1.500.000" ou "Margem: 32%")
        const kpiMatch = trimmed.match(/^[-*•]?\s*([A-Za-zÀ-ÿ\s]{3,25}):\s*([R$\d,.\s%kKmM]+)$/);
        if (kpiMatch && kpis.length < 4) {
          kpis.push({
            label: kpiMatch[1].trim(),
            value: kpiMatch[2].trim(),
          });
        }
      }

      const isCover = idx === 0;

      return {
        id: idx + 1,
        title: slideTitle,
        subtitle: isCover ? 'Oráculo IA • Inteligência Farmacêutica & Estratégia' : undefined,
        content: section,
        bullets,
        kpis,
        isCover,
      };
    });

    return parsedSlides;
  }, [rawMarkdown]);

  // Navegação por teclado
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowRight' || e.key === 'Space') {
        e.preventDefault();
        setCurrentSlideIndex((prev) => Math.min(prev + 1, slides.length - 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentSlideIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    },
    [isOpen, slides.length, isFullscreen, onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (isOpen) {
      setCurrentSlideIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentSlide = slides[currentSlideIndex] || slides[0];

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const copySlideText = () => {
    navigator.clipboard.writeText(currentSlide.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#07090e] text-slate-100 select-none overflow-hidden animate-in fade-in duration-200">
      {/* Top Bar / Toolbar */}
      <div className="h-16 px-6 border-b border-[#1b2030] bg-[#0c0f18]/80 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white shadow-lg shadow-cyan-950/50">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <span>{title}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 uppercase tracking-widest font-mono">
                Executive Mode
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">Modo de projeção e apresentação executiva para diretoria</p>
          </div>
        </div>

        {/* Slide navigation & actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#131726] border border-[#22293d] rounded-xl px-2 py-1 text-xs font-mono text-slate-300 mr-2">
            <span className="text-cyan-400 font-bold">{currentSlideIndex + 1}</span>
            <span className="mx-1 text-slate-600">/</span>
            <span>{slides.length}</span>
          </div>

          <button
            onClick={() => setCurrentSlideIndex((prev) => Math.max(prev - 1, 0))}
            disabled={currentSlideIndex === 0}
            className="p-2 rounded-xl bg-[#131726] hover:bg-[#1a2035] text-slate-300 border border-[#22293d] transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            title="Slide Anterior (Seta Esquerda)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => setCurrentSlideIndex((prev) => Math.min(prev + 1, slides.length - 1))}
            disabled={currentSlideIndex === slides.length - 1}
            className="p-2 rounded-xl bg-[#131726] hover:bg-[#1a2035] text-slate-300 border border-[#22293d] transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            title="Próximo Slide (Seta Direita / Espaço)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="h-5 w-px bg-slate-800 mx-1" />

          <button
            onClick={copySlideText}
            className="p-2 rounded-xl bg-[#131726] hover:bg-[#1a2035] text-slate-300 border border-[#22293d] transition cursor-pointer"
            title="Copiar texto do slide"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-[#131726] hover:bg-[#1a2035] text-slate-300 border border-[#22293d] transition cursor-pointer"
            title="Alternar Tela Cheia (F11)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition cursor-pointer ml-1"
            title="Fechar Apresentação (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Slide Canvas */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 overflow-y-auto relative">
        {/* Background glow ornaments */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Slide Card */}
        <div className="w-full max-w-5xl bg-[#0f1320]/90 border border-[#222a40] rounded-3xl p-8 md:p-12 shadow-2xl backdrop-blur-xl relative overflow-hidden transition-all duration-300 flex flex-col justify-between min-h-[500px]">
          {/* Subtle slide watermark */}
          <div className="absolute top-6 right-8 flex items-center gap-1.5 opacity-30 text-[11px] font-mono tracking-widest text-slate-400 uppercase">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Oráculo IA • Board View</span>
          </div>

          {/* Slide Header */}
          <div className="space-y-3 mb-8">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs uppercase tracking-widest font-semibold text-cyan-400 font-mono">
                {currentSlide.isCover ? 'Apresentação Executiva' : `Tópico ${currentSlide.id} / ${slides.length}`}
              </span>
            </div>

            <h2 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400 leading-tight">
              {currentSlide.title}
            </h2>

            {currentSlide.subtitle && (
              <p className="text-sm md:text-base text-cyan-200/70 font-medium">
                {currentSlide.subtitle}
              </p>
            )}
          </div>

          {/* Slide Body: KPIs Grid if present */}
          {currentSlide.kpis.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {currentSlide.kpis.map((kpi, kIdx) => (
                <div
                  key={kIdx}
                  className="p-4 rounded-2xl bg-[#141a2c] border border-[#26314d] flex flex-col justify-between"
                >
                  <span className="text-xs text-slate-400 font-medium truncate">{kpi.label}</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-xl md:text-2xl font-bold text-cyan-300 font-mono">{kpi.value}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Slide Body: Bullets or Markdown Content */}
          <div className="flex-1 space-y-4">
            {currentSlide.bullets.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentSlide.bullets.map((bullet, bIdx) => (
                  <div
                    key={bIdx}
                    className="p-4 rounded-2xl bg-[#121624]/60 border border-[#1e2538] hover:border-cyan-500/40 transition flex items-start gap-3.5 group"
                  >
                    <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:scale-110 transition mt-0.5 shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <p className="text-sm text-slate-200 leading-relaxed font-normal">{bullet}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="prose prose-invert prose-slate max-w-none text-sm md:text-base leading-relaxed overflow-x-auto">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {currentSlide.content}
                </ReactMarkdown>
              </div>
            )}
          </div>

          {/* Slide Footer */}
          <div className="pt-8 mt-8 border-t border-[#1b2234] flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>Painel Executivo de Diretoria</span>
            </div>
            <div className="font-mono text-[11px] text-slate-500">
              Pressione <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300">Espaço</kbd> ou{' '}
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300">→</kbd> para avançar
            </div>
          </div>
        </div>
      </div>

      {/* Slide Thumbnails / Progress Bar */}
      <div className="h-12 px-6 border-t border-[#1b2030] bg-[#0c0f18]/90 flex items-center justify-center gap-2 shrink-0 overflow-x-auto">
        {slides.map((s, idx) => (
          <button
            key={s.id}
            onClick={() => setCurrentSlideIndex(idx)}
            className={`h-2 transition-all rounded-full cursor-pointer ${
              idx === currentSlideIndex
                ? 'w-12 bg-gradient-to-r from-cyan-400 to-indigo-500 shadow-md shadow-cyan-500/50'
                : 'w-4 bg-slate-700 hover:bg-slate-500'
            }`}
            title={`Ir para o slide ${idx + 1}: ${s.title}`}
          />
        ))}
      </div>
    </div>
  );
};
