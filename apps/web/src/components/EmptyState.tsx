import React from 'react';
import { useAuthStore } from '../store/useAuthStore';

export const EmptyState: React.FC = () => {
  const user = useAuthStore((state) => state.user);

  const getFirstName = (): string => {
    const rawName = user?.display_name || user?.username;
    if (!rawName) return '';
    const firstWord = rawName.trim().split(/[\s._-]+/)[0];
    if (!firstWord) return '';
    return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
  };

  const firstName = getFirstName();
  const greeting = firstName ? `Bem-vindo, ${firstName}.` : 'Bem-vindo.';

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 max-w-3xl mx-auto w-full text-center space-y-6 select-none relative z-10 my-auto">
      {/* Deep ambient dark radial aura background */}
      <div className="w-[550px] h-[320px] bg-gradient-to-tr from-cyan-900/20 via-blue-950/20 to-transparent rounded-full blur-[140px] absolute -z-10 pointer-events-none" />

      {/* Brand Robot Icon with Quantum 3D Float Animation */}
      <div className="relative group cursor-pointer animate-fade-in my-1">
        {/* Pulsing Ambient Neon Aura */}
        <div className="absolute -inset-4 bg-gradient-to-tr from-cyan-500/30 via-blue-600/30 to-indigo-500/20 rounded-full animate-robot-aura pointer-events-none" />

        {/* Floating 3D Robot Image (reduced by 25%) */}
        <img
          src="/logo.png"
          alt="Oráculo SPN Icon"
          className="relative w-[60px] h-[60px] sm:w-[72px] sm:h-[72px] object-contain animate-robot-float transition-transform duration-500 group-hover:scale-110 active:scale-95"
        />
      </div>

      {/* Two-Line Clean Animated Greeting */}
      <div className="space-y-3 max-w-3xl mx-auto">
        {/* Line 1 - Light Greeting */}
        <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-light text-slate-100 tracking-tight leading-relaxed font-sans animate-fade-in">
          {greeting}
        </h1>

        {/* Line 2 with entrance slide up & clipping-free emphasis on 'oportunidades' */}
        <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-light text-slate-100 tracking-tight leading-relaxed font-sans animate-slide-up">
          Quais{' '}
          <span className="inline-block italic font-normal text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-300 to-rose-300 animate-pulse drop-shadow-[0_0_14px_rgba(245,158,11,0.5)] pr-2 pb-0.5 mr-1.5 transition-transform hover:scale-105">
            oportunidades
          </span>
          vamos descobrir hoje?
        </h2>
      </div>
    </div>
  );
};








