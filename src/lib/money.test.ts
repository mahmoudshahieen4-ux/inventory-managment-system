import { describe, expect, it } from 'vitest'

import { EGP_SYMBOL, formatMoney, roundMoney } from './money'

describe('roundMoney', () => {
  it('rounds to two decimals, killing binary float drift', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754.
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(2.675)).toBe(2.68)
  })

  it('keeps exact values untouched', () => {
    expect(roundMoney(10)).toBe(10)
    expect(roundMoney(12.5)).toBe(12.5)
    expect(roundMoney(0)).toBe(0)
  })

  it('handles negatives (refunds/credit notes)', () => {
    expect(roundMoney(-0.1 - 0.2)).toBe(-0.3)
    expect(roundMoney(-1.005)).toBe(-1.01)
  })
})

describe('formatMoney', () => {
  it('formats two decimals with the EGP suffix', () => {
    expect(formatMoney(5.23)).toBe(`5.23 ${EGP_SYMBOL}`)
    expect(formatMoney(roundMoney(0.1 + 0.2))).toBe(`0.30 ${EGP_SYMBOL}`)
  })
})
