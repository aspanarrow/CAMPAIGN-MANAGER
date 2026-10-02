import { PrismaClient } from '@prisma/client';

/**
 * Seed the CostAssumption table with India D2C defaults (NINA C1 spec §3).
 *
 * These are PLACEHOLDERS — the operator must tune them to their real numbers
 * via the settings page (PATCH /api/costs). No rupee value may be hard-coded
 * in a service; this table is the single source of truth.
 *
 * Run: npx prisma db seed
 */

const prisma = new PrismaClient();

const DEFAULTS: { key: string; value: number; unit: string; note: string }[] = [
  {
    key: 'payment_fee_percent_prepaid',
    value: 2.0,
    unit: 'percent',
    note: 'Razorpay/PayU MDR for prepaid orders',
  },
  {
    key: 'payment_fee_percent_cod',
    value: 0,
    unit: 'percent',
    note: 'Payment gateway fee on COD (usually 0 — courier collects)',
  },
  {
    key: 'cod_fee_percent',
    value: 2.5,
    unit: 'percent',
    note: 'Courier COD collection fee (% of net revenue)',
  },
  {
    key: 'cod_fee_flat',
    value: 0,
    unit: 'inr_per_order',
    note: 'Flat COD handling fee per order',
  },
  {
    key: 'packaging_per_order',
    value: 12,
    unit: 'inr_per_order',
    note: 'Box + tape + insert',
  },
  {
    key: 'forward_ship_per_order',
    value: 65,
    unit: 'inr_per_order',
    note: 'S1 estimate for forward shipping; replace with real courier rates in S2',
  },
  {
    key: 'return_ship_per_order',
    value: 65,
    unit: 'inr_per_order',
    note: 'Reverse logistics cost per RTO/return; S1 estimate',
  },
  {
    key: 'rto_handling_per_order',
    value: 25,
    unit: 'inr_per_order',
    note: 'Restocking + damage handling for RTO',
  },
  {
    key: 'tax_inclusive_pricing',
    value: 1,
    unit: 'boolean',
    note: '1 = Shopify taxesIncluded (do NOT subtract tax from revenue)',
  },
  {
    key: 'assumed_rto_rate',
    value: 25,
    unit: 'percent',
    note: 'S1 assumption until courier feed exists — shown as ASSUMED in UI',
  },
];

async function main() {
  for (const d of DEFAULTS) {
    await prisma.costAssumption.upsert({
      where: { key: d.key },
      update: {}, // never overwrite operator-tuned values
      create: {
        key: d.key,
        value: d.value,
        unit: d.unit,
        note: d.note,
      },
    });
  }
  console.log(`Seeded ${DEFAULTS.length} cost assumptions`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
