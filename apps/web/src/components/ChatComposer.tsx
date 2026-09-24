import React, { useState, useRef } from 'react';
import { useChatStore } from '../store/useChatStore';
import { ModelSelector } from './ModelSelector';
import { AgentSelectorPopover } from './AgentSelectorPopover';
import { ModeFilterPopover } from './ModeFilterPopover';
import { uploadFileApi } from '../services/api';
import {
  Paperclip,
  ArrowUp,
  Square,
  Mic,
  X,
  FileText,
  Image as ImageIcon,
  AtSign,
  SlidersHorizontal,
  Loader2,
  Upload,
  Bot,
} from 'lucide-react';

interface AttachmentItem {
  id: string;
  name: string;
  type: string;
  url?: string;
}

export const ChatComposer: React.FC = () => {
  const {
    clientId,
    clientName,
    activeConversation,
    sendMessage,
    isStreaming,
    stopGeneration,
    selectedAssistant,
    setSelectedAssistant,
  } = useChatStore();

  const [inputContent, setInputContent] = useState('');
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [isAgentPopoverOpen, setIsAgentPopoverOpen] = useState(false);
  const [isModeFilterPopoverOpen, setIsModeFilterPopoverOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const toggleVoiceRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Seu navegador não possui suporte para reconhecimento de voz. Recomendamos o uso do Google Chrome ou Edge.');
      return;
    }

    if (isRecording) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
      setIsRecording(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsRecording(true);
      };

      recognition.onresult = (event: any) => {
        if (event.results && event.results.length > 0) {
          const transcript = event.results[0][0].transcript;
          if (transcript) {
            setInputContent((prev) => (prev ? `${prev} ${transcript}` : transcript));
            if (textareaRef.current) {
              setTimeout(() => {
                if (textareaRef.current) {
                  textareaRef.current.style.height = 'auto';
                  textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 220)}px`;
                  textareaRef.current.focus();
                }
              }, 50);
            }
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e: any) {
      console.error('Falha ao iniciar microfone:', e);
      setIsRecording(false);
    }
  };

  const processFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      try {
        const att = await uploadFileApi(file, clientId, clientName, activeConversation?.id);
        if (att) {
          setAttachments((prev) => [
            ...prev,
            {
              id: att.id,
              name: att.original_name,
              type: att.mime_type,
              url: previewUrl || `/api/files/${att.id}/raw`,
            },
          ]);
        }
      } catch (err: any) {
        alert(`Erro ao anexar arquivo ${file.name}: ${err.message}`);
      }
    }
    setIsUploading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if ((!inputContent.trim() && attachments.length === 0) || isStreaming || isUploading) return;
    const attachmentIds = attachments.map((a) => a.id);
    const tagPrefix = activeTags.length > 0 ? `[Estilo: ${activeTags.join(', ')}] ` : '';
    sendMessage(tagPrefix + inputContent, attachmentIds, attachments);
    setInputContent('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const filesToUpload: File[] = [];

    if (clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        filesToUpload.push(clipboardData.files[i]);
      }
    } else if (clipboardData.items && clipboardData.items.length > 0) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            const ext = file.type.split('/')[1] || 'png';
            const defaultName = file.type.startsWith('image/')
              ? `imagem-${Date.now()}.${ext}`
              : `arquivo-${Date.now()}`;
            const fileName = file.name && file.name !== 'image.png' ? file.name : defaultName;
            const renamedFile = new File([file], fileName, { type: file.type });
            filesToUpload.push(renamedFile);
          }
        }
      }
    }

    if (filesToUpload.length > 0) {
      e.preventDefault();
      await processFiles(filesToUpload);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const item = prev.find((a) => a.id === id);
      if (item?.url && item.url.startsWith('blob:')) {
        URL.revokeObjectURL(item.url);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  const removeTag = (tag: string) => {
    setActiveTags((prev) => prev.filter((t) => t !== tag));
  };

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearTags = () => {
    setActiveTags([]);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputContent(val);

    // Auto-open agent popover if typing '@'
    if (val.endsWith('@') && !isAgentPopoverOpen) {
      setIsAgentPopoverOpen(true);
    }

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 220)}px`;
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1280px] mx-auto w-full select-none relative z-20 pb-6">
      <div
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`bg-[#1c1e27]/90 border rounded-[28px] p-4 sm:p-5 shadow-2xl backdrop-blur-2xl space-y-3 transition-all duration-200 relative ${
          isDragging
            ? 'border-indigo-500 ring-2 ring-indigo-500/30 bg-[#252838]'
            : 'border-white/10 focus-within:border-indigo-500/40 focus-within:ring-1 focus-within:ring-indigo-500/20'
        }`}
      >
        {/* Drop Overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-30 bg-indigo-950/80 backdrop-blur-sm rounded-[28px] flex items-center justify-center border-2 border-dashed border-indigo-400 pointer-events-none">
            <div className="flex items-center gap-3 text-indigo-200 font-medium text-sm sm:text-base animate-pulse">
              <Upload className="w-6 h-6 text-indigo-400" />
              <span>Solte suas imagens ou arquivos aqui para anexar</span>
            </div>
          </div>
        )}

        {/* Attachments Bar */}
        {(attachments.length > 0 || isUploading) && (
          <div className="flex flex-wrap gap-2 pb-2.5 border-b border-white/5 items-center">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#14151c] border border-white/10 rounded-full text-xs text-slate-200 group hover:border-indigo-500/30 transition"
              >
                {att.type.startsWith('image/') ? (
                  att.url ? (
                    <img
                      src={att.url}
                      alt={att.name}
                      className="w-4 h-4 rounded object-cover border border-white/20 shrink-0"
                    />
                  ) : (
                    <ImageIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  )
                ) : (
                  <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                )}
                <span className="max-w-[180px] truncate font-medium">{att.name}</span>
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="text-slate-400 hover:text-red-400 transition ml-1"
                  title="Remover anexo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {isUploading && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-xs text-indigo-300 font-medium animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span>Enviando anexo...</span>
              </div>
            )}
          </div>
        )}

        {/* Textarea Area */}
        <textarea
          ref={textareaRef}
          value={inputContent}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder="Descreva o que deseja criar ou pergunte ao Oráculo SPN... (Cole imagens com Ctrl+V ou arraste arquivos)"
          rows={1}
          className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-sm sm:text-base focus:outline-none resize-none min-h-[44px] max-h-[220px] leading-relaxed font-sans px-1"
        />

        {/* Action Controls & Tags Bar */}
        <div className="flex items-center justify-between pt-1 gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-2 flex-wrap relative">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="p-2 text-slate-400 hover:text-slate-100 bg-white/5 hover:bg-white/10 rounded-full transition border border-transparent hover:border-white/10 relative"
              title="Anexar arquivos (Imagens, PDF, DOCX, XLSX)"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Agent Selector Button & Popover Container */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsAgentPopoverOpen(!isAgentPopoverOpen);
                  setIsModeFilterPopoverOpen(false);
                }}
                className={`p-2 rounded-full transition border ${
                  isAgentPopoverOpen || selectedAssistant
                    ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50 shadow-md'
                    : 'text-slate-400 hover:text-slate-100 bg-white/5 hover:bg-white/10 border-transparent hover:border-white/10'
                }`}
                title="Mencionar agente (@)"
              >
                <AtSign className="w-4 h-4" />
              </button>

              <AgentSelectorPopover
                isOpen={isAgentPopoverOpen}
                onClose={() => setIsAgentPopoverOpen(false)}
                onSelectAgent={() => {
                  // Clean up trailing '@' or '@searchQuery' from input text when an agent is selected
                  setInputContent((prev) => {
                    const lastAtIndex = prev.lastIndexOf('@');
                    if (lastAtIndex !== -1) {
                      const textAfterAt = prev.slice(lastAtIndex + 1);
                      if (!textAfterAt.includes(' ')) {
                        return prev.slice(0, lastAtIndex).trimEnd();
                      }
                    }
                    return prev;
                  });

                  // Ensure activeTags has no duplicate agent @tag (selectedAssistant handles badge display)
                  setActiveTags((prev) => prev.filter((t) => !t.startsWith('@')));

                  if (textareaRef.current) {
                    setTimeout(() => {
                      if (textareaRef.current) {
                        textareaRef.current.style.height = 'auto';
                        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 220)}px`;
                        textareaRef.current.focus();
                      }
                    }, 0);
                  }
                }}
              />
            </div>

            {/* Mode & Filter Config Button & Popover Container */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsModeFilterPopoverOpen(!isModeFilterPopoverOpen);
                  setIsAgentPopoverOpen(false);
                }}
                className={`p-2 rounded-full transition border ${
                  isModeFilterPopoverOpen || activeTags.length > 0
                    ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50 shadow-md'
                    : 'text-slate-400 hover:text-slate-100 bg-white/5 hover:bg-white/10 border-transparent hover:border-white/10'
                }`}
                title="Configurações de modo / filtro"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              <ModeFilterPopover
                isOpen={isModeFilterPopoverOpen}
                onClose={() => setIsModeFilterPopoverOpen(false)}
                activeTags={activeTags}
                onToggleTag={toggleTag}
                onClearTags={clearTags}
              />
            </div>

            {/* Selected Assistant Badge Pill */}
            {selectedAssistant && (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-600/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30 transition cursor-pointer"
                title={`Agente ativo: ${selectedAssistant.name}`}
              >
                <Bot className="w-3.5 h-3.5 text-indigo-400" />
                <span>@{selectedAssistant.name}</span>
                <button
                  onClick={() => setSelectedAssistant(null)}
                  className="text-indigo-400 hover:text-red-400 transition ml-0.5"
                  title="Remover agente"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Tag Pills */}
            {activeTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#2b2e3a] text-slate-300 text-xs font-medium border border-white/5 hover:bg-[#343746] transition cursor-pointer"
              >
                <span>{tag}</span>
                <button
                  onClick={() => removeTag(tag)}
                  className="text-slate-400 hover:text-white"
                  title="Remover tag"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <ModelSelector />

            <button
              type="button"
              onClick={toggleVoiceRecording}
              className={`p-2.5 rounded-full transition-all duration-300 border cursor-pointer ${
                isRecording
                  ? 'bg-rose-600/30 text-rose-400 border-rose-500/60 shadow-lg shadow-rose-500/30 animate-pulse scale-110'
                  : 'text-slate-400 hover:text-cyan-400 bg-white/5 hover:bg-white/10 border-transparent hover:border-cyan-500/30'
              }`}
              title={isRecording ? 'Ouvindo... Clique para parar' : 'Falar por voz (Microfone)'}
            >
              <Mic className={`w-4 h-4 ${isRecording ? 'animate-bounce text-rose-400' : ''}`} />
            </button>

            {isStreaming ? (
              <button
                type="button"
                onClick={stopGeneration}
                className="p-2.5 bg-red-600 hover:bg-red-500 text-white rounded-full transition shadow-lg"
                title="Parar geração"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={(!inputContent.trim() && attachments.length === 0) || isUploading}
                className={`p-2.5 rounded-full transition-all duration-200 active:scale-95 ${
                  (inputContent.trim() || attachments.length > 0) && !isUploading
                    ? 'bg-[#383b48] hover:bg-[#484c5c] text-white shadow-lg cursor-pointer scale-105'
                    : 'bg-[#2a2c36] text-slate-500 cursor-not-allowed'
                }`}
                title="Enviar mensagem (Enter)"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Policy Micro-Caption in pt-BR */}
      <p className="text-[10px] text-slate-500 text-center mt-3 font-normal max-w-xl mx-auto leading-tight">
        A criação de conteúdo é regida por nossas políticas de segurança e Termos de Uso. Para mais detalhes, consulte nossos termos.{' '}
        <span className="underline cursor-pointer hover:text-slate-400">Saiba mais</span>
      </p>
    </div>
  );
};
