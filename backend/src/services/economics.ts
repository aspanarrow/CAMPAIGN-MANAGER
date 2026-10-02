/**
 * Pure India unit-economics calculator (NINA C1 spec §4).
 *
 * ZERO side effects, ZERO database access — a pure function over inputs so it
 * can be unit-tested and so history can be recomputed whenever cost
 * assumptions change (POST /api/profit/recompute).
 *
 * Design rule from the spec: no rupee value is hard-coded here. Every
 * assumption arrives via CostAssumption rows, loaded by the caller.
 */

export type OrderOutcome = 'PENDING' | 'DELIVERED' | 'RTO' | 'RETURNED' | 'CANCELLED';

export interface CostAssumptions {
  payment_fee_percent_prepaid: number;
  payment_fee_percent_cod: number;
  cod_fee_percent: number;
  cod_fee_flat: number;
  packaging_per_order: number;
  forward_ship_per_order: number;
  return_ship_per_order: number;
  rto_handling_per_order: number;
  tax_inclusive_pricing: number; // 1 = taxesIncluded (do NOT subtract tax)
  assumed_rto_rate: number;      // percent, S1 assumption only
}

export interface OrderInput {
  isCod: boolean;
  grossRevenue: number;     // currentTotalPriceSet
  discountAmount: number;   // totalDiscountsSet
  taxAmount: number;        // totalTaxSet
  shippingCharged: number;  // totalShippingPriceSet
  refundedAmount: number;   // totalRefundedSet
  cogsAmount: number;       // sum(unitCost * qty); NaN/null = missing
  outcome: OrderOutcome;
}

export interface OrderComputed {
  netRevenue: number;
  paymentFeeAmount: number;
  codFeeAmount: number;
  packagingCost: number;
  forwardShipCost: number;
  returnShipCost: number;
  rtoHandlingCost: number;
  contributionMargin: number;
  dataQuality: 'complete' | 'no_cogs';
}

/** Per-order economics. CM per outcome (spec §4). */
export function computeOrderEconomics(input: OrderInput, a: CostAssumptions): OrderComputed {
  const missingCogs = input.cogsAmount === null || input.cogsAmount === undefined || Number.isNaN(input.cogsAmount);

  // netRevenue = gross - discounts - tax + shipping   (skip tax if tax-inclusive)
  const taxTerm = a.tax_inclusive_pricing === 1 ? 0 : input.taxAmount;
  const netRevenue = input.grossRevenue - input.discountAmount - taxTerm + input.shippingCharged;

  const paymentFee =
    netRevenue * (input.isCod ? a.payment_fee_percent_cod : a.payment_fee_percent_prepaid) / 100;

  const codFee = input.isCod
    ? (netRevenue * a.cod_fee_percent) / 100 + a.cod_fee_flat
    : 0;

  const packaging = a.packaging_per_order;
  const forwardShip = a.forward_ship_per_order;
  const returnShip = a.return_ship_per_order;
  const rtoHandling = a.rto_handling_per_order;

  const cogs = missingCogs ? 0 : (input.cogsAmount as number);

  // CM_delivered = netRevenue - refunded - cogs - paymentFee - codFee - packaging - forwardShip
  const cmDelivered =
    netRevenue - input.refundedAmount - cogs - paymentFee - codFee - packaging - forwardShip;

  // CM_rto = -(forwardShip + returnShip + packaging + rtoHandling) - refunded(if any)   always <= 0
  const cmRto = -(forwardShip + returnShip + packaging + rtoHandling) - input.refundedAmount;

  // CM_returned = CM_delivered - returnShip - rtoHandling
  const cmReturned = cmDelivered - returnShip - rtoHandling;

  let contributionMargin: number;
  switch (input.outcome) {
    case 'DELIVERED':
      contributionMargin = cmDelivered;
      break;
    case 'RTO':
      contributionMargin = cmRto;
      break;
    case 'RETURNED':
      contributionMargin = cmReturned;
      break;
    case 'PENDING':
      contributionMargin = cmDelivered; // estimate until courier confirms
      break;
    case 'CANCELLED':
    default:
      contributionMargin = 0; // ad spend already burned — shown as CAC loss elsewhere
      break;
  }

  return {
    netRevenue,
    paymentFeeAmount: paymentFee,
    codFeeAmount: codFee,
    packagingCost: packaging,
    forwardShipCost: forwardShip,
    returnShipCost: returnShip,
    rtoHandlingCost: rtoHandling,
    contributionMargin,
    dataQuality: missingCogs ? 'no_cogs' : 'complete',
  };
}

/** Detect COD from Shopify payment gateway names (spec §5). */
export function detectCod(gatewayNames: string[], financialStatus: string): boolean {
  const gw = (gatewayNames || []).join(' ').toLowerCase();
  return (
    gw.includes('cod') ||
    gw.includes('cash on delivery') ||
    gw.includes('manual') ||
    (financialStatus === 'PENDING' && gw.length > 0)
  );
}

/**
 * Aggregate helpers (spec §4 "the two numbers that actually matter").
 * Callers pass rows that already have CM computed. `withCogsRows` is used
 * for the honest CM average; coverage is reported alongside it.
 */
export interface CampaignProfitRow {
  spend: number;
  netRevenue: number;
  contributionMargin: number;
  orders: number;
  codOrders: number;
  deliveredOrders: number;
  rtoOrders: number;
  rowsWithCogs: number;
}

export function breakEvenRoas(netRevenue: number, cm: number): number | null {
  // breakEvenROAS = netRevenue / CM (spec §4)
  if (cm <= 0) return null; // not breakable — losing money at any spend
  return Number((netRevenue / cm).toFixed(2));
}

export function campaignVerdict(cmPercent: number): 'Losing money' | 'Thin' | 'Healthy' {
  if (cmPercent < 0) return 'Losing money';
  if (cmPercent < 15) return 'Thin';
  return 'Healthy';
}

/**
 * Blended expected CM per order (spec §4). The regression test target:
 * 70% prepaid / 30% COD @ 25% RTO must produce a LOWER maxCAC than 100% prepaid.
 */
export function expectedCmPerOrder(params: {
  prepaidShare: number;
  codShare: number;
  rtoRate: number; // 0..1
  cmPrepaidAvg: number;
  cmCodDeliveredAvg: number;
  cmRtoAvg: number;
}): number {
  const { prepaidShare, codShare, rtoRate, cmPrepaidAvg, cmCodDeliveredAvg, cmRtoAvg } = params;
  return (
    prepaidShare * cmPrepaidAvg +
    codShare * ((1 - rtoRate) * cmCodDeliveredAvg + rtoRate * cmRtoAvg)
  );
}
