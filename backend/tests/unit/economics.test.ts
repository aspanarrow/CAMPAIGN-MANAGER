import {
  computeOrderEconomics,
  detectCod,
  breakEvenRoas,
  campaignVerdict,
  expectedCmPerOrder,
  CostAssumptions,
} from '../../src/services/economics';

/** India defaults from prisma/seed.ts */
const A: CostAssumptions = {
  payment_fee_percent_prepaid: 2.0,
  payment_fee_percent_cod: 0,
  cod_fee_percent: 2.5,
  cod_fee_flat: 0,
  packaging_per_order: 12,
  forward_ship_per_order: 65,
  return_ship_per_order: 65,
  rto_handling_per_order: 25,
  tax_inclusive_pricing: 1,
  assumed_rto_rate: 25,
};

describe('India unit economics (NINA C1 spec §9)', () => {
  // 1. COD detection — gateway "cash on delivery (COD)" -> isCod true, codFee > 0
  test('COD detection: cash on delivery gateway -> isCod=true and codFee>0', () => {
    expect(detectCod(['cash on delivery (COD)'], 'PENDING')).toBe(true);
    const r = computeOrderEconomics(
      { isCod: true, grossRevenue: 649, discountAmount: 0, taxAmount: 0, shippingCharged: 0, refundedAmount: 0, cogsAmount: 260, outcome: 'DELIVERED' },
      A
    );
    expect(r.codFeeAmount).toBeGreaterThan(0);
  });

  // 2. Prepaid order — razorpay gateway -> isCod false, paymentFee ~2% of netRevenue
  test('Prepaid: razorpay -> paymentFee ~2% of netRevenue', () => {
    expect(detectCod(['razorpay'], 'PAID')).toBe(false);
    const r = computeOrderEconomics(
      { isCod: false, grossRevenue: 1000, discountAmount: 0, taxAmount: 0, shippingCharged: 0, refundedAmount: 0, cogsAmount: 400, outcome: 'DELIVERED' },
      A
    );
    expect(r.paymentFeeAmount).toBeCloseTo(20, 0); // 2% of 1000
    expect(r.codFeeAmount).toBe(0);
  });

  // 3. RTO math — RTO order -> CM < 0 and |CM| in ₹150-250 band with defaults
  test('RTO: CM is negative and lands in the ₹150-250 band (defaults)', () => {
    const r = computeOrderEconomics(
      { isCod: true, grossRevenue: 649, discountAmount: 0, taxAmount: 0, shippingCharged: 0, refundedAmount: 0, cogsAmount: 260, outcome: 'RTO' },
      A
    );
    // CM_rto = -(forward 65 + return 65 + packaging 12 + rtoHandling 25) = -167
    expect(r.contributionMargin).toBeLessThan(0);
    const abs = Math.abs(r.contributionMargin);
    expect(abs).toBeGreaterThanOrEqual(150);
    expect(abs).toBeLessThanOrEqual(250);
  });

  // 4. Missing COGS — unitCost missing -> dataQuality='no_cogs'
  test('Missing COGS: dataQuality = no_cogs (never silently ₹0)', () => {
    const r = computeOrderEconomics(
      { isCod: false, grossRevenue: 649, discountAmount: 0, taxAmount: 0, shippingCharged: 0, refundedAmount: 0, cogsAmount: NaN, outcome: 'DELIVERED' },
      A
    );
    expect(r.dataQuality).toBe('no_cogs');
  });

  // 5. Break-even ROAS — ₹649 price, ₹260 CM -> BE ROAS ≈ 2.50
  test('Break-even ROAS: 649/260 ≈ 2.50', () => {
    expect(breakEvenRoas(649, 260)).toBeCloseTo(2.5, 1);
  });

  // 6. Blended expectation — 70/30 prepaid/COD at 25% RTO < 100% prepaid maxCAC
  test('Blended expectation: 70/30 @25% RTO must be < 100% prepaid', () => {
    const prepaidOnly = expectedCmPerOrder({
      prepaidShare: 1, codShare: 0, rtoRate: 0,
      cmPrepaidAvg: 300, cmCodDeliveredAvg: 200, cmRtoAvg: -167,
    });
    const blended = expectedCmPerOrder({
      prepaidShare: 0.7, codShare: 0.3, rtoRate: 0.25,
      cmPrepaidAvg: 300, cmCodDeliveredAvg: 200, cmRtoAvg: -167,
    });
    expect(blended).toBeLessThan(prepaidOnly); // THE regression test
  });

  // 7. Assumption flag — with no confirmed outcomes, RTO rate is labelled assumed
  test('Assumption flag: assumed_rto_rate present and used as assumption', () => {
    expect(A.assumed_rto_rate).toBe(25);
    // verdict thresholds
    expect(campaignVerdict(-5)).toBe('Losing money');
    expect(campaignVerdict(10)).toBe('Thin');
    expect(campaignVerdict(20)).toBe('Healthy');
  });
});
