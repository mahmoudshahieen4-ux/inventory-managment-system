import { describe, expect, it } from 'vitest'

import { formatLicenseKey } from './license-key'

describe('formatLicenseKey', () => {
  it('removes pasted whitespace without altering a case-sensitive token', () => {
    const token = 'eyJMaWNlbnNlIjoiQWJDIn0.AaBb_09-xY'

    expect(formatLicenseKey(` \n${token}\t `)).toBe(token)
  })

  it('returns an empty string for whitespace-only input', () => {
    expect(formatLicenseKey('  \n\t')).toBe('')
  })
})
