import { prisma } from '../db/prisma.js';

export interface LogAuditParams {
  clientId: string;
  clientName: string;
  action: string;
  ipAddress?: string;
  conversationId?: string;
  messageId?: string;
  model?: string;
  provider?: string;
  status?: 'SUCCESS' | 'FAILURE' | 'WARNING';
  details?: Record<string, any>;
}

export class AuditService {
  static async log(params: LogAuditParams) {
    try {
      await prisma.auditLog.create({
        data: {
          client_id: params.clientId,
          client_name: params.clientName,
          action: params.action,
          ip_address: params.ipAddress || null,
          conversation_id: params.conversationId || null,
          message_id: params.messageId || null,
          model: params.model || null,
          provider: params.provider || null,
          status: params.status || 'SUCCESS',
          details: params.details ? JSON.stringify(params.details) : null,
        },
      });
    } catch (error: any) {
      console.error('[AuditService] Failed to record audit log:', error.message);
    }
  }

  static async listLogs(limit = 100, page = 1) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { created_at: 'desc' },
        take: limit,
        skip,
      }),
      prisma.auditLog.count(),
    ]);

    return {
      items: items.map((log) => ({
        ...log,
        details: log.details ? JSON.parse(log.details) : null,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}
