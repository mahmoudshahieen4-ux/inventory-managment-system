import { describe, it, expect } from 'vitest'
import { getStockStatus } from './stock-status'

describe('getStockStatus', () => {
  it('returns OUT_OF_STOCK when quantity is zero', () => {
    expect(getStockStatus(0, 5)).toBe('OUT_OF_STOCK')
  })

  it('returns OUT_OF_STOCK when quantity is negative', () => {
    expect(getStockStatus(-3, 10)).toBe('OUT_OF_STOCK')
  })

  it('returns LOW_STOCK when quantity is above zero and below threshold', () => {
    expect(getStockStatus(3, 10)).toBe('LOW_STOCK')
  })

  it('returns LOW_STOCK when quantity exactly equals the threshold', () => {
    expect(getStockStatus(10, 10)).toBe('LOW_STOCK')
  })

  it('returns LOW_STOCK for a single unit at a one-unit threshold', () => {
    expect(getStockStatus(1, 1)).toBe('LOW_STOCK')
  })

  it('returns IN_STOCK when quantity is above the threshold', () => {
    expect(getStockStatus(25, 10)).toBe('IN_STOCK')
  })

  it('returns IN_STOCK when threshold is zero and quantity is positive', () => {
    expect(getStockStatus(5, 0)).toBe('IN_STOCK')
  })
})
