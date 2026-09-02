/** Egyptian Pound symbol used across the UI (e.g. `12.50 ج.م`). */
export const EGP_SYMBOL = 'ج.م'

/**
 * Formats an amount as Egyptian Pounds with two decimals (e.g. `12.50 ج.م`).
 * Uses Western (Latin) digits for maximum legibility in a POS context.
 */
export function formatMoney(value: number): string {
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${formatted} ${EGP_SYMBOL}`
}
