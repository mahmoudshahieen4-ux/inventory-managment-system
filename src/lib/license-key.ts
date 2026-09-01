/**
 * Offline serial-key validator/generator.
 *
 * Key layout (16 hex digits, displayed XXXX-XXXX-XXXX-XXXX):
 *   [machineId 8][expiryDays 5][type 1][checksum 2]
 * - machineId: the first 8 hex chars of the machine fingerprint
 * - expiryDays: days since the Unix epoch when the license expires
 * - type: 0 = full license (trials are handled in-app, not by keys)
 * - checksum: (sum of hex values of the first 14 chars + MAGIC) mod 256
 */

const DAY_MS = 86_400_000
const KEY_MAGIC = 0x5a
const HEX_PATTERN = /^[0-9A-F]{16}$/

export type LicenseKeyError =
  | 'FORMAT'
  | 'CHECKSUM'
  | 'MACHINE_MISMATCH'
  | 'EXPIRED'

export interface LicenseKeyValidation {
  valid: boolean
  error?: LicenseKeyError
  /** ISO expiration date encoded in the key (only when valid). */
  expirationDate?: string
}

/** Strips separators and groups a raw key as XXXX-XXXX-XXXX-XXXX. */
export function formatLicenseKey(raw: string): string {
  const hex = raw
    .replace(/[^0-9a-fA-F]/g, '')
    .toUpperCase()
    .slice(0, 16)
  return (hex.match(/.{1,4}/g) ?? []).join('-')
}

function checksum(body: string): string {
  let sum = KEY_MAGIC
  for (const char of body) {
    sum += parseInt(char, 16)
  }
  return (sum % 256).toString(16).padStart(2, '0').toUpperCase()
}

/** Vendor-side utility: builds a key bound to `machineId` expiring at `expirationDate`. */
export function generateLicenseKey(
  machineId: string,
  expirationDate: Date
): string {
  const days = Math.floor(expirationDate.getTime() / DAY_MS)
  const daysHex = days.toString(16).toUpperCase().padStart(5, '0')
  const body = machineId + daysHex + '0'
  return formatLicenseKey(body + checksum(body))
}

/** Validates a serial key against this machine and the current time. */
export function validateLicenseKey(
  rawKey: string,
  machineId: string,
  now: Date = new Date()
): LicenseKeyValidation {
  const hex = rawKey.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  if (!HEX_PATTERN.test(hex)) return { valid: false, error: 'FORMAT' }

  const body = hex.slice(0, 14)
  if (checksum(body) !== hex.slice(14))
    return { valid: false, error: 'CHECKSUM' }
  if (body.slice(0, 8) !== machineId.toUpperCase()) {
    return { valid: false, error: 'MACHINE_MISMATCH' }
  }
  if (body.slice(13, 14) !== '0') return { valid: false, error: 'FORMAT' }

  const expirationDate = new Date(parseInt(body.slice(8, 13), 16) * DAY_MS)
  if (expirationDate.getTime() <= now.getTime()) {
    return { valid: false, error: 'EXPIRED' }
  }
  return { valid: true, expirationDate: expirationDate.toISOString() }
}
