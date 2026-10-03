import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { notificationService } from './notification.service';
import { ApprovalStatus, ApprovalType, CampaignStatus } from '@prisma/client';

/**
 * Rules Engine
 *
 * Evaluates user-defined AutomationRule records against live campaign metrics
 * and produces (or queues) actions. Respects the human-in-the-loop gate:
 * unless a rule explicitly opts out AND auto-approval is enabled, every action
 * becomes a PENDING approval instead of firing immediately.
 *
 * Rule shape:
 *   triggerType: PERFORMANCE_THRESHOLD
 *   conditions:  { metric: 'roas'|'ctr'|'spend'|'cpc'|'conversions',
 *                  operator: 'lt'|'lte'|'gt'|'gte', value: number, days?: number }
 *   actions:     [{ type: 'PAUSE_CAMPAIGN'|'INCREASE_BUDGET'|'DECREASE_BUDGET',
 *                   percentage?: number, requiresApproval?: boolean }]
 */
class RulesEngine {
  private autoApprove = process.env.ENABLE_AUTO_APPROVAL === 'true';

  private async activeRules() {
    return prisma.automationRule.findMany({
      where: { enabled: true },
      orderBy: { priority: 'desc' },
    });
  }

  /**
   * Evaluate all rules for one campaign. Returns the actions taken/queued.
   */
  async evaluateCampaign(campaignId: string): Promise<any[]> {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return [];
    if (campaign.status !== CampaignStatus.ACTIVE) return [];

    const rules = await this.activeRules();
    const results: any[] = [];

    // Compute the metric values once.
    const metrics = await this.computeMetrics(campaignId);

    for (const rule of rules) {
      if (rule.triggerType !== 'PERFORMANCE_THRESHOLD') continue;
      const cond = rule.conditions as any;
      const actionList: any[] = Array.isArray(rule.actions) ? (rule.actions as any[]) : [];

      if (!this.matches(cond, metrics)) continue;

      for (const action of actionList) {
        const result = await this.applyAction(campaign, rule, action, metrics);
        if (result) results.push(result);
      }

      await prisma.automationRule.update({
        where: { id: rule.id },
        data: { lastTriggered: new Date(), triggerCount: { increment: 1 } },
      });
    }

    return results;
  }

  /**
   * Apply a single action — either queue an approval or execute (if allowed).
   */
  private async applyAction(
    campaign: any,
    rule: any,
    action: any,
    metrics: any
  ): Promise<any | null> {
    const type = action.type;
    const requiresApproval = action.requiresApproval !== false; // default true
    const goDirect = !requiresApproval && this.autoApprove;

    // Map to an ApprovalType.
    const approvalType: ApprovalType | null =
      type === 'PAUSE_CAMPAIGN'
        ? ApprovalType.CAMPAIGN_PAUSE
        : type === 'INCREASE_BUDGET'
        ? ApprovalType.BUDGET_INCREASE
        : type === 'DECREASE_BUDGET'
        ? ApprovalType.BUDGET_DECREASE
        : null;

    if (!approvalType) {
      logger.warn('Unknown rule action type', { type, ruleId: rule.id });
      return null;
    }

    const requestData = {
      ruleId: rule.id,
      ruleName: rule.name,
      actionType: type,
      percentage: action.percentage,
      metrics,
      reason: `Rule "${rule.name}" matched (${JSON.stringify(rule.conditions)})`,
    };

    if (goDirect) {
      const { approvalService } = await import('./approval.service');
      await approvalService.executeAction({
        type: approvalType,
        campaignId: campaign.id,
        requestData,
      });
      await notificationService.send({
        title: 'Rule auto-executed',
        message: `"${type}" applied to ${campaign.name}`,
        level: 'warn',
        data: { campaignId: campaign.id, ruleId: rule.id },
      });
      return { campaignId: campaign.id, action: type, mode: 'executed' };
    }

    // Queue for human approval.
    await prisma.approval.create({
      data: {
        type: approvalType,
        status: ApprovalStatus.PENDING,
        entityType: 'campaign',
        entityId: campaign.id,
        campaignId: campaign.id,
        requestedBy: `rule:${rule.name}`,
        requestData,
      },
    });
    await notificationService.send({
      title: 'Approval needed',
      message: `"${type}" suggested for ${campaign.name} by rule "${rule.name}"`,
      level: 'info',
      data: { campaignId: campaign.id, ruleId: rule.id },
    });
    return { campaignId: campaign.id, action: type, mode: 'pending-approval' };
  }

  private matches(cond: any, metrics: any): boolean {
    if (!cond || !cond.metric) return false;
    const actual = metrics[cond.metric];
    if (actual === null || actual === undefined) return false;
    const target = Number(cond.value);
    switch (cond.operator) {
      case 'lt':
        return actual < target;
      case 'lte':
        return actual <= target;
      case 'gt':
        return actual > target;
      case 'gte':
        return actual >= target;
      default:
        return false;
    }
  }

  private async computeMetrics(campaignId: string): Promise<any> {
    const agg = await prisma.campaignMetric.aggregate({
      where: { campaignId },
      _sum: { impressions: true, clicks: true, conversions: true, spend: true, revenue: true },
    });
    const impressions = agg._sum.impressions || 0;
    const clicks = agg._sum.clicks || 0;
    const spend = Number(agg._sum.spend || 0);
    const metaRevenue = Number(agg._sum.revenue || 0);
    const conversions = agg._sum.conversions || 0;

    // C1 wiring: prefer attributed revenue + contribution margin from
    // OrderEconomics (Shopify orders matched by UTM + COD/RTO cost stack).
    // Meta-reported revenue overcounts — it counts orders that may be RTO.
    const econ = await prisma.orderEconomics.aggregate({
      where: { campaignId },
      _sum: { netRevenue: true, contributionMargin: true },
      _count: { _all: true },
    });
    const attributedRevenue = Number(econ._sum.netRevenue || 0);
    const contributionMargin = Number(econ._sum.contributionMargin || 0);
    const hasEcon = econ._count._all > 0;

    // Use attributed revenue when OrderEconomics has rows for this campaign;
    // otherwise fall back to Meta-reported revenue (zero-attribution case).
    const revenue = hasEcon ? attributedRevenue : metaRevenue;
    const roas = spend > 0 ? Number((revenue / spend).toFixed(2)) : null;
    const cmPercent = revenue > 0 ? Number(((contributionMargin / revenue) * 100).toFixed(2)) : null;

    return {
      impressions,
      clicks,
      conversions,
      spend,
      revenue,
      contributionMargin: hasEcon ? contributionMargin : null,
      cmPercent,
      attributionSource: hasEcon ? 'order_economics' : 'meta_reported',
      orders: econ._count._all,
      ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(4)) : null,
      cpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : null,
      roas,
    };
  }
}

export const rulesEngine = new RulesEngine();
export default rulesEngine;
