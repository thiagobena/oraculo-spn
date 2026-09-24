import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import { useChatStore } from '../store/useChatStore';
import { sendFeedbackApi } from '../services/api';
import { GenerationMetrics } from '@oraculo/shared';
import {
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  RotateCw,
  Brain,
  ChevronDown,
  ChevronUp,
  Clock,
  Zap,
  Activity,
  Sparkles,
  Share2,
  Scan,
  BarChart3,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  Table as TableIcon,
  Download,
  FileSpreadsheet,
  Volume2,
  VolumeX,
  FileText,
  Tv,
} from 'lucide-react';
import { ExecutivePresentationModal } from './ExecutivePresentationModal';

interface CodeBlockProps {
  language?: string;
  children: string;
}

const CHART_PALETTE = ['#06b6d4', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#ef4444', '#14b8a6', '#6366f1'];

interface ChartDataPoint {
  name: string;
  value: number;
  [key: string]: any;
}

interface ParsedChartPayload {
  type?: 'bar' | 'pie' | 'line';
  title?: string;
  data: ChartDataPoint[];
}

function exportToCsv(data: any[] | HTMLTableElement, filename = 'relatorio_oraculo') {
  let csvRows: string[] = [];

  if (Array.isArray(data)) {
    if (data.length === 0) return;
    const keys = Object.keys(data[0]);
    csvRows.push(keys.map((k) => `"${k.replace(/"/g, '""')}"`).join(';'));

    for (const row of data) {
      const values = keys.map((k) => {
        const val = row[k] ?? '';
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(';'));
    }
  } else if (data instanceof HTMLTableElement) {
    const rows = data.querySelectorAll('tr');
    rows.forEach((row) => {
      const cols = row.querySelectorAll('th, td');
      const rowData: string[] = [];
      cols.forEach((col) => {
        const text = (col.textContent || '').trim().replace(/"/g, '""');
        rowData.push(`"${text}"`);
      });
      if (rowData.length > 0) {
        csvRows.push(rowData.join(';'));
      }
    });
  }

  if (csvRows.length === 0) return;

  // UTF-8 BOM (\uFEFF) para garantir abertura com acentos corretos no Excel (Windows)
  const csvContent = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = filename.toLowerCase().replace(/[^a-z0-9_]/gi, '_');
  link.setAttribute('href', url);
  link.setAttribute('download', `${safeName}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const MarkdownTableWrapper: React.FC<React.HTMLAttributes<HTMLTableElement> & { node?: any }> = ({ children, ...props }) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const [downloaded, setDownloaded] = useState(false);

  const handleExport = () => {
    if (tableRef.current) {
      const tableElem = tableRef.current.querySelector('table');
      if (tableElem) {
        exportToCsv(tableElem, 'tabela_dados_oraculo');
        setDownloaded(true);
        setTimeout(() => setDownloaded(false), 2000);
      }
    }
  };

  return (
    <div ref={tableRef} className="overflow-hidden my-4 rounded-xl border border-white/10 bg-[#0d0e14]/70 shadow-lg select-text">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#12141f] border-b border-white/10 text-xs text-slate-300 select-none">
        <div className="flex items-center gap-2">
          <TableIcon className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold text-slate-200 text-[11px]">Tabela de Dados</span>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/20 transition cursor-pointer"
          title="Exportar para Excel / CSV"
        >
          {downloaded ? <Check className="w-3 h-3 text-emerald-400" /> : <Download className="w-3 h-3" />}
          <span>{downloaded ? 'Exportado!' : 'Exportar Excel'}</span>
        </button>
      </div>
      <div className="overflow-x-auto max-w-full p-2">
        <table className="min-w-full text-xs text-left border-collapse" {...props}>
          {children}
        </table>
      </div>
    </div>
  );
};

function tryParseChart(content: string): ParsedChartPayload | null {
  try {
    const raw = content.trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    // Formato 1: Objeto com chave data { type?: 'bar', title?: '...', data: [...] }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.data) && parsed.data.length > 0) {
      return {
        type: parsed.type || 'bar',
        title: parsed.title,
        data: parsed.data.map((d: any) => ({
          name: String(d.name || d.label || d.categoria || d.tecnico || d.item || d.mes || d.dia || d.filial || d.loja || 'Item'),
          value: Number(d.value ?? d.total ?? d.quantidade ?? d.valor ?? d.count ?? 0),
          ...d,
        })),
      };
    }

    // Formato 2: Array de objetos [{ name: 'A', value: 10 }] ou [{ categoria: 'A', total: 10 }]
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
      const first = parsed[0];
      const keys = Object.keys(first);
      const nameKey = keys.find((k) => typeof first[k] === 'string') || keys[0];
      const valKey = keys.find((k) => typeof first[k] === 'number' || !isNaN(Number(first[k]))) || keys[1] || keys[0];

      return {
        type: 'bar',
        data: parsed.map((d: any) => ({
          name: String(d[nameKey] ?? 'Item'),
          value: Number(d[valKey] ?? 0),
          ...d,
        })),
      };
    }

    // Formato 3: Dicionário chave-valor { "Lucas": 10, "Carlos": 5 }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed);
      if (entries.length > 0 && typeof entries[0][1] === 'number') {
        return {
          type: 'bar',
          data: entries.map(([k, v]) => ({ name: k, value: Number(v) })),
        };
      }
    }
  } catch (_) {}
  return null;
}

const chartViewTypeCache = new Map<string, 'bar' | 'pie' | 'line' | 'table'>();

const InteractiveChartBlock: React.FC<{ language: string; content: string }> = React.memo(({ language, content }) => {
  const chartPayload = tryParseChart(content);
  const cacheKey = content.trim();
  const [visType, setVisType] = useState<'bar' | 'pie' | 'line' | 'table'>(() => {
    return chartViewTypeCache.get(cacheKey) || chartPayload?.type || 'bar';
  });
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState(false);

  if (!chartPayload || !chartPayload.data || chartPayload.data.length === 0) {
    return <CodeBlock language={language}>{content}</CodeBlock>;
  }

  const handleSetVisType = (type: 'bar' | 'pie' | 'line' | 'table') => {
    chartViewTypeCache.set(cacheKey, type);
    setVisType(type);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    exportToCsv(chartPayload.data, chartPayload.title || 'grafico_analitico');
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  return (
    <div className="my-4 rounded-2xl border border-cyan-500/30 bg-[#0d101d] overflow-hidden text-xs shadow-2xl backdrop-blur-md select-text">
      {/* Header com Título e Switcher de Gráficos */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#13172b] border-b border-cyan-500/20 text-slate-300 select-none">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <BarChart3 className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-white text-xs tracking-tight">
            {chartPayload.title || 'Gráfico Analítico Interativo'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => handleSetVisType('bar')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
              visType === 'bar' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
            title="Ver como Gráfico de Barras"
          >
            <BarChart3 className="w-3 h-3" />
            <span>Barras</span>
          </button>
          <button
            onClick={() => handleSetVisType('pie')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
              visType === 'pie' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
            title="Ver como Gráfico de Pizza"
          >
            <PieChartIcon className="w-3 h-3" />
            <span>Pizza</span>
          </button>
          <button
            onClick={() => handleSetVisType('line')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
              visType === 'line' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
            title="Ver como Gráfico de Linhas"
          >
            <LineChartIcon className="w-3 h-3" />
            <span>Linhas</span>
          </button>
          <button
            onClick={() => handleSetVisType('table')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
              visType === 'table' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
            title="Ver Dados Brutos / Tabela"
          >
            <TableIcon className="w-3 h-3" />
            <span>Dados</span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition cursor-pointer"
            title="Exportar dados para Excel / CSV"
          >
            {exported ? <Check className="w-3 h-3 text-emerald-400" /> : <Download className="w-3 h-3" />}
            <span className="hidden sm:inline">{exported ? 'Exportado' : 'Excel'}</span>
          </button>
          <button
            onClick={handleCopy}
            className="p-1.5 hover:text-slate-100 text-slate-400 transition rounded-lg hover:bg-white/10 ml-0.5 cursor-pointer"
            title="Copiar JSON"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Renderizador do Canvas Recharts */}
      <div className="p-4">
        {visType === 'bar' && (
          <div className="h-64 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartPayload.data} margin={{ top: 15, right: 20, left: 10, bottom: 45 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={11}
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                  height={50}
                  tick={{ fill: '#94a3b8' }}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tick={{ fill: '#94a3b8' }}
                  tickFormatter={(val: any) => {
                    const num = Number(val);
                    if (isNaN(num)) return val;
                    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
                    if (num >= 1000) return `${(num / 1000).toFixed(0)}k`;
                    return String(num);
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#06b6d4',
                    borderRadius: '12px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
                  }}
                  formatter={(val: any) => [
                    typeof val === 'number' ? val.toLocaleString('pt-BR') : val,
                    'Valor',
                  ]}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {chartPayload.data.map((_, idx) => (
                    <Cell key={`cell-${idx}`} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {visType === 'pie' && (
          <div className="h-64 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#8b5cf6',
                    borderRadius: '12px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
                  }}
                  formatter={(val: any) => [
                    typeof val === 'number' ? val.toLocaleString('pt-BR') : val,
                    'Valor',
                  ]}
                />
                <Pie
                  data={chartPayload.data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={85}
                  innerRadius={45}
                  paddingAngle={3}
                  label={({ name, percent }: any) => {
                    const labelText = String(name || '');
                    const shortName = labelText.length > 15 ? `${labelText.slice(0, 13)}…` : labelText;
                    return `${shortName} (${(percent * 100).toFixed(0)}%)`;
                  }}
                  labelLine
                >
                  {chartPayload.data.map((_, idx) => (
                    <Cell key={`pie-cell-${idx}`} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {visType === 'line' && (
          <div className="h-64 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartPayload.data} margin={{ top: 15, right: 20, left: 10, bottom: 45 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={11}
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                  height={50}
                  tick={{ fill: '#94a3b8' }}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tick={{ fill: '#94a3b8' }}
                  tickFormatter={(val: any) => {
                    const num = Number(val);
                    if (isNaN(num)) return val;
                    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
                    if (num >= 1000) return `${(num / 1000).toFixed(0)}k`;
                    return String(num);
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#10b981',
                    borderRadius: '12px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
                  }}
                  formatter={(val: any) => [
                    typeof val === 'number' ? val.toLocaleString('pt-BR') : val,
                    'Valor',
                  ]}
                />
                <Line type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={3} dot={{ fill: '#06b6d4', r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {visType === 'table' && (
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#080a12] p-2">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 uppercase font-bold text-[10px]">
                  <th className="py-2 px-3">Item / Categoria</th>
                  <th className="py-2 px-3 text-right">Quantidade / Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {chartPayload.data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-white/5">
                    <td className="py-2 px-3 font-sans text-slate-200 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_PALETTE[idx % CHART_PALETTE.length] }} />
                      <span>{row.name}</span>
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-cyan-300">
                      {typeof row.value === 'number' ? row.value.toLocaleString('pt-BR') : row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
});

function formatModelCleanName(modelRaw: string | undefined): string {
  if (!modelRaw || modelRaw === 'auto') return 'Auto';
  const clean = modelRaw.split(/[:/\-_]/)[0].trim();
  if (modelRaw.toLowerCase().includes('coder')) return 'Qwen 2.5 Coder';
  if (modelRaw.toLowerCase().includes('r1')) return 'DeepSeek R1';
  if (modelRaw.toLowerCase().includes('gemma-4') || modelRaw.toLowerCase().includes('gemma4')) return 'Gemma 4 Vision';
  if (modelRaw.toLowerCase().includes('llama')) return 'Llama 3';
  if (modelRaw.toLowerCase().includes('qwen')) return 'Qwen 2.5';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function getUserInitials(clientName?: string): string {
  let rawName = clientName;

  if (!rawName || rawName === 'Usuário' || rawName === 'usuario' || rawName === 'anonymous') {
    try {
      const savedUser = localStorage.getItem('oraculo_spn_user_info');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        rawName = parsed.full_name || parsed.username || parsed.name || rawName;
      } else {
        const storedName = localStorage.getItem('oraculo_client_name');
        if (storedName && storedName !== 'Usuário') rawName = storedName;
      }
    } catch {}
  }

  if (!rawName || rawName === 'Usuário' || rawName === 'usuario' || rawName === 'anonymous') {
    return 'U';
  }

  // Clean domain prefixes (e.g. "DOMAIN\thiago.bena") and dots ("thiago.bena" -> "thiago bena")
  const clean = rawName.replace(/^.*[\\/]/, '').replace(/\./g, ' ').trim();
  const parts = clean.split(/\s+/).filter(Boolean);

  if (parts.length === 0) return 'U';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRawContent(content: string | undefined): string {
  if (!content) return '';
  // Auto-detect unfenced CSV/tabular text (e.g. at least 3 lines with multiple commas and no ``` code fences)
  if (!content.includes('```')) {
    const lines = content.trim().split('\n');
    const commaLines = lines.filter((l) => (l.match(/,/g) || []).length >= 3);
    if (lines.length >= 3 && commaLines.length / lines.length > 0.5) {
      return `\`\`\`csv\n${content}\n\`\`\``;
    }
  }
  return content;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, children }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-2xl border border-white/10 bg-[#0d0e14] overflow-hidden text-xs shadow-2xl select-text">
      <div className="flex items-center justify-between px-4 py-2 bg-[#161822] border-b border-white/5 text-slate-400 font-mono text-[11px] select-none">
        <span className="text-indigo-400 font-semibold">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 hover:text-slate-100 transition px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copiado!' : 'Copiar'}</span>
        </button>
      </div>
      <pre className="p-4 overflow-x-auto font-mono text-slate-200 leading-relaxed select-text">
        <code>{children}</code>
      </pre>
    </div>
  );
};

const MarkdownCodeBlock: React.FC<any> = ({ node, className, children, ...props }) => {
  const match = /language-([\w:]+)/.exec(className || '');
  const codeText = String(children).replace(/\n$/, '');
  const lang = (match ? match[1] : '').toLowerCase();

  if (
    ['chart', 'json:chart', 'barchart', 'piechart', 'linechart', 'graph'].includes(lang) ||
    (lang === 'json' && tryParseChart(codeText) !== null)
  ) {
    return <InteractiveChartBlock language={lang || 'chart'} content={codeText} />;
  }

  return match ? (
    <CodeBlock language={match[1]}>{codeText}</CodeBlock>
  ) : (
    <code className={className} {...props}>
      {children}
    </code>
  );
};

const MARKDOWN_COMPONENTS = {
  table: MarkdownTableWrapper,
  code: MarkdownCodeBlock,
};

const StopwatchBadge: React.FC<{ startTime: number | null }> = ({ startTime }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;
    const interval = setInterval(() => {
      setElapsed((Date.now() - startTime) / 1000);
    }, 100);
    return () => clearInterval(interval);
  }, [startTime]);

  if (!startTime) return null;

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold text-amber-300 bg-amber-500/15 px-2.5 py-0.5 rounded-full border border-amber-500/30 shadow-sm animate-pulse">
      <Clock className="w-3 h-3 text-amber-400" />
      <span>{elapsed.toFixed(1)}s</span>
    </span>
  );
};

const MessageMetadataFooter: React.FC<{ generation?: GenerationMetrics | null; model?: string }> = ({
  generation,
  model,
}) => {
  if (!generation) return null;

  const durationSec = generation.duration_ms ? (generation.duration_ms / 1000).toFixed(1) : null;
  const tps = generation.tokens_per_second ? generation.tokens_per_second.toFixed(1) : null;
  const cleanModelName = formatModelCleanName(model);

  return (
    <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center gap-3.5 text-[11px] font-mono text-slate-400 flex-wrap">
      {durationSec && (
        <span className="inline-flex items-center gap-1.5 bg-white/[0.03] px-2.5 py-1 rounded-lg border border-white/[0.05] hover:border-white/10 transition" title="Tempo total de resposta">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-medium text-slate-200">{durationSec}s</span>
        </span>
      )}

      {generation.total_tokens !== undefined && (
        <span
          className="inline-flex items-center gap-1.5 bg-white/[0.03] px-2.5 py-1 rounded-lg border border-white/[0.05] hover:border-white/10 transition"
          title={`Prompt tokens: ${generation.input_tokens || 0} • Output tokens: ${generation.output_tokens || 0}`}
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-medium text-slate-200">{generation.total_tokens} tokens</span>
          {generation.input_tokens !== undefined && generation.output_tokens !== undefined && (
            <span className="text-[10px] text-slate-500 font-normal">({generation.input_tokens} in • {generation.output_tokens} out)</span>
          )}
        </span>
      )}

      {tps && (
        <span className="inline-flex items-center gap-1.5 bg-white/[0.03] px-2.5 py-1 rounded-lg border border-white/[0.05] hover:border-white/10 transition" title="Velocidade de geração">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-medium text-slate-200">{tps} t/s</span>
        </span>
      )}

      {model && (
        <span className="inline-flex items-center gap-1.5 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20 transition ml-auto" title={`Modelo de IA que respondeu: ${model}`}>
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="truncate max-w-[200px] font-semibold text-indigo-200">{cleanModelName}</span>
        </span>
      )}
    </div>
  );
};

export const MessageList: React.FC = () => {
  const clientId = useChatStore((s) => s.clientId);
  const activeConversation = useChatStore((s) => s.activeConversation);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingToken = useChatStore((s) => s.streamingToken);
  const streamingReasoning = useChatStore((s) => s.streamingReasoning);
  const streamingStartTime = useChatStore((s) => s.streamingStartTime);
  const selectedModel = useChatStore((s) => s.selectedModel);
  const regenerateLastMessage = useChatStore((s) => s.regenerateLastMessage);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(null);
  const [showReasoningId, setShowReasoningId] = useState<Record<string, boolean>>({});
  const [isStreamingReasoningOpen, setIsStreamingReasoningOpen] = useState(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [presentationContent, setPresentationContent] = useState<{ isOpen: boolean; text: string; title?: string }>({
    isOpen: false,
    text: '',
    title: '',
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingReasoningRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const userHasScrolledUpRef = useRef<boolean>(false);
  const prevIsStreamingRef = useRef<boolean>(false);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

    if (distanceFromBottom > 120) {
      userHasScrolledUpRef.current = true;
      if (isStreaming) {
        setShowJumpToBottom(true);
      }
    } else {
      userHasScrolledUpRef.current = false;
      setShowJumpToBottom(false);
    }
  };

  const scrollToBottom = (smooth = false) => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
      scrollRafRef.current = null;
    });
  };

  // Real-time auto-scroll inside the Reasoning / Thinking box as thoughts arrive
  useEffect(() => {
    if (streamingReasoning && streamingReasoningRef.current) {
      streamingReasoningRef.current.scrollTop = streamingReasoningRef.current.scrollHeight;
    }
  }, [streamingReasoning]);

  // Real-time streaming scroll handling: do not force scroll if user scrolled up to read
  useEffect(() => {
    if (isStreaming) {
      if (!userHasScrolledUpRef.current) {
        scrollToBottom(false);
      }
    }
  }, [streamingToken, streamingReasoning, isStreaming]);

  // When streaming finishes, automatically scroll to bottom to reveal full response
  useEffect(() => {
    if (prevIsStreamingRef.current && !isStreaming) {
      userHasScrolledUpRef.current = false;
      setShowJumpToBottom(false);
      scrollToBottom(true);
    }
    prevIsStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    if (!userHasScrolledUpRef.current) {
      scrollToBottom(true);
    }
  }, [activeConversation?.messages?.length]);

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  const toggleSpeak = (id: string, text: string) => {
    if (!('speechSynthesis' in window)) {
      alert('Seu navegador não possui suporte para síntese de voz (Text-to-Speech).');
      return;
    }

    if (speakingMsgId === id) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();

    // Remove markdown code fences and clean formatting for audio narration
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'Bloco de dados técnicos.')
      .replace(/[*_#`~\[\]\(\)]/g, '')
      .replace(/\|/g, ' ')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.05;

    utterance.onend = () => {
      setSpeakingMsgId(null);
    };
    utterance.onerror = () => {
      setSpeakingMsgId(null);
    };

    setSpeakingMsgId(id);
    window.speechSynthesis.speak(utterance);
  };

  const handleExportPdf = (text: string, modelName?: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor, permita popups no navegador para gerar o Relatório Executivo em PDF.');
      return;
    }

    const dateStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const formattedHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Oráculo SPN — Relatório Executivo</title>
          <style>
            @media print {
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 15mm 15mm; }
              .no-print { display: none; }
            }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; line-height: 1.6; max-width: 850px; margin: 30px auto; padding: 0 20px; }
            .header { border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
            .logo { font-size: 20px; font-weight: 800; color: #0369a1; letter-spacing: -0.5px; }
            .meta { font-size: 11px; color: #64748b; text-align: right; }
            .content { font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
            th { background: #f1f5f9; color: #334155; font-weight: 700; text-align: left; padding: 8px 12px; border: 1px solid #cbd5e1; }
            td { padding: 8px 12px; border: 1px solid #e2e8f0; }
            tr:nth-child(even) { background: #f8fafc; }
            pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 11px; overflow-x: auto; }
            .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">⚡ ORÁCULO SPN — RELATÓRIO EXECUTIVO</div>
              <div style="font-size: 12px; color: #475569; font-weight: 500;">Inteligência Corporativa & Analytics</div>
            </div>
            <div class="meta">
              <div><strong>Gerado em:</strong> ${dateStr}</div>
              <div><strong>Modelo de IA:</strong> ${modelName || 'Oráculo Enterprise'}</div>
            </div>
          </div>
          <div class="content">
            ${text
              .replace(/\n\n/g, '<br/><br/>')
              .replace(/\n/g, '<br/>')
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>')}
          </div>
          <div class="footer">
            Documento confidencial gerado pelo Oráculo SPN.
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(formattedHtml);
    printWindow.document.close();
  };

  const handleShareMessage = (id: string, text: string) => {
    const shareText = `*Resposta do Oráculo SPN:*\n\n${text}`;
    if (navigator.share) {
      navigator.share({ title: 'Resposta do Oráculo SPN', text: shareText }).catch(() => {
        navigator.clipboard.writeText(shareText);
      });
    } else {
      navigator.clipboard.writeText(shareText);
    }
    setSharedId(id);
    setTimeout(() => setSharedId(null), 2000);
  };

  const toggleReasoning = (id: string) => {
    setShowReasoningId((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleFeedback = async (msgId: string, rating: 'LIKE' | 'DISLIKE') => {
    await sendFeedbackApi(msgId, rating, clientId);
  };

  if (!activeConversation || activeConversation.messages.length === 0) {
    return null;
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 max-w-[1280px] mx-auto w-full animate-fade-in relative"
    >
      {activeConversation.messages.map((m, msgIdx) => {
        const isUser = m.role === 'user';
        const isReasoningOpen = showReasoningId[m.id];
        const reasoningText = m.generation?.reasoning_content;
        const isLatestMsg = msgIdx === activeConversation.messages.length - 1;
        const isScanningImage = isStreaming && isUser && isLatestMsg;

        return (
          <div key={m.id} className={`flex gap-3.5 group ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* Avatar */}
            {isUser ? (
              <div
                className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-600 via-rose-600 to-indigo-600 p-[1px] shrink-0 shadow-lg mt-0.5"
                title={m.client_name || 'Usuário'}
              >
                <div className="w-full h-full bg-[#1e2029] rounded-full flex items-center justify-center font-bold text-xs text-white uppercase tracking-wider">
                  {getUserInitials(m.client_name)}
                </div>
              </div>
            ) : (
              <div className="w-9 h-9 rounded-2xl bg-[#141722] border border-cyan-500/30 flex items-center justify-center p-1 shrink-0 shadow-lg shadow-cyan-500/10 mt-0.5 relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-blue-600/10 to-transparent opacity-60" />
                <img src="/icon.png" alt="Oráculo SPN" className="w-full h-full object-contain relative z-10 transition-transform duration-300 group-hover:scale-110" />
              </div>
            )}

            {/* Bubble & Controls Wrapper */}
            <div className={`flex items-start gap-2.5 max-w-[96%] sm:max-w-[94%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              <div
                className={`p-5 sm:p-6 rounded-2xl sm:rounded-3xl text-sm leading-relaxed shadow-xl border w-full select-text cursor-text ${
                  isUser
                    ? 'bg-[#282b37] text-slate-100 rounded-tr-xs border-white/[0.08]'
                    : 'bg-[#171822] text-slate-100 rounded-tl-xs border-white/[0.08] backdrop-blur-md'
                }`}
              >
                {/* Reasoning / Thinking Box */}
                {reasoningText && (
                  <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 overflow-hidden shadow-inner select-text">
                    <button
                      onClick={() => toggleReasoning(m.id)}
                      className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-amber-300 hover:bg-amber-500/15 transition cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-amber-400" />
                        <span>Cadeia de Pensamento & Raciocínio</span>
                      </div>
                      {isReasoningOpen ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
                    </button>
                    {isReasoningOpen && (
                      <div className="p-4 border-t border-amber-500/20 text-xs text-amber-200/90 font-mono whitespace-pre-wrap leading-relaxed bg-[#0b0c12] select-text">
                        {reasoningText}
                      </div>
                    )}
                  </div>
                )}

                {/* Message Content Markdown */}
                <div className="prose-dark max-w-full overflow-x-auto break-words select-text cursor-text">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex, rehypeRaw]}
                    components={MARKDOWN_COMPONENTS}
                  >
                    {formatRawContent(m.content)}
                  </ReactMarkdown>
                </div>

                {/* Attachments */}
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mt-3.5 pt-3 border-t border-white/10 flex flex-wrap gap-2">
                    {m.attachments.map((att) => {
                      const isImage = att.mime_type.startsWith('image/');
                      return isImage ? (
                        <div
                          key={att.id}
                          className={`group relative overflow-hidden rounded-2xl border my-1 transition-all duration-300 ${
                            isScanningImage
                              ? 'border-cyan-400 ring-2 ring-cyan-500/60 shadow-xl shadow-cyan-500/25 bg-black/60 scale-[1.02]'
                              : 'border-white/10 bg-black/40'
                          }`}
                        >
                          {/* Futuristic Scanning Animation Overlay */}
                          {isScanningImage && (
                            <>
                              <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-cyan-500 via-white to-cyan-500 shadow-[0_0_15px_#38bdf8] z-30 animate-scan-laser" />
                              <div className="absolute inset-0 bg-cyan-950/30 backdrop-blur-[0.5px] pointer-events-none z-10" />
                              <div className="absolute top-2 left-2 z-30 px-3 py-1 rounded-full bg-slate-950/90 border border-cyan-400/70 backdrop-blur-md flex items-center gap-1.5 text-[10px] text-cyan-300 font-mono font-bold shadow-2xl tracking-wide animate-pulse">
                                <Scan className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                                <span>ANALISANDO VISÃO...</span>
                              </div>
                            </>
                          )}

                          <img
                            src={`/api/files/${att.id}/raw`}
                            alt={att.original_name}
                            className="max-w-[280px] max-h-[200px] object-cover rounded-2xl transition duration-200 group-hover:scale-105"
                          />
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2 text-[10px] text-slate-200 truncate z-20 font-mono">
                            {att.original_name}
                          </div>
                        </div>
                      ) : (
                        <div key={att.id} className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-indigo-300 font-medium flex items-center gap-1.5">
                          <span>Anexo:</span>
                          <span className="font-semibold text-slate-200">{att.original_name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Minimalist Metadata Footer (for Assistant responses) */}
                {!isUser && <MessageMetadataFooter generation={m.generation} model={m.model || selectedModel} />}
              </div>

              {/* Action Toolbar on side of Assistant message */}
              {!isUser && (
                <div className="flex flex-col gap-1 pt-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => handleFeedback(m.id, 'LIKE')}
                    className="p-2 text-slate-400 hover:text-slate-100 hover:bg-white/10 rounded-xl transition cursor-pointer"
                    title="Gostei da resposta"
                  >
                    <ThumbsUp className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleFeedback(m.id, 'DISLIKE')}
                    className="p-2 text-slate-400 hover:text-slate-100 hover:bg-white/10 rounded-xl transition cursor-pointer"
                    title="Não gostei da resposta"
                  >
                    <ThumbsDown className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => toggleSpeak(m.id, m.content)}
                    className={`p-2 rounded-xl transition cursor-pointer ${
                      speakingMsgId === m.id
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-md animate-pulse'
                        : 'text-slate-400 hover:text-cyan-300 hover:bg-white/10'
                    }`}
                    title={speakingMsgId === m.id ? 'Parar narração de voz' : 'Ouvir resposta (Voz sintetizada)'}
                  >
                    {speakingMsgId === m.id ? <VolumeX className="w-4 h-4 text-cyan-300" /> : <Volume2 className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => handleExportPdf(m.content, m.model || selectedModel)}
                    className="p-2 text-slate-400 hover:text-emerald-300 hover:bg-white/10 rounded-xl transition cursor-pointer"
                    title="Exportar Relatório Executivo (PDF / Impressão)"
                  >
                    <FileText className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() =>
                      setPresentationContent({
                        isOpen: true,
                        text: m.content,
                        title: `Apresentação Executiva • ${formatModelCleanName(m.model || selectedModel)}`,
                      })
                    }
                    className="p-2 text-slate-400 hover:text-cyan-300 hover:bg-white/10 rounded-xl transition cursor-pointer"
                    title="Modo Apresentação (Slides Executivos para Reuniões)"
                  >
                    <Tv className="w-4 h-4 text-cyan-400" />
                  </button>

                  <button
                    onClick={() => handleCopyMessage(m.id, m.content)}
                    className="p-2 text-slate-400 hover:text-slate-100 hover:bg-white/10 rounded-xl transition cursor-pointer"
                    title="Copiar texto da resposta"
                  >
                    {copiedId === m.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => handleShareMessage(m.id, m.content)}
                    className="p-2 text-slate-400 hover:text-slate-100 hover:bg-white/10 rounded-xl transition cursor-pointer"
                    title="Compartilhar resposta"
                  >
                    {sharedId === m.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => regenerateLastMessage()}
                    disabled={isStreaming}
                    className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-white/10 rounded-xl transition cursor-pointer disabled:opacity-50"
                    title="Tentar novamente / Regenerar resposta"
                  >
                    <RotateCw className={`w-4 h-4 ${isStreaming ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Real-time Streaming State with Stopwatch & Live Reasoning */}
      {isStreaming && (
        <div className="flex gap-3.5 animate-fade-in flex-row">
          <div className="w-9 h-9 rounded-2xl bg-[#141722] border border-cyan-500/30 flex items-center justify-center p-1 shrink-0 shadow-lg shadow-cyan-500/10 mt-0.5 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-blue-600/10 to-transparent opacity-60" />
            <img src="/icon.png" alt="Oráculo SPN" className="w-full h-full object-contain relative z-10 transition-transform duration-300 group-hover:scale-110" />
          </div>

          <div className="flex flex-col gap-2 max-w-[96%] sm:max-w-[94%] w-full">
            <div className="p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#171822] text-slate-100 text-sm border border-indigo-500/30 shadow-2xl backdrop-blur-md space-y-3">
              {/* Real-time Streaming Thinking Box */}
              {(() => {
                const lastMsg = activeConversation?.messages[activeConversation.messages.length - 1];
                const hasImageAttachment = lastMsg?.role === 'user' && lastMsg.attachments?.some((a) => a.mime_type.startsWith('image/'));

                return streamingReasoning ? (
                  <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 overflow-hidden shadow-inner">
                    <button
                      onClick={() => setIsStreamingReasoningOpen(!isStreamingReasoningOpen)}
                      className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-amber-300 hover:bg-amber-500/15 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-amber-400 animate-pulse" />
                        <span>Cadeia de Pensamento & Raciocínio {hasImageAttachment ? '(Visão Computacional)' : ''}</span>
                        <StopwatchBadge startTime={streamingStartTime} />
                      </div>
                      {isStreamingReasoningOpen ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
                    </button>
                    {isStreamingReasoningOpen && (
                      <div
                        ref={streamingReasoningRef}
                        className="p-4 border-t border-amber-500/20 text-xs text-amber-200/90 font-mono whitespace-pre-wrap leading-relaxed bg-[#0b0c12] max-h-72 sm:max-h-80 overflow-y-auto scroll-smooth"
                      >
                        {streamingReasoning}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Initial loading status before reasoning/tokens arrive */
                  <div className="flex items-center gap-3 text-xs font-semibold text-slate-200 py-1">
                    {hasImageAttachment ? (
                      <>
                        <Scan className="w-4 h-4 text-cyan-400 animate-spin" />
                        <span className="text-cyan-300">Escaneando visão da imagem & sintetizando raciocínio...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                        <span>Sintetizando e raciocinando resposta...</span>
                      </>
                    )}
                    <StopwatchBadge startTime={streamingStartTime} />
                  </div>
                );
              })()}

              {/* Streaming Content Markdown */}
              {streamingToken && (
                <div className="prose-dark max-w-full overflow-x-auto break-words pt-1 select-text cursor-text">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex, rehypeRaw]}
                    components={MARKDOWN_COMPONENTS}
                  >
                    {formatRawContent(streamingToken)}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showJumpToBottom && isStreaming && (
        <button
          onClick={() => {
            userHasScrolledUpRef.current = false;
            setShowJumpToBottom(false);
            scrollToBottom(true);
          }}
          className="sticky bottom-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-full text-xs font-bold shadow-2xl border border-indigo-400/40 backdrop-blur-md flex items-center gap-2 animate-bounce cursor-pointer mx-auto"
          title="Rolar para a resposta ao vivo"
        >
          <ChevronDown className="w-4 h-4 text-cyan-300" />
          <span>Ir para a resposta ao vivo...</span>
        </button>
      )}

      <div ref={messagesEndRef} />

      {/* Modal de Apresentação Executiva em Tela Cheia */}
      <ExecutivePresentationModal
        isOpen={presentationContent.isOpen}
        onClose={() => setPresentationContent((prev) => ({ ...prev, isOpen: false }))}
        rawMarkdown={presentationContent.text}
        title={presentationContent.title}
      />
    </div>
  );
};


