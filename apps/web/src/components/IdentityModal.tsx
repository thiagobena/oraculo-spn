import React, { useState } from 'react';
import { useChatStore } from '../store/useChatStore';
import { User, ShieldCheck } from 'lucide-react';

export const IdentityModal: React.FC = () => {
  const { clientName, setIdentity } = useChatStore();
  const [inputName, setInputName] = useState('');

  if (!clientName || !clientName.trim()) {
    setIdentity('Usuário Local');
    return null;
  }

  return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputName.trim()) {
      setIdentity(inputName.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl p-4 animate-fade-in">
      <div className="w-full max-w-md bg-[#101422]/95 border border-white/10 rounded-2xl p-6 shadow-2xl space-y-6 backdrop-blur-2xl relative overflow-hidden">
        <div className="w-[300px] h-[200px] bg-gradient-to-tr from-indigo-600/20 to-cyan-500/20 rounded-full blur-[80px] absolute -top-20 -right-20 -z-10 pointer-events-none" />

        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-gradient-to-tr from-indigo-500/20 to-cyan-500/20 text-indigo-400 rounded-2xl border border-indigo-500/30 shadow-lg shadow-indigo-500/10">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-brand text-xl font-extrabold text-slate-100 tracking-tight">Bem-vindo ao ORÁCULO SPN</h2>
            <p className="text-xs text-slate-400">Identificação para auditoria interna de acessos</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">
              Como devemos identificar você?
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder="Ex: Thiago, Bruno, Admin..."
                required
                className="w-full pl-10 pr-4 py-2.5 bg-[#08090e] border border-white/10 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition font-sans"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-xs rounded-xl shadow-xl shadow-indigo-600/25 border border-indigo-400/30 transition-all duration-200 active:scale-[0.98]"
          >
            Continuar para a Plataforma
          </button>
        </form>

        <p className="text-[11px] text-slate-500 text-center font-normal">
          Seu nome será associado ao histórico de conversas e registros de auditoria corporativa.
        </p>
      </div>
    </div>
  );
};
