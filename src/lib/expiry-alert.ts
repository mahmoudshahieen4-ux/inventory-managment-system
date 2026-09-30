export type ExpiryStatus = 'EXPIRED' | 'EXPIRING_SOON' | 'OK'

export function getExpiryStatus(
  expiryDate: string | null | undefined,
  now = new Date(),
  alertWindowDays = 30
): ExpiryStatus {
  if (!expiryDate) return 'OK'
  const expiry = new Date(`${expiryDate}T23:59:59`)
  if (Number.isNaN(expiry.getTime())) return 'OK'
  if (expiry < now) return 'EXPIRED'
  const remainingDays = Math.ceil(
    (expiry.getTime() - now.getTime()) / 86_400_000
  )
  return remainingDays <= alertWindowDays ? 'EXPIRING_SOON' : 'OK'
}
