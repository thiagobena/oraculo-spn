import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
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
} from 'lucide-react';

interface CodeBlockProps {
  language?: string;
  children: string;
}

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
    <div className="my-3 rounded-2xl border border-white/10 bg-[#0d0e14] overflow-hidden text-xs shadow-2xl">
      <div className="flex items-center justify-between px-4 py-2 bg-[#161822] border-b border-white/5 text-slate-400 font-mono text-[11px]">
        <span className="text-indigo-400 font-semibold">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 hover:text-slate-100 transition px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copiado!' : 'Copiar'}</span>
        </button>
      </div>
      <pre className="p-4 overflow-x-auto font-mono text-slate-200 leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
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
  const {
    clientId,
    activeConversation,
    isStreaming,
    streamingToken,
    streamingReasoning,
    streamingStartTime,
    selectedModel,
    regenerateLastMessage,
  } = useChatStore();

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(null);
  const [showReasoningId, setShowReasoningId] = useState<Record<string, boolean>>({});
  const [isStreamingReasoningOpen, setIsStreamingReasoningOpen] = useState(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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
                className={`p-5 sm:p-6 rounded-2xl sm:rounded-3xl text-sm leading-relaxed shadow-xl border w-full ${
                  isUser
                    ? 'bg-[#282b37] text-slate-100 rounded-tr-xs border-white/[0.08]'
                    : 'bg-[#171822] text-slate-100 rounded-tl-xs border-white/[0.08] backdrop-blur-md'
                }`}
              >
                {/* Reasoning / Thinking Box */}
                {reasoningText && (
                  <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 overflow-hidden shadow-inner">
                    <button
                      onClick={() => toggleReasoning(m.id)}
                      className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-amber-300 hover:bg-amber-500/15 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-amber-400" />
                        <span>Cadeia de Pensamento & Raciocínio</span>
                      </div>
                      {isReasoningOpen ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
                    </button>
                    {isReasoningOpen && (
                      <div className="p-4 border-t border-amber-500/20 text-xs text-amber-200/90 font-mono whitespace-pre-wrap leading-relaxed bg-[#0b0c12]">
                        {reasoningText}
                      </div>
                    )}
                  </div>
                )}

                {/* Message Content Markdown */}
                <div className="prose-dark max-w-full overflow-x-auto break-words">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex, rehypeRaw]}
                    components={{
                      table({ children }) {
                        return (
                          <div className="overflow-x-auto max-w-full my-3 rounded-xl border border-white/10 bg-[#0d0e14]/60 p-1 shadow-inner">
                            <table className="min-w-full text-xs text-left border-collapse">{children}</table>
                          </div>
                        );
                      },
                      code({ node, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const codeText = String(children).replace(/\n$/, '');
                        return match ? (
                          <CodeBlock language={match[1]}>{codeText}</CodeBlock>
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      },
                    }}
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
                      <div className="p-4 border-t border-amber-500/20 text-xs text-amber-200/90 font-mono whitespace-pre-wrap leading-relaxed bg-[#0b0c12] max-h-64 overflow-y-auto">
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
                <div className="prose-dark max-w-full overflow-x-auto break-words pt-1">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex, rehypeRaw]}
                    components={{
                      table({ children }) {
                        return (
                          <div className="overflow-x-auto max-w-full my-3 rounded-xl border border-white/10 bg-[#0d0e14]/60 p-1 shadow-inner">
                            <table className="min-w-full text-xs text-left border-collapse">{children}</table>
                          </div>
                        );
                      },
                      code({ node, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const codeText = String(children).replace(/\n$/, '');
                        return match ? (
                          <CodeBlock language={match[1]}>{codeText}</CodeBlock>
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      },
                    }}
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
    </div>
  );
};


