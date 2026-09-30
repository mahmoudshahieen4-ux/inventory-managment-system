import { describe, expect, it } from 'vitest'

import { getExpiryStatus } from './expiry-alert'

describe('expiry alerts', () => {
  const now = new Date('2026-09-30T12:00:00')

  it('ignores null and invalid expiry dates', () => {
    expect(getExpiryStatus(null, now)).toBe('OK')
    expect(getExpiryStatus('not-a-date', now)).toBe('OK')
  })

  it('distinguishes expired, soon, and clean batches', () => {
    expect(getExpiryStatus('2026-09-29', now)).toBe('EXPIRED')
    expect(getExpiryStatus('2026-10-20', now)).toBe('EXPIRING_SOON')
    expect(getExpiryStatus('2026-12-31', now)).toBe('OK')
  })
})
