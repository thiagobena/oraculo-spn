import React, { useState, useEffect } from 'react';
import { useChatStore } from '../store/useChatStore';
import { updateConversationApi } from '../services/api';
import { Download, Bot, Activity, Check } from 'lucide-react';

export const ChatHeader: React.FC = () => {
  const {
    activeConversation,
    isLmStudioOnline,
    isDbOnline,
    checkSystemHealth,
    selectedAssistant,
    loadConversations,
  } = useChatStore();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleText, setTitleText] = useState('');
  const [showHealthPopover, setShowHealthPopover] = useState(false);

  useEffect(() => {
    if (activeConversation) {
      setTitleText(activeConversation.title);
    } else {
      setTitleText('Novo Chat');
    }
  }, [activeConversation]);

  useEffect(() => {
    checkSystemHealth();
    const interval = setInterval(checkSystemHealth, 8000);
    return () => clearInterval(interval);
  }, [checkSystemHealth]);

  const handleTitleSubmit = async () => {
    if (activeConversation && titleText.trim() && titleText !== activeConversation.title) {
      await updateConversationApi(activeConversation.id, { title: titleText.trim() });
      loadConversations();
    }
    setIsEditingTitle(false);
  };

  const handleExportMarkdown = () => {
    if (!activeConversation) return;
    const content = activeConversation.messages
      .map(
        (m) =>
          `### ${m.role === 'user' ? 'Pergunta' : 'Resposta da IA'}\n*Modelo: ${m.model} | Date: ${m.created_at}*\n\n${m.content}\n\n---\n`
      )
      .join('\n');

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeConversation.title.toLowerCase().replace(/\s+/g, '_')}.md`;
    a.click();
  };

  return (
    <header className="h-16 border-b border-white/5 bg-[#08090e]/85 backdrop-blur-xl px-6 flex items-center justify-between shrink-0 select-none relative z-20">
      <div className="flex items-center gap-3">
        {isEditingTitle ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={titleText}
              onChange={(e) => setTitleText(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
              autoFocus
              className="bg-[#101422] border border-indigo-500 rounded-lg px-3 py-1 text-sm text-slate-100 focus:outline-none shadow-lg shadow-indigo-500/20"
            />
            <button onClick={handleTitleSubmit} className="text-emerald-400 p-1.5 hover:bg-white/5 rounded-lg transition">
              <Check className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <img src="/icon.png" alt="Oráculo SPN" className="w-5 h-5 object-contain drop-shadow-sm" />
            <h2
              onDoubleClick={() => setIsEditingTitle(true)}
              className="text-sm font-bold text-slate-100 hover:text-indigo-400 transition-colors cursor-pointer flex items-center gap-2"
              title="Duplo clique para renomear conversa"
            >
              <span>{activeConversation ? activeConversation.title : 'Novo Chat'}</span>
              <span className="text-[10px] text-slate-500 font-mono font-normal"># {activeConversation ? activeConversation.id.slice(0, 8) : 'draft'}</span>
            </h2>
          </div>
        )}

        {selectedAssistant && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-300">
            <Bot className="w-3.5 h-3.5 text-indigo-400" />
            <span>{selectedAssistant.name}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setShowHealthPopover(!showHealthPopover)}
            className={`flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all duration-200 ${
              isLmStudioOnline && isDbOnline
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 shadow-sm shadow-emerald-500/10'
                : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isLmStudioOnline && isDbOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isLmStudioOnline && isDbOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
            </span>
            <span>{isLmStudioOnline && isDbOnline ? 'IA Online' : 'Servidor Indisponível'}</span>
          </button>

          {showHealthPopover && (
            <div className="absolute right-0 mt-3 w-72 bg-[#101422] border border-white/10 rounded-2xl shadow-2xl p-4 space-y-3 z-50 text-xs backdrop-blur-xl animate-fade-in">
              <div className="flex items-center justify-between border-b border-white/5 pb-2 font-bold text-slate-100">
                <span>Status da Infraestrutura</span>
                <Activity className="w-4 h-4 text-indigo-400" />
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="text-slate-400 font-medium">LM Studio Local</span>
                  <span
                    className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded ${
                      isLmStudioOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}
                  >
                    {isLmStudioOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="text-slate-400 font-medium">SQL Server Database</span>
                  <span
                    className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded ${
                      isDbOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}
                  >
                    {isDbOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-white/5 text-[10px] text-slate-500 font-mono flex items-center justify-between">
                <span>Monitoramento Ativo</span>
                <span>Intervalo: 8s</span>
              </div>
            </div>
          )}
        </div>

        {activeConversation && activeConversation.messages.length > 0 && (
          <button
            onClick={handleExportMarkdown}
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 transition-all"
            title="Exportar conversa em Markdown"
          >
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
