import { prisma } from '../db/prisma.js';
import { LMStudioProvider } from '@oraculo/ai-core';

export class ConversationService {
  static async listConversations(clientId?: string, folderId?: string, search?: string) {
    const where: any = {};
    if (clientId) {
      where.created_by_client = clientId;
    }
    if (folderId !== undefined) {
      where.folder_id = folderId === 'null' ? null : folderId;
    }
    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search } },
        { messages: { some: { content: { contains: search } } } },
      ];
    }

    const items = await prisma.conversation.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { updated_at: 'desc' }],
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });

    return items.map((c) => ({
      id: c.id,
      title: c.title,
      folder_id: c.folder_id,
      assistant_id: c.assistant_id,
      default_model: c.default_model,
      pinned: c.pinned,
      archived: c.archived,
      created_by_client: c.created_by_client,
      created_by_name: c.created_by_name,
      created_at: c.created_at.toISOString(),
      updated_at: c.updated_at.toISOString(),
      message_count: c._count.messages,
    }));
  }

  static async getConversation(id: string) {
    const conv = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { created_at: 'asc' },
          include: {
            attachments: true,
            generation: true,
            versions: { orderBy: { version_number: 'desc' } },
            feedback: true,
          },
        },
      },
    });

    if (!conv) return null;

    return {
      id: conv.id,
      title: conv.title,
      folder_id: conv.folder_id,
      assistant_id: conv.assistant_id,
      default_model: conv.default_model,
      pinned: conv.pinned,
      archived: conv.archived,
      created_by_client: conv.created_by_client,
      created_by_name: conv.created_by_name,
      created_at: conv.created_at.toISOString(),
      updated_at: conv.updated_at.toISOString(),
      messages: conv.messages.map((m) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        parent_message_id: m.parent_message_id,
        role: m.role as any,
        content: m.content,
        model: m.model,
        provider: m.provider,
        client_id: m.client_id,
        client_name: m.client_name,
        error: m.error,
        metadata: m.metadata ? JSON.parse(m.metadata) : null,
        is_edited: m.is_edited,
        active_version_id: m.active_version_id,
        attachments: m.attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          original_name: a.original_name,
          mime_type: a.mime_type,
          file_size: a.file_size,
          status: a.status as any,
          file_path: a.file_path,
          extracted_text: a.extracted_text || undefined,
        })),
        generation: m.generation
          ? {
              id: m.generation.id,
              input_tokens: m.generation.input_tokens || undefined,
              output_tokens: m.generation.output_tokens || undefined,
              total_tokens: m.generation.total_tokens || undefined,
              ttft_ms: m.generation.ttft_ms || undefined,
              duration_ms: m.generation.duration_ms || undefined,
              tokens_per_second: m.generation.tokens_per_second || undefined,
              finish_reason: m.generation.finish_reason || undefined,
              reasoning_content: m.generation.reasoning_content || undefined,
              error: m.generation.error || undefined,
            }
          : null,
        versions: m.versions.map((v) => ({
          id: v.id,
          version_number: v.version_number,
          content: v.content,
          model: v.model,
          provider: v.provider,
          created_at: v.created_at.toISOString(),
        })),
        feedback: m.feedback
          ? {
              rating: m.feedback.rating as any,
              comment: m.feedback.comment || undefined,
            }
          : null,
        created_at: m.created_at.toISOString(),
      })),
    };
  }

  static async createConversation(data: {
    title?: string;
    folder_id?: string | null;
    assistant_id?: string | null;
    default_model: string;
    client_id: string;
    client_name: string;
  }) {
    const conv = await prisma.conversation.create({
      data: {
        title: data.title || 'Nova Conversa',
        folder_id: data.folder_id || null,
        assistant_id: data.assistant_id || null,
        default_model: data.default_model,
        created_by_client: data.client_id,
        created_by_name: data.client_name,
      },
    });
    return conv;
  }

  static async updateConversation(
    id: string,
    data: { title?: string; folder_id?: string | null; default_model?: string; pinned?: boolean; archived?: boolean }
  ) {
    return prisma.conversation.update({
      where: { id },
      data,
    });
  }

  static async deleteConversation(id: string) {
    return prisma.conversation.delete({
      where: { id },
    });
  }

  static async generateTitleIfNeeded(conversationId: string, provider: LMStudioProvider, model: string) {
    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { messages: true },
      });

      if (!conv || conv.messages.length < 2) {
        return;
      }

      const firstUserMsg = conv.messages.find((m) => m.role === 'user')?.content || '';
      if (!firstUserMsg) return;

      let targetModel = model;
      if (targetModel === 'auto' || targetModel === 'auto-select' || !targetModel) {
        const models = await provider.listModels();
        targetModel = models.find((m) => m.is_loaded)?.key || models[0]?.key || 'default';
      }

      const cleanPromptText = firstUserMsg.replace(/^\[Estilo: .*?\]\s*/, '').slice(0, 300);
      const titlePrompt = `Gere um título curto e objetivo em português (entre 3 e 6 palavras) para a seguinte conversa. Responda APENAS o título sem aspas ou ponto final.\n\nMensagem do usuário: "${cleanPromptText}"`;

      const res = await provider.chat({
        model: targetModel,
        messages: [{ role: 'user', content: titlePrompt }],
        max_tokens: 30,
        temperature: 0.3,
      });

      const cleanTitle = res.content.trim().replace(/^["']|["']$/g, '').slice(0, 60);

      if (cleanTitle && cleanTitle.length > 2 && cleanTitle !== 'Nova Conversa') {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { title: cleanTitle },
        });
      }
    } catch (e: any) {
      console.error('[ConversationService] Auto-title generation error:', e.message);
    }
  }
}
