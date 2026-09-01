import { describe, expect, it } from 'vitest'

import {
  formatLicenseKey,
  generateLicenseKey,
  validateLicenseKey,
} from './license-key'

const MACHINE_ID = 'ABCD1234'
// Keys encode the expiry as whole days (midnight UTC), so tests use midnight dates.
const FUTURE = new Date('2030-06-15T00:00:00.000Z')
const PAST = new Date('2020-01-01T00:00:00.000Z')

describe('license-key', () => {
  it('formats raw hex into grouped XXXX-XXXX-XXXX-XXXX', () => {
    expect(formatLicenseKey('abcd1234ef567890')).toBe('ABCD-1234-EF56-7890')
    expect(formatLicenseKey('ABCD-1234-EF56-7890')).toBe('ABCD-1234-EF56-7890')
    expect(formatLicenseKey('ABCD1234EF567890EXTRA')).toBe(
      'ABCD-1234-EF56-7890'
    )
    expect(formatLicenseKey('xyz!')).toBe('')
  })

  it('generates a key that validates for the matching machine', () => {
    const key = generateLicenseKey(MACHINE_ID, FUTURE)
    const result = validateLicenseKey(
      key,
      MACHINE_ID,
      new Date('2026-01-01T00:00:00.000Z')
    )

    expect(result.valid).toBe(true)
    expect(result.expirationDate).toBe('2030-06-15T00:00:00.000Z')
    expect(key).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/)
  })

  it('rejects keys bound to a different machine', () => {
    const key = generateLicenseKey(MACHINE_ID, FUTURE)

    expect(validateLicenseKey(key, 'FFFFFFFF', new Date()).error).toBe(
      'MACHINE_MISMATCH'
    )
  })

  it('rejects tampered keys via the checksum', () => {
    const key = generateLicenseKey(MACHINE_ID, FUTURE)
    // Tamper on the raw hex (ignoring the dashes) so the key stays well-formed.
    const hex = key.replace(/-/g, '')
    const tampered = formatLicenseKey(`FFCD${hex.slice(4)}`)

    expect(validateLicenseKey(tampered, MACHINE_ID, new Date()).error).toBe(
      'CHECKSUM'
    )
  })

  it('rejects malformed keys with a FORMAT error', () => {
    expect(validateLicenseKey('NOPE', MACHINE_ID).error).toBe('FORMAT')
    expect(validateLicenseKey('ZZZZ-YYYY-XXXX-WWWW', MACHINE_ID).error).toBe(
      'FORMAT'
    )
  })

  it('rejects keys whose encoded expiration date has passed', () => {
    const key = generateLicenseKey(MACHINE_ID, PAST)

    expect(
      validateLicenseKey(key, MACHINE_ID, new Date('2026-01-01T00:00:00.000Z'))
        .error
    ).toBe('EXPIRED')
  })

  it('accepts a key that expires exactly in the future, not in the past', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const key = generateLicenseKey(MACHINE_ID, now)

    // The expiration instant itself is already past (<= now) → EXPIRED
    expect(validateLicenseKey(key, MACHINE_ID, now).error).toBe('EXPIRED')
    // One millisecond before the expiration instant → valid
    expect(
      validateLicenseKey(key, MACHINE_ID, new Date(now.getTime() - 1)).valid
    ).toBe(true)
  })
})
