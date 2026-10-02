import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Audit Log Service
 * Records who/what changed, for accountability and debugging.
 */
class AuditService {
  async log(params: {
    action: string;
    entityType: string;
    entityId?: string;
    userId?: string;
    changes?: any;
    metadata?: any;
  }): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          userId: params.userId,
          changes: params.changes ?? undefined,
          metadata: params.metadata ?? undefined,
        },
      });
    } catch (error: any) {
      // Auditing must never break the main flow.
      logger.warn('Failed to write audit log', { error: error.message, action: params.action });
    }
  }

  async list(params: { entityType?: string; entityId?: string; limit?: number } = {}) {
    return prisma.auditLog.findMany({
      where: {
        ...(params.entityType ? { entityType: params.entityType } : {}),
        ...(params.entityId ? { entityId: params.entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 100,
    });
  }
}

export const auditService = new AuditService();
export default auditService;
