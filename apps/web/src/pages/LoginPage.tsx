import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, User, KeyRound, AlertCircle, Loader2, Eye, EyeOff, Info, CheckCircle2, Search } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

interface SuggestedUser {
  username: string;
  displayName: string;
  email?: string;
}

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showHelpHint, setShowHelpHint] = useState(false);

  // Autocomplete / Intelligent User Search States
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const passwordInputRef = useRef<HTMLInputElement>(null);
  const usernameContainerRef = useRef<HTMLDivElement>(null);

  const { login, isLoading, error, clearError } = useAuthStore();

  // Debounced user search effect starting after 3 characters
  useEffect(() => {
    const cleanQuery = username.trim();
    if (cleanQuery.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/search-users?q=${encodeURIComponent(cleanQuery)}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) {
          setSuggestions(data.users);
          setShowSuggestions(data.users.length > 0);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch (err) {
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsSearching(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [username]);

  // Close suggestions overlay when clicking outside 
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (usernameContainerRef.current && !usernameContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectUserSuggestion = (user: SuggestedUser) => {
    setUsername(user.username);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    // Move cursor focus to password field
    setTimeout(() => {
      passwordInputRef.current?.focus();
    }, 50);
  };

  const handleKeyDownUsername = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < suggestions.length) {
      e.preventDefault();
      selectUserSuggestion(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setShowSuggestions(false);
    await login(username, password);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#08090e] p-4 font-sans select-none relative overflow-hidden">
      {/* Background Animated Ambient Mesh Light Auras (Enlarged & Multi-Layered Glowing Halos) */}
      <div className="absolute -top-40 -left-40 w-[1200px] h-[950px] bg-gradient-to-br from-indigo-600/30 via-cyan-500/20 to-purple-700/25 rounded-full blur-[170px] pointer-events-none animate-brand-glow-lg" />
      <div className="absolute -bottom-40 -right-40 w-[1250px] h-[1000px] bg-gradient-to-tl from-amber-500/20 via-indigo-900/35 to-cyan-500/20 rounded-full blur-[180px] pointer-events-none animate-brand-glow-alt" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-indigo-500/25 via-purple-500/20 to-cyan-400/25 rounded-full blur-[150px] pointer-events-none animate-robot-aura" />

      {/* Main Glassmorphic Login Card */}
      <div className="w-full max-w-md bg-[#12141d]/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl shadow-indigo-950/40 relative z-10 space-y-7 animate-in fade-in zoom-in-95 duration-500">

        {/* Header Branding */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative group">
            <div className="absolute -inset-3 bg-gradient-to-r from-indigo-500/40 via-cyan-400/40 to-amber-400/30 rounded-2xl blur-lg opacity-70 group-hover:opacity-100 transition duration-500 animate-brand-glow" />
            <div className="relative w-16 h-16 bg-[#181a26] border border-white/15 rounded-2xl flex items-center justify-center shadow-xl">
              <img
                src="/logo.png"
                alt="Oráculo SPN"
                className="w-10 h-10 object-contain drop-shadow-[0_0_12px_rgba(56,189,248,0.6)] animate-robot-float"
              />
            </div>
          </div>

          <div>
            <h1 className="font-brand font-extrabold text-2xl tracking-wider uppercase animate-brand-shimmer">
              ORÁCULO SPN
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-normal">
              Plataforma SPN de Inteligência Artificial
            </p>
          </div>
        </div>

        {/* Error Alert Box */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 space-y-2 text-red-300 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
              <div className="flex-1 text-xs space-y-1">
                <span className="font-bold text-red-400 block">Falha de Autenticação</span>
                <p className="text-slate-300 leading-relaxed">{error}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-red-500/15 flex items-center justify-between text-[11px] text-slate-400">
              <span>Está com dúvidas no formato de login?</span>
              <button
                type="button"
                onClick={() => setShowHelpHint(!showHelpHint)}
                className="text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-2 flex items-center gap-1"
              >
                <Info className="w-3 h-3" /> Dica de Formatos
              </button>
            </div>
          </div>
        )}

        {/* Format Help Hint Box */}
        {showHelpHint && (
          <div className="bg-indigo-500/10 border border-indigo-500/25 rounded-2xl p-3.5 text-xs text-indigo-200 space-y-1.5 animate-in fade-in duration-200">
            <p className="font-semibold text-indigo-300">Formatos aceitos para usuário do AD:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px] font-mono">
              <li><span className="text-indigo-300">thiago.bena</span> (nome de usuário simples)</li>
              <li><span className="text-indigo-300">thiago.bena@empresa.com.br</span> (UPN com domínio)</li>
              <li><span className="text-indigo-300">DOMINIO\thiago.bena</span> (Down-level format)</li>
            </ul>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5 relative" ref={usernameContainerRef}>
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Usuário da Rede (AD)</span>
              {username.trim().length >= 3 && (
                <span className="text-[10px] text-indigo-400 font-normal flex items-center gap-1">
                  {isSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                  {isSearching ? 'Buscando conta...' : 'Busca ativa'}
                </span>
              )}
            </label>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>

              <input
                type="text"
                value={username}
                onChange={(e) => {
                  clearError();
                  setUsername(e.target.value);
                  setSelectedIndex(-1);
                }}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                onKeyDown={handleKeyDownUsername}
                placeholder="ex: thiago.bena ou thiago.bena@empresa.com"
                disabled={isLoading}
                required
                autoComplete="off"
                className="w-full pl-10 pr-10 py-3 bg-[#0a0b12] border border-white/10 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/50 transition disabled:opacity-50 font-sans"
              />

              {isSearching && (
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-indigo-400 pointer-events-none">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              )}
            </div>

            {/* Smart Autocomplete Dropdown List */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-[#141724]/95 border border-indigo-500/30 rounded-xl shadow-2xl backdrop-blur-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200 divide-y divide-white/5">
                <div className="px-3 py-1.5 bg-indigo-950/40 text-[10px] font-semibold text-indigo-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Contas Encontradas</span>
                  <span>Clique ou Tab/Enter</span>
                </div>

                {suggestions.map((u, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <button
                      key={u.username}
                      type="button"
                      onClick={() => selectUserSuggestion(u)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between transition-colors duration-150 ${isSelected
                          ? 'bg-indigo-600/30 text-white border-l-2 border-indigo-400'
                          : 'hover:bg-white/5 text-slate-200'
                        }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0 text-indigo-300 font-bold text-xs uppercase shadow-sm">
                          {u.displayName.charAt(0) || u.username.charAt(0)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate text-slate-100">
                            {u.displayName}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate font-mono">
                            {u.username} {u.email ? `(${u.email})` : ''}
                          </p>
                        </div>
                      </div>

                      <CheckCircle2 className={`w-4 h-4 shrink-0 transition ${isSelected ? 'text-indigo-400 opacity-100' : 'text-slate-600 opacity-0'}`} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 block">
              Senha do Active Directory
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                ref={passwordInputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  clearError();
                  setPassword(e.target.value);
                }}
                placeholder="••••••••••••"
                disabled={isLoading}
                required
                className="w-full pl-10 pr-10 py-3 bg-[#0a0b12] border border-white/10 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/50 transition disabled:opacity-50 font-sans"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !username.trim() || !password.trim()}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-[0.99] text-white font-semibold text-sm rounded-xl transition-all duration-200 shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Autenticando no Active Directory...</span>
              </>
            ) : (
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                <span>Entrar no Oráculo SPN</span>
              </span>
            )}
          </button>
        </form>

        {/* Footer Brand Logo */}
        <div className="pt-4 border-t border-white/5 flex flex-col items-center space-y-2">
          <div className="flex items-center gap-2 opacity-80 hover:opacity-100 transition">
            <img
              src="/spn-grupo-logo.svg"
              alt="SPN Grupo"
              className="h-6 w-auto object-contain animate-spn-logo"
            />
          </div>
          <span className="text-[11px] text-slate-500">
            Acesso restrito a colaboradores autorizados da rede interna.
          </span>
        </div>
      </div>
    </div>
  );
};

