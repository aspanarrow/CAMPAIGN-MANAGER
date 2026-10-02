import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { metaService } from './meta.service';
import { attributionService } from './attribution.service';
import { CampaignStatus, Platform } from '@prisma/client';

/**
 * Metrics Sync Service
 *
 * Pulls performance metrics from the ad platform and stores them at
 * campaign / ad-set / ad level as day-by-day time-series, then attaches
 * revenue from Shopify (attribution) to compute ROAS.
 */
class MetricsSyncService {
  /**
   * Sync one campaign: status, totals, daily metrics (campaign/adset/ad),
   * and revenue attribution.
   */
  async syncCampaign(campaignId: string): Promise<void> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { adSets: { include: { ads: true } } },
    });
    if (!campaign) throw new Error('Campaign not found');
    if (!campaign.externalId || campaign.platform !== Platform.META) {
      logger.debug('Skipping sync (no external id / unsupported platform)', { campaignId });
      return;
    }

    // 1) Status sync (so a pause done in Ads Manager reflects here).
    const remoteStatus = await metaService.getCampaignStatus(campaign.externalId);
    if (remoteStatus) {
      const mapped = remoteStatus === 'ACTIVE' ? CampaignStatus.ACTIVE : CampaignStatus.PAUSED;
      if (mapped !== campaign.status && campaign.status !== CampaignStatus.DRAFT) {
        await prisma.campaign.update({ where: { id: campaignId }, data: { status: mapped } });
      }
    }

    // 2) Daily campaign metrics.
    const rows = await metaService.getInsightsByDay(campaign.externalId, 'campaign', 'last_30d');
    for (const row of rows) {
      const parsed = this.parseInsightRow(row);
      if (!parsed.date) continue;
      await prisma.campaignMetric.upsert({
        where: { campaignId_date: { campaignId, date: parsed.date } },
        update: parsed.metrics,
        create: { campaignId, date: parsed.date, ...parsed.metrics },
      });
    }

    // 3) Ad-set + ad level metrics.
    const adSets = await metaService.listChildren(campaign.externalId, 'adsets');
    for (const remoteAdSet of adSets) {
      const dbAdSet = campaign.adSets.find((a) => a.externalId === remoteAdSet.id);
      if (!dbAdSet) continue;

      const adSetRows = await metaService.getInsightsByDay(remoteAdSet.id, 'adset', 'last_30d');
      for (const row of adSetRows) {
        const parsed = this.parseInsightRow(row);
        if (!parsed.date) continue;
        await prisma.adSetMetric.upsert({
          where: { adSetId_date: { adSetId: dbAdSet.id, date: parsed.date } },
          update: parsed.metrics,
          create: { adSetId: dbAdSet.id, date: parsed.date, ...parsed.metrics },
        });
      }

      const ads = await metaService.listChildren(remoteAdSet.id, 'ads');
      for (const remoteAd of ads) {
        const dbAd = dbAdSet.ads.find((a) => a.externalId === remoteAd.id);
        if (!dbAd) continue;
        const adRows = await metaService.getInsightsByDay(remoteAd.id, 'ad', 'last_30d');
        for (const row of adRows) {
          const parsed = this.parseInsightRow(row);
          if (!parsed.date) continue;
          await prisma.adMetric.upsert({
            where: { adId_date: { adId: dbAd.id, date: parsed.date } },
            update: parsed.metrics,
            create: { adId: dbAd.id, date: parsed.date, ...parsed.metrics },
          });
        }
      }
    }

    // 4) Revenue attribution (Shopify orders -> campaign revenue).
    await attributionService.attributeCampaign(campaignId);

    // 5) Recompute totals from the time-series.
    await this.recomputeTotals(campaignId);

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { lastSyncedAt: new Date() },
    });

    logger.info('Campaign synced', { campaignId, days: rows.length });
  }

  /**
   * Recompute campaign totals + ROAS from its stored daily metrics.
   */
  async recomputeTotals(campaignId: string): Promise<void> {
    const agg = await prisma.campaignMetric.aggregate({
      where: { campaignId },
      _sum: { impressions: true, clicks: true, conversions: true, spend: true, revenue: true },
    });
    const spend = Number(agg._sum.spend || 0);
    const revenue = Number(agg._sum.revenue || 0);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        impressions: agg._sum.impressions || 0,
        clicks: agg._sum.clicks || 0,
        conversions: agg._sum.conversions || 0,
        spend,
        revenue,
        roas: spend > 0 ? Number((revenue / spend).toFixed(2)) : null,
      },
    });
  }

  /**
   * Sync every ACTIVE campaign.
   */
  async syncAllActive(): Promise<number> {
    const campaigns = await prisma.campaign.findMany({
      where: { status: CampaignStatus.ACTIVE, externalId: { not: null } },
      select: { id: true },
    });
    let ok = 0;
    for (const c of campaigns) {
      try {
        await this.syncCampaign(c.id);
        ok++;
      } catch (error: any) {
        logger.error('Campaign sync failed', { campaignId: c.id, error: error.message });
      }
    }
    return ok;
  }

  private parseInsightRow(row: any): { date: Date | null; metrics: any } {
    const dateStr = row.date_start || row.date_stop;
    if (!dateStr) return { date: null, metrics: {} };
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);

    const purchaseAction = (row.actions || []).find(
      (a: any) => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
    );

    return {
      date,
      metrics: {
        impressions: Number(row.impressions || 0),
        clicks: Number(row.clicks || 0),
        conversions: Number(purchaseAction?.value || 0),
        spend: Number(row.spend || 0),
        // revenue filled in later by attribution
      },
    };
  }
}

export const metricsSyncService = new MetricsSyncService();
export default metricsSyncService;
