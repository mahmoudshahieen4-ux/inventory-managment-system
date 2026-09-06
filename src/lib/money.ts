/** Egyptian Pound symbol used across the UI (e.g. `12.50 ج.م`). */
export const EGP_SYMBOL = 'ج.م'

/**
 * Rounds to two decimal places — the canonical money-rounding helper for all
 * totals, line items and profit math, so floating-point drift (`0.1 + 0.2`)
 * can never reach a receipt or an invoice stored in SQLite.
 *
 * Uses exponent-notation scaling (`1.005 → "1.005e2" → 100.5`) instead of
 * `value * 100`, because binary floats make `1.005 * 100 === 100.49999999999999`
 * and would round half-up cases like 1.005/2.675 the wrong way. Negatives are
 * rounded half-away-from-zero so refunds/credit notes mirror positive amounts.
 */
export function roundMoney(value: number): number {
  const scaled = Number(`${Math.abs(value)}e2`)
  const magnitude =
    (Number.isNaN(scaled)
      ? Math.round(Math.abs(value) * 100)
      : Math.round(scaled)) / 100
  return value < 0 ? -magnitude : magnitude
}

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
