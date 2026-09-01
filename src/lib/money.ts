/** Formats an amount as USD currency with two decimals (e.g. $12.50). */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}
