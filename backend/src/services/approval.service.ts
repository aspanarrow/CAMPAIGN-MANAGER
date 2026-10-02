import { prisma } from '../config/database';
import { ApprovalStatus, ApprovalType } from '@prisma/client';
import { logger } from '../utils/logger';
import { campaignService } from './campaign.service';

/**
 * Approval Workflow Service
 * Manages human-in-the-loop approval workflows
 */
class ApprovalService {
  /**
   * Get pending approvals
   */
  async getPendingApprovals(): Promise<any[]> {
    return await prisma.approval.findMany({
      where: { status: ApprovalStatus.PENDING },
      include: { campaign: true },
      orderBy: { requestedAt: 'desc' },
    });
  }

  /**
   * Approve a request
   */
  async approve(approvalId: string, approvedBy: string): Promise<any> {
    try {
      const approval = await prisma.approval.findUnique({
        where: { id: approvalId },
      });

      if (!approval) {
        throw new Error('Approval not found');
      }

      if (approval.status !== ApprovalStatus.PENDING) {
        throw new Error(`Approval is already ${approval.status}`);
      }

      // Update approval
      const updated = await prisma.approval.update({
        where: { id: approvalId },
        data: {
          status: ApprovalStatus.APPROVED,
          approvedBy,
          approvedAt: new Date(),
        },
      });

      // Execute the approved action
      await this.executeApprovedAction(approval);

      logger.info('Approval granted', { approvalId, type: approval.type });

      return updated;
    } catch (error: any) {
      logger.error('Error approving request', { error: error.message, approvalId });
      throw error;
    }
  }

  /**
   * Reject a request
   */
  async reject(approvalId: string, rejectedBy: string, reason: string): Promise<any> {
    try {
      const approval = await prisma.approval.findUnique({
        where: { id: approvalId },
      });

      if (!approval) {
        throw new Error('Approval not found');
      }

      if (approval.status !== ApprovalStatus.PENDING) {
        throw new Error(`Approval is already ${approval.status}`);
      }

      const updated = await prisma.approval.update({
        where: { id: approvalId },
        data: {
          status: ApprovalStatus.REJECTED,
          rejectedBy,
          rejectedAt: new Date(),
          rejectionReason: reason,
        },
      });

      logger.info('Approval rejected', { approvalId, reason });

      return updated;
    } catch (error: any) {
      logger.error('Error rejecting request', { error: error.message, approvalId });
      throw error;
    }
  }

  /**
   * Execute the action after approval
   */
  private async executeApprovedAction(approval: any): Promise<void> {
    const requestData = approval.requestData as any;
    await this.executeAction({
      type: approval.type,
      campaignId: approval.campaignId,
      requestData,
    });
  }

  /**
   * Execute an action directly (used by approvals AND by the rules engine for
   * auto-approved actions). Also records an audit log entry.
   */
  async executeAction(params: {
    type: ApprovalType;
    campaignId?: string | null;
    requestData?: any;
  }): Promise<void> {
    const { type, campaignId, requestData } = params;
    const { metaService } = await import('./meta.service');
    const { auditService } = await import('./audit.service');
    const { CampaignStatus } = await import('@prisma/client');

    switch (type) {
      case ApprovalType.CAMPAIGN_CREATION:
        if (campaignId) {
          await campaignService.deployCampaign(campaignId, {
            products: requestData?.products,
            adCopy: requestData?.adCopy,
          });
          await auditService.log({
            action: 'CAMPAIGN_DEPLOYED',
            entityType: 'campaign',
            entityId: campaignId,
          });
        }
        break;

      case ApprovalType.BUDGET_INCREASE:
      case ApprovalType.BUDGET_DECREASE: {
        if (!campaignId) break;
        const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign) break;

        const pct = Number(requestData?.percentage || 20);
        const direction = type === ApprovalType.BUDGET_INCREASE ? 1 : -1;
        const factor = 1 + (direction * pct) / 100;

        const currentDaily = Number(campaign.dailyBudget || campaign.budget || 0);
        const newDaily = Math.max(Number(process.env.META_MIN_DAILY_BUDGET || 100), Math.round(currentDaily * factor));

        if (campaign.externalId && campaign.externalId.length > 0) {
          await metaService.updateCampaignBudget(campaign.externalId, newDaily);
        }
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { dailyBudget: newDaily, budget: Math.round(Number(campaign.budget) * factor) },
        });
        await auditService.log({
          action: type === ApprovalType.BUDGET_INCREASE ? 'BUDGET_INCREASED' : 'BUDGET_DECREASED',
          entityType: 'campaign',
          entityId: campaignId,
          changes: { from: currentDaily, to: newDaily, percentage: pct },
        });
        logger.info('Budget updated', { campaignId, from: currentDaily, to: newDaily });
        break;
      }

      case ApprovalType.CAMPAIGN_PAUSE: {
        if (!campaignId) break;
        const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign) break;
        if (campaign.externalId) {
          await metaService.updateCampaignStatus(campaign.externalId, 'PAUSED');
        }
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: CampaignStatus.PAUSED },
        });
        await auditService.log({
          action: 'CAMPAIGN_PAUSED',
          entityType: 'campaign',
          entityId: campaignId,
        });
        logger.info('Campaign paused', { campaignId });
        break;
      }

      default:
        logger.warn('Unknown approval type', { type });
    }
  }

  /**
   * Check if action requires approval
   */
  shouldRequireApproval(type: ApprovalType, data: any): boolean {
    // Auto-approve if feature flag is enabled
    if (process.env.ENABLE_AUTO_APPROVAL === 'true') {
      return false;
    }

    // Check thresholds
    switch (type) {
      case ApprovalType.BUDGET_INCREASE:
        const threshold = parseFloat(process.env.AUTO_APPROVAL_THRESHOLD || '20');
        const increasePercent = data.increasePercent || 0;
        return increasePercent > threshold;

      case ApprovalType.CAMPAIGN_CREATION:
        // Always require approval for new campaigns
        return true;

      case ApprovalType.CAMPAIGN_DELETE:
        // Always require approval for deletion
        return true;

      default:
        return false;
    }
  }

  /**
   * Create approval request
   */
  async createApproval(params: {
    type: ApprovalType;
    entityType: string;
    entityId: string;
    campaignId?: string;
    requestData: any;
    requestedBy?: string;
  }): Promise<any> {
    return await prisma.approval.create({
      data: {
        type: params.type,
        status: ApprovalStatus.PENDING,
        entityType: params.entityType,
        entityId: params.entityId,
        campaignId: params.campaignId,
        requestData: params.requestData,
        requestedBy: params.requestedBy || 'system',
      },
    });
  }
}

export const approvalService = new ApprovalService();
export default approvalService;

