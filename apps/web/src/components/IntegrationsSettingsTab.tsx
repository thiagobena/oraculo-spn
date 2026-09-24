import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Check,
  AlertCircle,
  Loader2,
  PhoneCall,
  Bot,
  Globe,
  Copy,
  TrendingDown,
  Wrench,
  ShieldCheck,
  Sliders,
  Sparkles,
} from 'lucide-react';

interface MessagingConfig {
  whatsapp_enabled: boolean;
  whatsapp_api_url?: string;
  whatsapp_instance?: string;
  whatsapp_api_key?: string;
  telegram_enabled: boolean;
  telegram_bot_token?: string;
  telegram_default_chat_id?: string;
  competitor_enabled?: boolean;
  competitor_targets?: string;
  competitor_alert_threshold?: number;
  competitor_frequency?: string;
  glpi_autoresolve_enabled?: boolean;
  glpi_autoclose_tickets?: boolean;
  glpi_bot_signature?: string;
}

export const IntegrationsSettingsTab: React.FC<{ token: string }> = ({ token }) => {
  const [config, setConfig] = useState<MessagingConfig>({
    whatsapp_enabled: false,
    whatsapp_api_url: '',
    whatsapp_instance: 'oraculo-spn',
    whatsapp_api_key: '',
    telegram_enabled: false,
    telegram_bot_token: '',
    telegram_default_chat_id: '',
    competitor_enabled: false,
    competitor_targets: 'Panvel, RaiaDrogasil, PagueMenos, Nissei',
    competitor_alert_threshold: 5,
    competitor_frequency: 'Diário às 06:00',
    glpi_autoresolve_enabled: true,
    glpi_autoclose_tickets: false,
    glpi_bot_signature: '🤖 Oráculo IA • Resolução Autônoma Nível 1',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingChannel, setTestingChannel] = useState<'whatsapp' | 'telegram' | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [recipientNumber, setRecipientNumber] = useState('');
  const [recipientChatId, setRecipientChatId] = useState('');

  const webhookUrl = `${window.location.origin}/api/messaging/webhook`;

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/messaging/config', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.config) {
        setConfig(data.config);
      }
    } catch (err: any) {
      console.error('Erro ao carregar configurações de integrações:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/messaging/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'success', message: 'Todas as configurações foram salvas com sucesso!' });
        setTimeout(() => setFeedback(null), 3500);
      } else {
        setFeedback({ type: 'error', message: data.error || 'Erro ao salvar configurações.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTestMessage = async (channel: 'whatsapp' | 'telegram') => {
    setTestingChannel(channel);
    setFeedback(null);
    try {
      const recipient = channel === 'whatsapp' ? recipientNumber : recipientChatId;
      const res = await fetch('/api/messaging/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channel,
          recipient,
          message: `⚡ Teste de conexão corporativa Oráculo SPN via ${channel.toUpperCase()}`,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'success', message: data.message || `Teste enviado com sucesso via ${channel}!` });
      } else {
        setFeedback({ type: 'error', message: data.error || `Falha no envio para ${channel}.` });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setTestingChannel(null);
    }
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Carregando configurações de integrações...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-cyan-400" />
            Integrações, Mensageria & Automações
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Conecte o Oráculo ao WhatsApp, Telegram, monitores de preços concorrentes e habilite diagnósticos autônomos de chamados GLPI Nível 1.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold transition shadow-lg shadow-cyan-950/40 cursor-pointer disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          <span>Salvar Alterações</span>
        </button>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Grid 1: WhatsApp e Telegram */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CARD 1: WHATSAPP */}
        <div className="rounded-2xl border border-[#1e2333] bg-[#0d101a] p-5 shadow-xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#181d2c]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-100">WhatsApp Corporativo</h3>
                <p className="text-[11px] text-slate-400">Evolution API / Z-API / Baileys Gateway</p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.whatsapp_enabled}
                onChange={(e) => setConfig({ ...config, whatsapp_enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">URL da API WhatsApp (Endpoint)</label>
              <input
                type="text"
                placeholder="Ex: http://192.168.254.200:8080 ou https://api.whatsapp.empresa.com"
                value={config.whatsapp_api_url || ''}
                onChange={(e) => setConfig({ ...config, whatsapp_api_url: e.target.value })}
                className="w-full bg-[#131724] border border-[#232a3d] focus:border-emerald-500 rounded-xl px-3 py-2 text-slate-200 outline-none transition"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Nome da Instância</label>
                <input
                  type="text"
                  placeholder="oraculo-spn"
                  value={config.whatsapp_instance || ''}
                  onChange={(e) => setConfig({ ...config, whatsapp_instance: e.target.value })}
                  className="w-full bg-[#131724] border border-[#232a3d] focus:border-emerald-500 rounded-xl px-3 py-2 text-slate-200 outline-none transition"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">API Key / Token</label>
                <input
                  type="password"
                  placeholder="Bearer Token"
                  value={config.whatsapp_api_key || ''}
                  onChange={(e) => setConfig({ ...config, whatsapp_api_key: e.target.value })}
                  className="w-full bg-[#131724] border border-[#232a3d] focus:border-emerald-500 rounded-xl px-3 py-2 text-slate-200 outline-none transition"
                />
              </div>
            </div>

            {/* Teste WhatsApp */}
            <div className="pt-2 border-t border-[#181d2c] flex items-center gap-2">
              <input
                type="text"
                placeholder="Número (Ex: 5541999998888)"
                value={recipientNumber}
                onChange={(e) => setRecipientNumber(e.target.value)}
                className="w-full bg-[#131724] border border-[#232a3d] focus:border-emerald-500 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none"
              />
              <button
                type="button"
                onClick={() => handleTestMessage('whatsapp')}
                disabled={testingChannel === 'whatsapp' || !config.whatsapp_api_url}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl font-medium transition cursor-pointer disabled:opacity-40"
              >
                {testingChannel === 'whatsapp' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Testar</span>
              </button>
            </div>
          </div>
        </div>

        {/* CARD 2: TELEGRAM */}
        <div className="rounded-2xl border border-[#1e2333] bg-[#0d101a] p-5 shadow-xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#181d2c]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-100">Bot do Telegram</h3>
                <p className="text-[11px] text-slate-400">Telegram Bot API (@BotFather)</p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.telegram_enabled}
                onChange={(e) => setConfig({ ...config, telegram_enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
            </label>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Bot Token (HTTP API Token)</label>
              <input
                type="password"
                placeholder="Ex: 7123456789:AAFn8x9K..."
                value={config.telegram_bot_token || ''}
                onChange={(e) => setConfig({ ...config, telegram_bot_token: e.target.value })}
                className="w-full bg-[#131724] border border-[#232a3d] focus:border-cyan-500 rounded-xl px-3 py-2 text-slate-200 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Chat ID Padrão / ID do Grupo</label>
              <input
                type="text"
                placeholder="Ex: -1001234567890 ou 123456789"
                value={config.telegram_default_chat_id || ''}
                onChange={(e) => setConfig({ ...config, telegram_default_chat_id: e.target.value })}
                className="w-full bg-[#131724] border border-[#232a3d] focus:border-cyan-500 rounded-xl px-3 py-2 text-slate-200 outline-none transition"
              />
            </div>

            {/* Teste Telegram */}
            <div className="pt-2 border-t border-[#181d2c] flex items-center gap-2">
              <input
                type="text"
                placeholder="Chat ID de teste (Opcional)"
                value={recipientChatId}
                onChange={(e) => setRecipientChatId(e.target.value)}
                className="w-full bg-[#131724] border border-[#232a3d] focus:border-cyan-500 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none"
              />
              <button
                type="button"
                onClick={() => handleTestMessage('telegram')}
                disabled={testingChannel === 'telegram' || !config.telegram_bot_token}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 rounded-xl font-medium transition cursor-pointer disabled:opacity-40"
              >
                {testingChannel === 'telegram' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Testar</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Grid 2: Monitor de Preços Concorrentes e Auto-Resolução GLPI */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CARD 3: MONITOR DE CONCORRÊNCIA */}
        <div className="rounded-2xl border border-[#1e2333] bg-[#0d101a] p-5 shadow-xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#181d2c]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <TrendingDown className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-100">Monitor de Concorrência & Preços</h3>
                <p className="text-[11px] text-slate-400">Benchmarking automatizado de mercado farma</p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.competitor_enabled || false}
                onChange={(e) => setConfig({ ...config, competitor_enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Redes de Farmácias Monitoradas</label>
              <input
                type="text"
                placeholder="Ex: Panvel, RaiaDrogasil, PagueMenos, Nissei, São João"
                value={config.competitor_targets || ''}
                onChange={(e) => setConfig({ ...config, competitor_targets: e.target.value })}
                className="w-full bg-[#131724] border border-[#232a3d] focus:border-amber-500 rounded-xl px-3 py-2 text-slate-200 outline-none transition"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Gatilho de Alerta de Margem (%)</label>
                <input
                  type="number"
                  placeholder="5"
                  value={config.competitor_alert_threshold ?? 5}
                  onChange={(e) => setConfig({ ...config, competitor_alert_threshold: Number(e.target.value) })}
                  className="w-full bg-[#131724] border border-[#232a3d] focus:border-amber-500 rounded-xl px-3 py-2 text-slate-200 outline-none transition"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">Frequência de Varredura</label>
                <select
                  value={config.competitor_frequency || 'Diário às 06:00'}
                  onChange={(e) => setConfig({ ...config, competitor_frequency: e.target.value })}
                  className="w-full bg-[#131724] border border-[#232a3d] focus:border-amber-500 rounded-xl px-3 py-2 text-slate-200 outline-none transition cursor-pointer"
                >
                  <option value="A cada 6 horas">A cada 6 horas</option>
                  <option value="Diário às 06:00">Diário às 06:00 (Recomendado)</option>
                  <option value="Semanal (Segundas)">Semanal (Segundas-feiras)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 4: GLPI AUTO-RESOLUÇÃO NÍVEL 1 */}
        <div className="rounded-2xl border border-[#1e2333] bg-[#0d101a] p-5 shadow-xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#181d2c]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-100">Auto-Resolução GLPI (Nível 1)</h3>
                <p className="text-[11px] text-slate-400">Diagnóstico e resolução instantânea de chamados técnicos</p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.glpi_autoresolve_enabled ?? true}
                onChange={(e) => setConfig({ ...config, glpi_autoresolve_enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
            </label>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Assinatura do Bot nos Chamados</label>
              <input
                type="text"
                placeholder="🤖 Oráculo IA • Resolução Autônoma Nível 1"
                value={config.glpi_bot_signature || ''}
                onChange={(e) => setConfig({ ...config, glpi_bot_signature: e.target.value })}
                className="w-full bg-[#131724] border border-[#232a3d] focus:border-purple-500 rounded-xl px-3 py-2 text-slate-200 outline-none transition"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-[#131724] border border-[#232a3d]">
              <div>
                <span className="font-medium text-slate-200 block">Fechar chamados resolvidos com sucesso</span>
                <span className="text-[11px] text-slate-400">Muda o status do ticket para "Solucionado" no GLPI</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.glpi_autoclose_tickets || false}
                  onChange={(e) => setConfig({ ...config, glpi_autoclose_tickets: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-500"></div>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Webhook Endpoint Inbound Card */}
      <div className="rounded-2xl border border-[#1e2333] bg-[#0d101a] p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-400" />
            <h4 className="font-semibold text-xs text-slate-200">URL de Webhook para Recebimento de Mensagens (Inbound)</h4>
          </div>
          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono">
            POST /api/messaging/webhook
          </span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Configure este endereço no painel do seu provedor de WhatsApp (Evolution API / Z-API) ou configure o Webhook do Telegram para que o Oráculo receba perguntas e responda diretamente pelo canal.
        </p>
        <div className="flex items-center gap-2 bg-[#131724] p-2.5 rounded-xl border border-[#232a3d]">
          <code className="text-xs font-mono text-cyan-300 truncate flex-1 select-all">{webhookUrl}</code>
          <button
            onClick={copyWebhook}
            className="flex items-center gap-1 px-3 py-1 bg-white/5 hover:bg-white/10 text-slate-200 rounded-lg text-xs font-medium transition cursor-pointer shrink-0"
          >
            {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedWebhook ? 'Copiado!' : 'Copiar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
