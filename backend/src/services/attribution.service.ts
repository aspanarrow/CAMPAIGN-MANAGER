import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { shopifyService } from './shopify.service';

/**
 * Attribution Service
 *
 * Matches Shopify orders to a campaign (via UTM parameters) and writes the
 * resulting revenue onto the campaign's daily metrics so ROAS can be computed.
 *
 * Matching strategy (first match wins):
 *   1. Order landing_site / referring_site contains  utm_campaign == campaign.utmCampaign
 *   2. Otherwise, if a campaign has no utmCampaign set, revenue is left at 0
 *      (we never guess — guessing corrupts ROAS).
 *
 * NOTE: Shopify order attribution data arrives in the order's `landing_site`
 * and `referring_site` fields, plus `note_attributes`/`marketing_consent` on
 * newer stores. We read what the Admin REST API returns.
 */
class AttributionService {
  /**
   * Attribute recent Shopify orders to one campaign and persist revenue
   * into that campaign's CampaignMetric rows (by day).
   */
  async attributeCampaign(campaignId: string): Promise<number> {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');
    if (!campaign.utmCampaign) {
      logger.debug('No utmCampaign set — skipping attribution', { campaignId });
      return 0;
    }

    const orders = await this.fetchRecentOrders();
    const token = campaign.utmCampaign.toLowerCase();

    // day -> revenue
    const revenueByDay = new Map<string, number>();
    for (const order of orders) {
      if (!this.orderMatches(order, token)) continue;
      const day = new Date(order.created_at);
      day.setHours(0, 0, 0, 0);
      const key = day.toISOString();
      revenueByDay.set(key, (revenueByDay.get(key) || 0) + parseFloat(order.total_price || '0'));
    }

    let total = 0;
    for (const [key, revenue] of revenueByDay) {
      const date = new Date(key);
      total += revenue;
      await prisma.campaignMetric.upsert({
        where: { campaignId_date: { campaignId, date } },
        update: { revenue },
        create: {
          campaignId,
          date,
          revenue,
        },
      });
    }

    if (total > 0) {
      logger.info('Attributed revenue', { campaignId, revenue: total, days: revenueByDay.size });
    }
    return total;
  }

  private orderMatches(order: any, token: string): boolean {
    const haystack = [
      order.landing_site,
      order.referring_site,
      order.source_name,
      ...(Array.isArray(order.note_attributes)
        ? order.note_attributes.map((a: any) => a.value)
        : []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(token);
  }

  private async fetchRecentOrders(): Promise<any[]> {
    // Admin REST orders from the last 60 days. Uses the existing shopify service
    // which reads SHOPIFY_ACCESS_TOKEN.
    const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    try {
      const orders = await shopifyService.getOrders({ since, limit: 250 });
      return orders;
    } catch (error: any) {
      logger.warn('Failed to fetch orders for attribution', { error: error.message });
      return [];
    }
  }
}

export const attributionService = new AttributionService();
export default attributionService;
