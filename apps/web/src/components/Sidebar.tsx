import React, { useEffect, useState } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Search,
  Info,
  Plus,
  Heart,
  Folder,
  Settings,
  HelpCircle,
  Pin,
  Trash2,
  ChevronLeft,
  ChevronRight,
  LogOut,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { deleteConversationApi, updateConversationApi } from '../services/api';

export const Sidebar: React.FC = () => {
  const {
    clientId,
    clientName,
    isSidebarOpen,
    toggleSidebar,
    searchQuery,
    setSearchQuery,
    conversations,
    activeConversation,
    loadConversations,
    selectConversation,
    startNewChat,
  } = useChatStore();

  const { user, isAdmin, logout } = useAuthStore();

  const [isMinimized, setIsMinimized] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (location.pathname === '/telemetry' || location.pathname === '/admin') {
      setIsMinimized(true);
    } else {
      setIsMinimized(false);
    }
  }, [location.pathname]);

  const pinnedConversations = conversations.filter((c) => c.pinned);

  const handleNewChat = () => {
    startNewChat();
    if (location.pathname !== '/') {
      navigate('/');
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Deseja realmente excluir esta conversa?')) {
      await deleteConversationApi(id, clientId, clientName);
      if (activeConversation?.id === id) {
        startNewChat();
      }
      loadConversations();
    }
  };

  const handleTogglePin = async (e: React.MouseEvent, id: string, currentPinned: boolean) => {
    e.stopPropagation();
    await updateConversationApi(id, { pinned: !currentPinned });
    loadConversations();
  };

  if (!isSidebarOpen) {
    return null;
  }

  return (
    <aside
      className={`${
        isMinimized ? 'w-16 sm:w-20' : 'w-64 sm:w-72'
      } bg-[#17181f] border-r border-white/[0.06] flex flex-col h-full select-none transition-all duration-300 relative z-30 shrink-0`}
    >
      {/* Sidebar Top Header */}
      <div className={`p-4 sm:p-5 flex items-center ${isMinimized ? 'justify-center' : 'justify-between'}`}>
        {!isMinimized ? (
          <div className="flex items-center gap-2.5 cursor-pointer group relative" onClick={() => navigate('/')}>
            <div className="absolute -inset-1.5 bg-gradient-to-r from-indigo-500/20 via-cyan-500/20 to-amber-500/15 rounded-xl blur-lg opacity-40 group-hover:opacity-90 transition duration-500 animate-brand-glow pointer-events-none" />

            <img
              src="/logo.png"
              alt="Oráculo SPN"
              className="w-7 h-7 object-contain drop-shadow-[0_0_8px_rgba(56,189,248,0.5)] transition-transform duration-300 group-hover:scale-110"
            />

            <h1 className="relative font-brand font-extrabold text-lg sm:text-xl tracking-wider uppercase animate-brand-shimmer drop-shadow-sm select-none">
              ORÁCULO SPN
            </h1>
          </div>
        ) : (
          <div className="cursor-pointer group relative" onClick={() => navigate('/')} title="ORÁCULO SPN">
            <img
              src="/logo.png"
              alt="Oráculo SPN"
              className="w-7 h-7 object-contain drop-shadow-[0_0_8px_rgba(56,189,248,0.5)] transition-transform duration-300 group-hover:scale-110"
            />
          </div>
        )}

        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="p-2 text-slate-400 hover:text-slate-100 hover:bg-white/5 rounded-xl transition-colors"
          title={isMinimized ? 'Maximizar Menu Lateral' : 'Minimizar Menu Lateral'}
        >
          {isMinimized ? <ChevronRight className="w-4 h-4 text-indigo-400" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 sm:px-4 space-y-6 py-2">
        {/* MENU Section */}
        <div className="space-y-1">
          {!isMinimized && (
            <div className="px-3 mb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
              MENU
            </div>
          )}

          <button
            onClick={() => {
              navigate('/');
              startNewChat();
            }}
            title="Início"
            className={`w-full flex items-center ${
              isMinimized ? 'justify-center' : 'gap-3 px-3'
            } py-2.5 rounded-xl text-xs font-medium transition-all ${
              location.pathname === '/' && !activeConversation?.messages.length
                ? 'bg-white/10 text-slate-100 font-semibold shadow-sm'
                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            }`}
          >
            <Home className="w-4 h-4 shrink-0" />
            {!isMinimized && <span>Início</span>}
          </button>

          {!isMinimized ? (
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar conversas..."
                className="w-full pl-9 pr-3 py-2 bg-[#121319] border border-white/5 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition"
              />
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          ) : (
            <button
              onClick={() => setIsMinimized(false)}
              title="Buscar"
              className="w-full flex items-center justify-center py-2.5 text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] rounded-xl transition"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          {/* Sobre o Oráculo apenas para Admin */}
          {isAdmin && (
            <Link
              to="/telemetry"
              title="Sobre o Oráculo (Telemetria & IA)"
              className={`flex items-center ${
                isMinimized ? 'justify-center' : 'gap-3 px-3'
              } py-2.5 rounded-xl text-xs font-medium transition-all ${
                location.pathname === '/telemetry'
                  ? 'bg-white/10 text-slate-100 font-semibold shadow-sm'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              {!isMinimized && <span>Sobre o Oráculo</span>}
            </Link>
          )}
        </div>

        {/* PROJETOS Section */}
        <div className="space-y-1">
          {!isMinimized && (
            <div className="px-3 mb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
              PROJETOS
            </div>
          )}

          <button
            onClick={handleNewChat}
            title="Novo Projeto"
            className={`w-full flex items-center ${
              isMinimized ? 'justify-center' : 'gap-3 px-3'
            } py-2.5 rounded-xl text-xs font-medium text-slate-300 hover:bg-white/[0.04] hover:text-slate-100 transition group`}
          >
            <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-200 shrink-0 text-indigo-400" />
            {!isMinimized && <span>Novo Projeto</span>}
          </button>

          <button
            onClick={() => setSearchQuery(searchQuery === 'pinned' ? '' : 'pinned')}
            title="Favoritos"
            className={`w-full flex items-center ${
              isMinimized ? 'justify-center' : 'gap-3 px-3'
            } py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 transition`}
          >
            <Heart className="w-4 h-4 text-rose-400 shrink-0" />
            {!isMinimized && <span>Favoritos ({pinnedConversations.length})</span>}
          </button>

          {!isMinimized && (
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between px-3 text-[11px] font-semibold text-slate-400">
                <span className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-indigo-400" />
                  Biblioteca
                </span>
                <span className="text-[10px] text-slate-500 font-mono">{conversations.length}</span>
              </div>

              {/* Conversas da Biblioteca */}
              <div className="pl-3 space-y-1 max-h-40 overflow-y-auto pr-1 pt-1">
                {conversations.slice(0, 8).map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      selectConversation(c.id);
                      navigate('/');
                    }}
                    className={`group flex items-center justify-between px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                      activeConversation?.id === c.id
                        ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                    }`}
                  >
                    <span className="truncate max-w-[130px]">{c.title}</span>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                      <button
                        onClick={(e) => handleTogglePin(e, c.id, c.pinned)}
                        className="text-slate-400 hover:text-amber-400"
                        title={c.pinned ? 'Desafixar' : 'Fixar'}
                      >
                        <Pin className={`w-3 h-3 ${c.pinned ? 'fill-amber-400 text-amber-400' : ''}`} />
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, c.id)}
                        className="text-slate-400 hover:text-red-400"
                        title="Excluir"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM NAV Section */}
        <div className="pt-4 border-t border-white/[0.06] space-y-1">
          {/* Configurações visível APENAS para Administradores */}
          {isAdmin && (
            <Link
              to="/admin"
              title="Configurações"
              className={`flex items-center ${
                isMinimized ? 'justify-center' : 'gap-3 px-3'
              } py-2.5 rounded-xl text-xs font-medium transition-all ${
                location.pathname === '/admin'
                  ? 'bg-white/10 text-slate-100 font-semibold shadow-sm'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              <Settings className="w-4 h-4 text-orange-400 shrink-0" />
              {!isMinimized && <span>Configurações</span>}
            </Link>
          )}

          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            title="Central de Ajuda"
            className={`flex items-center ${
              isMinimized ? 'justify-center' : 'gap-3 px-3'
            } py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 transition`}
          >
            <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
            {!isMinimized && <span>Central de Ajuda</span>}
          </a>
        </div>

        {/* SPN Grupo Brand Logo Section */}
        <div className="pt-3 pb-1 px-3 flex items-center justify-center border-t border-white/[0.04]">
          {!isMinimized ? (
            <div className="flex items-center justify-center p-2 rounded-xl hover:bg-white/[0.02] transition group cursor-pointer" title="SPN Grupo">
              <img
                src="/spn-grupo-logo.svg"
                alt="SPN Grupo"
                className="h-7 w-auto object-contain animate-spn-logo transition-transform duration-300 group-hover:scale-105"
              />
            </div>
          ) : (
            <div className="p-1.5 rounded-lg hover:bg-white/[0.02] transition group cursor-pointer" title="SPN Grupo">
              <img
                src="/spn-grupo-logo.svg"
                alt="SPN Grupo"
                className="w-5 h-5 object-contain animate-spn-logo transition-transform duration-300 group-hover:scale-110"
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Profile Card */}
      <div className={`p-2.5 m-2.5 bg-[#111218] border border-white/[0.06] rounded-2xl flex items-center ${isMinimized ? 'justify-center' : 'justify-between'}`}>
        <div className="flex items-center gap-2.5 truncate">
          <div className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 via-orange-600 to-indigo-600 p-[1.5px] shrink-0 shadow-lg">
            <div className="w-full h-full bg-[#181920] rounded-full flex items-center justify-center font-bold text-xs text-white uppercase">
              {user?.display_name ? user.display_name.slice(0, 2) : 'AD'}
            </div>
          </div>
          {!isMinimized && (
            <div className="truncate">
              <p className="text-xs font-bold text-slate-100 truncate">{user?.display_name || user?.username || 'Usuário AD'}</p>
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                {isAdmin ? (
                  <span className="flex items-center gap-1 text-orange-400 font-medium">
                    <ShieldCheck className="w-3 h-3" /> Admin
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-slate-400">
                    <UserCheck className="w-3 h-3" /> Usuário
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {!isMinimized && (
          <button
            onClick={logout}
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
            title="Sair da Conta (Logout)"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
};



