/**
 * Currency formatting helpers.
 *
 * The app targets Indian merchants (Shopify store currency = INR), so all
 * amounts are displayed in Indian Rupees with the Indian digit grouping
 * (e.g. ₹1,00,000.00).
 */

export const CURRENCY_CODE = 'INR';
export const CURRENCY_SYMBOL = '₹';
export const LOCALE = 'en-IN';

/**
 * Format a numeric amount as Indian Rupees.
 */
export function formatCurrency(amount: number | string | null | undefined): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount ?? 0;
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY_CODE,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value as number) ? (value as number) : 0);
}

/**
 * Format a plain number using Indian digit grouping (no currency symbol).
 */
export function formatNumber(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  return new Intl.NumberFormat(LOCALE).format(Number.isFinite(num as number) ? (num as number) : 0);
}
