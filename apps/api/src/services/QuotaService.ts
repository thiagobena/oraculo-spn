import { prisma } from '../db/prisma.js';

export class QuotaService {
  /**
   * Verifica se o usuário tem cota suficiente e autorização para usar o modelo/provedor requisitado.
   */
  static async checkUserQuota(userId: string, isPaidModel: boolean): Promise<{ allowed: boolean; remainingTokens?: number | null; message?: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    if (!user.is_active) {
      throw new Error('Usuário inativo.');
    }

    // Modelos locais/gratuitos (LM Studio, Ollama) são sempre liberados
    if (!isPaidModel) {
      return { allowed: true };
    }

    // Para modelos pagos (OpenAI, Anthropic, Gemini):
    if (!user.can_use_paid_llm) {
      return {
        allowed: false,
        message: 'O uso de modelos de IA pagas (OpenAI/Claude/Gemini) não está habilitado para a sua conta. Por favor, utilize um modelo local gratuito.',
      };
    }

    // Verificar se precisa dar reset mensal automático na cota
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    if (!user.quota_reset_at || new Date(user.quota_reset_at) < startOfCurrentMonth) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          tokens_used_this_month: 0,
          quota_reset_at: now,
        },
      });
      user.tokens_used_this_month = 0;
    }

    // Se cota for null, é cota ilimitada
    if (user.monthly_token_quota === null || user.monthly_token_quota === undefined) {
      return { allowed: true, remainingTokens: null };
    }

    const remaining = user.monthly_token_quota - user.tokens_used_this_month;

    if (remaining <= 0) {
      return {
        allowed: false,
        remainingTokens: 0,
        message: `Sua cota mensal de tokens para IAs pagas (${user.monthly_token_quota.toLocaleString('pt-BR')} tokens) foi atingida. Solicite mais créditos ao Administrador ou utilize o modelo local.`,
      };
    }

    return {
      allowed: true,
      remainingTokens: remaining,
    };
  }

  /**
   * Debita os tokens consumidos da cota do usuário.
   */
  static async deductUserTokens(userId: string, totalTokens: number, isPaidModel: boolean): Promise<void> {
    if (!isPaidModel || totalTokens <= 0) return;

    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          tokens_used_this_month: {
            increment: totalTokens,
          },
        },
      });
    } catch (e: any) {
      console.error('Erro ao debitar tokens do usuário:', e);
    }
  }

  /**
   * Reseta os créditos/uso de um usuário específico (ação do admin).
   */
  static async resetUserUsage(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        tokens_used_this_month: 0,
        quota_reset_at: new Date(),
      },
    });
  }
}
