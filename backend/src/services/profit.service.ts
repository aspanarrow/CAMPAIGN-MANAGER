import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { shopifyService } from './shopify.service';
import { attributionService } from './attribution.service';
import {
  computeOrderEconomics,
  breakEvenRoas,
  campaignVerdict,
  expectedCmPerOrder,
  CostAssumptions,
  OrderOutcome,
} from './economics';

/**
 * Profit Service — India unit economics (NINA C1 spec).
 *
 * Syncs Shopify orders into OrderEconomics with the full cost stack, then
 * answers the three business questions: where is CM coming from, which
 * campaigns are actually profitable, and what can we afford to pay for a
 * customer (maxCAC).
 *
 * Honesty rules enforced here (spec §7):
 *   1. Never average over missing data — rows with no COGS are excluded from
 *      CM aggregates and counted in `coverage.withCogs`.
 *   2. Every assumption is labelled — RTO stays `assumed` until a courier
 *      feed exists, and `warnings` says so.
 *   3. Sort by contribution, not ROAS.
 */
class ProfitService {
  /**
   * Load cost assumptions into a plain object. Throws if any expected key is
   * missing — the design rule is: no silent defaults for rupee values.
   */
  async getAssumptions(): Promise<CostAssumptions> {
    const rows = await prisma.costAssumption.findMany();
    const map: Record<string, number> = {};
    for (const r of rows) map[r.key] = Number(r.value);

    const required: (keyof CostAssumptions)[] = [
      'payment_fee_percent_prepaid',
      'payment_fee_percent_cod',
      'cod_fee_percent',
      'cod_fee_flat',
      'packaging_per_order',
      'forward_ship_per_order',
      'return_ship_per_order',
      'rto_handling_per_order',
      'tax_inclusive_pricing',
      'assumed_rto_rate',
    ];
    for (const k of required) {
      if (map[k] === undefined) {
        throw new Error(`Cost assumption "${k}" is missing — run: npx prisma db seed`);
      }
    }
    return map as unknown as CostAssumptions;
  }

  /**
   * Sync recent Shopify orders into OrderEconomics. Idempotent by
   * shopifyOrderId (upsert). Preserves manually-set outcomes.
   */
  async syncOrders(opts: { since?: string; limit?: number } = {}): Promise<number> {
    const since = opts.since || new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    const orders = await shopifyService.getOrders({ since, limit: opts.limit ?? 250 });
    const assumptions = await this.getAssumptions();

    let synced = 0;
    for (const order of orders) {
      try {
        await this.upsertOrder(order, assumptions);
        synced++;
      } catch (error: any) {
        logger.warn('Failed to upsert order economics', { orderId: order.id, error: error.message });
      }
    }
    logger.info('Order economics synced', { synced });
    return synced;
  }

  private async upsertOrder(order: any, a: CostAssumptions): Promise<void> {
    const isCod = shopifyService.isCodOrder(order);
    const cogs = shopifyService.computeCogs(order);

    // Outcome mapping (spec §5). Shipping-stage detection is best-effort in S1;
    // DELIVERED vs RTO/RETURNED normally arrives via courier feed (S2) or the
    // manual PATCH endpoint (T6). Until then, outcome stays PENDING unless the
    // order explicitly shows cancelled/refunded — never guess RTO silently.
    let outcome: OrderOutcome = 'PENDING';
    if ((order.financial_status || '') === 'CANCELLED') outcome = 'CANCELLED';
    if ((order.fulfillment_status || '').toUpperCase() === 'RETURNED') outcome = 'RETURNED';

    const grossRevenue = parseFloat(order.current_total_price || order.total_price || '0');
    const discountAmount = parseFloat(order.total_discounts || '0');
    const taxAmount = parseFloat(order.total_tax || '0');
    const shippingCharged = parseFloat(order.total_shipping_price || '0');
    const refundedAmount = parseFloat(order.total_refunded || '0');

    const computed = computeOrderEconomics(
      {
        isCod,
        grossRevenue,
        discountAmount,
        taxAmount,
        shippingCharged,
        refundedAmount,
        cogsAmount: cogs === null ? NaN : cogs,
        outcome,
      },
      a
    );

    const existing = await prisma.orderEconomics.findUnique({
      where: { shopifyOrderId: String(order.id) },
    });

    // Preserve a manually-set outcome (PATCH /api/profit/orders/:id/outcome).
    const preservedOutcome = existing?.outcomeConfirmed ? existing.outcome : outcome;

    await prisma.orderEconomics.upsert({
      where: { shopifyOrderId: String(order.id) },
      update: {
        financialStatus: order.financial_status || '',
        fulfillmentStatus: order.fulfillment_status || '',
        isCod,
        grossRevenue,
        discountAmount,
        taxAmount,
        shippingCharged,
        netRevenue: computed.netRevenue,
        cogsAmount: cogs === null ? 0 : cogs,
        paymentFeeAmount: computed.paymentFeeAmount,
        codFeeAmount: computed.codFeeAmount,
        packagingCost: computed.packagingCost,
        forwardShipCost: computed.forwardShipCost,
        returnShipCost: computed.returnShipCost,
        rtoHandlingCost: computed.rtoHandlingCost,
        refundedAmount,
        outcome: preservedOutcome,
        outcomeConfirmed: existing?.outcomeConfirmed ?? false,
        contributionMargin: computed.contributionMargin,
        dataQuality: computed.dataQuality,
      },
      create: {
        shopifyOrderId: String(order.id),
        orderNumber: order.name || String(order.id),
        placedAt: new Date(order.created_at),
        isCod,
        financialStatus: order.financial_status || '',
        fulfillmentStatus: order.fulfillment_status || '',
        currency: order.currency || 'INR',
        grossRevenue,
        discountAmount,
        taxAmount,
        shippingCharged,
        netRevenue: computed.netRevenue,
        cogsAmount: cogs === null ? 0 : cogs,
        paymentFeeAmount: computed.paymentFeeAmount,
        codFeeAmount: computed.codFeeAmount,
        packagingCost: computed.packagingCost,
        forwardShipCost: computed.forwardShipCost,
        returnShipCost: computed.returnShipCost,
        rtoHandlingCost: computed.rtoHandlingCost,
        refundedAmount,
        outcome: preservedOutcome,
        outcomeConfirmed: false,
        contributionMargin: computed.contributionMargin,
        dataQuality: computed.dataQuality,
      },
    });
  }

  private async rows(from?: string, to?: string, campaignId?: string) {
    return prisma.orderEconomics.findMany({
      where: {
        ...(from || to
          ? {
              placedAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
        ...(campaignId ? { campaignId } : {}),
      },
      orderBy: { placedAt: 'desc' },
    });
  }

  /**
   * KPI summary (spec §6). Returns coverage % + warnings — honesty rules
   * demand that missing data is never silently averaged.
   */
  async summary(from?: string, to?: string, campaignId?: string): Promise<any> {
    const [rows, assumptions] = await Promise.all([
      this.rows(from, to, campaignId),
      this.getAssumptions(),
    ]);

    const total = rows.length;
    const withCogsRows = rows.filter((r) => r.dataQuality !== 'no_cogs');
    const withConfirmedOutcome = rows.filter((r) => r.outcomeConfirmed);
    const codOrders = rows.filter((r) => r.isCod);
    const rtoOrders = rows.filter((r) => r.outcome === 'RTO');

    const prepaidShare = total ? (total - codOrders.length) / total : 0;
    const rtoRate = codOrders.length
      ? rtoOrders.length / codOrders.length
      : assumptions.assumed_rto_rate / 100;

    // CM aggregates only over rows that HAVE cogs (honesty rule #1).
    const cmSum = withCogsRows.reduce((s, r) => s + Number(r.contributionMargin), 0);
    const cmAvg = withCogsRows.length ? cmSum / withCogsRows.length : null;
    const netRevenueSum = withCogsRows.reduce((s, r) => s + Number(r.netRevenue), 0);
    const cmPercent = netRevenueSum > 0 ? (cmSum / netRevenueSum) * 100 : null;

    // Blended expected CM (spec §4) — maxCAC anchor.
    const cmPrepaidAvg = avg(withCogsRows.filter((r) => !r.isCod).map((r) => Number(r.contributionMargin)));
    const cmCodDeliveredAvg = avg(
      withCogsRows.filter((r) => r.isCod && r.outcome !== 'RTO' && r.outcome !== 'CANCELLED')
        .map((r) => Number(r.contributionMargin))
    );
    const cmRtoAvg = avg(rtoOrders.map((r) => Number(r.contributionMargin)));
    const expectedCM = expectedCmPerOrder({
      prepaidShare,
      codShare: 1 - prepaidShare,
      rtoRate: Math.max(rtoRate, assumptions.assumed_rto_rate / 100),
      cmPrepaidAvg: cmPrepaidAvg ?? 0,
      cmCodDeliveredAvg: cmCodDeliveredAvg ?? 0,
      cmRtoAvg: cmRtoAvg ?? 0,
    });

    const warnings: string[] = [];
    if (total - withCogsRows.length > 0) {
      warnings.push(
        `COGS missing for ${Math.round(((total - withCogsRows.length) / total) * 100)}% of orders — enter unit cost in Shopify admin`
      );
    }
    if (withConfirmedOutcome.length === 0) {
      warnings.push(
        `RTO is assumed at ${assumptions.assumed_rto_rate}%, not measured — mark outcomes manually or connect a courier feed (S2)`
      );
    }

    return {
      kpis: {
        orders: total,
        netRevenue: round2(withCogsRows.reduce((s, r) => s + Number(r.netRevenue), 0)),
        contributionMargin: round2(cmSum),
        cmPercent: cmPercent === null ? null : round2(cmPercent),
        cmPerOrder: cmAvg === null ? null : round2(cmAvg),
        prepaidShare: round2(prepaidShare * 100),
        rtoRate: round2(rtoRate * 100),
        maxCac: expectedCM > 0 ? round2(expectedCM) : 0,
        breakEvenRoas: breakEvenRoas(netRevenueSum, cmSum),
      },
      coverage: {
        withCogs: total ? round2(withCogsRows.length / total) : 0,
        withConfirmedOutcome: total ? round2(withConfirmedOutcome.length / total) : 0,
        assumedRtoRate: assumptions.assumed_rto_rate,
      },
      warnings,
    };
  }

  /**
   * Per-SKU profit table (spec §6). SKU granularity S1: order-level grouped
   * by orderNumber is not meaningful — we surface per-order rows that carry
   * CM and let the operator drill in. SKU-level arrives with S2 (line-item
   * allocation, spec §8).
   */
  async orders(from?: string, to?: string, filter?: string, page = 1, limit = 25): Promise<any> {
    const where: any = {};
    if (from || to) {
      where.placedAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    if (filter === 'cod') where.isCod = true;
    if (filter === 'prepaid') where.isCod = false;
    if (filter === 'rto') where.outcome = 'RTO';
    if (filter === 'no_cogs') where.dataQuality = 'no_cogs';

    const [total, items] = await Promise.all([
      prisma.orderEconomics.count({ where }),
      prisma.orderEconomics.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { orders: items, pagination: { page, limit, total } };
  }

  /**
   * Campaign profit — spend vs real contribution (spec §6 + honesty rule #3:
   * sorted by contribution, not ROAS).
   */
  async campaigns(from?: string, to?: string): Promise<any[]> {
    const [rows, campaignMap] = await Promise.all([
      this.rows(from, to),
      prisma.campaign.findMany({ select: { id: true, name: true, spend: true, revenue: true, roas: true } }),
    ]);

    const byCampaign = new Map<string, any[]>();
    for (const r of rows) {
      if (!r.campaignId) continue;
      if (!byCampaign.has(r.campaignId)) byCampaign.set(r.campaignId, []);
      byCampaign.get(r.campaignId)!.push(r);
    }

    return campaignMap
      .map((c) => {
        const rs = byCampaign.get(c.id) || [];
        const withCogs = rs.filter((r) => r.dataQuality !== 'no_cogs');
        const cm = withCogs.reduce((s, r) => s + Number(r.contributionMargin), 0);
        const nr = withCogs.reduce((s, r) => s + Number(r.netRevenue), 0);
        const cmPercent = nr > 0 ? (cm / nr) * 100 : 0;
        return {
          campaignId: c.id,
          name: c.name,
          spend: Number(c.spend || 0),
          orders: rs.length,
          codOrders: rs.filter((r) => r.isCod).length,
          roas: c.roas ? Number(c.roas) : null,
          contributionMargin: round2(cm),
          cmPercent: round2(cmPercent),
          verdict: campaignVerdict(cmPercent),
          coverage: rs.length ? round2(withCogs.length / rs.length) : 0,
        };
      })
      .sort((a, b) => b.contributionMargin - a.contributionMargin); // rule #3
  }

  /**
   * Manual outcome marking (T6 stopgap for RTO before courier feed exists).
   * Marks outcomeConfirmed=true so warnings stop calling it an assumption.
   */
  async setOutcome(orderEconomicsId: string, outcome: OrderOutcome, confirmedBy?: string): Promise<any> {
    const row = await prisma.orderEconomics.findUnique({ where: { id: orderEconomicsId } });
    if (!row) throw new Error('Order not found');
    const assumptions = await this.getAssumptions();

    const computed = computeOrderEconomics(
      {
        isCod: row.isCod,
        grossRevenue: Number(row.grossRevenue),
        discountAmount: Number(row.discountAmount),
        taxAmount: Number(row.taxAmount),
        shippingCharged: Number(row.shippingCharged),
        refundedAmount: Number(row.refundedAmount),
        cogsAmount: row.dataQuality === 'no_cogs' ? NaN : Number(row.cogsAmount),
        outcome,
      },
      assumptions
    );

    const updated = await prisma.orderEconomics.update({
      where: { id: orderEconomicsId },
      data: {
        outcome,
        outcomeConfirmed: true,
        contributionMargin: computed.contributionMargin,
      },
    });

    const { auditService } = await import('./audit.service');
    await auditService.log({
      action: 'ORDER_OUTCOME_SET',
      entityType: 'order_economics',
      entityId: orderEconomicsId,
      userId: confirmedBy,
      changes: { outcome },
    });
    return updated;
  }

  /**
   * Recompute all rows after cost assumptions change (spec §6 recompute).
   */
  async recompute(from?: string, to?: string): Promise<number> {
    const [rows, assumptions] = await Promise.all([this.rows(from, to), this.getAssumptions()]);
    for (const row of rows) {
      const computed = computeOrderEconomics(
        {
          isCod: row.isCod,
          grossRevenue: Number(row.grossRevenue),
          discountAmount: Number(row.discountAmount),
          taxAmount: Number(row.taxAmount),
          shippingCharged: Number(row.shippingCharged),
          refundedAmount: Number(row.refundedAmount),
          cogsAmount: row.dataQuality === 'no_cogs' ? NaN : Number(row.cogsAmount),
          outcome: row.outcome as OrderOutcome,
        },
        assumptions
      );
      await prisma.orderEconomics.update({
        where: { id: row.id },
        data: {
          paymentFeeAmount: computed.paymentFeeAmount,
          codFeeAmount: computed.codFeeAmount,
          packagingCost: computed.packagingCost,
          forwardShipCost: computed.forwardShipCost,
          returnShipCost: computed.returnShipCost,
          rtoHandlingCost: computed.rtoHandlingCost,
          netRevenue: computed.netRevenue,
          contributionMargin: computed.contributionMargin,
        },
      });
    }
    return rows.length;
  }

  /** Cost assumptions CRUD. */
  async listAssumptions() {
    return prisma.costAssumption.findMany({ orderBy: { key: 'asc' } });
  }

  async updateAssumption(key: string, value: number): Promise<any> {
    const row = await prisma.costAssumption.update({ where: { key }, data: { value } });
    const { auditService } = await import('./audit.service');
    await auditService.log({
      action: 'COST_ASSUMPTION_UPDATED',
      entityType: 'cost_assumption',
      entityId: key,
      changes: { value },
    });
    return row;
  }
}

function avg(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const profitService = new ProfitService();
export default profitService;
