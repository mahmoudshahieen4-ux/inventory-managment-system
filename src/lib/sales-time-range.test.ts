import { describe, expect, it } from 'vitest'
import { cutoffForRange } from './sales-time-range'
import type { TimeRange } from '@/types/analytics'

describe('sales time ranges', () => {
  it.each<[TimeRange, number]>([
    ['TODAY', 0],
    ['1_WEEK', 7],
    ['1_MONTH', 30],
    ['3_MONTHS', 90],
    ['6_MONTHS', 180],
  ])('%s starts at local midnight %i days ago', (range, days) => {
    const now = new Date(2026, 0, 3, 15, 42, 31)
    const expected = new Date(2026, 0, 3 - days)
    const result = cutoffForRange(range, now)
    expect(result).toBe(expected.toISOString())
    expect(now.getHours()).toBe(15)
    const cutoff = Date.parse(result)
    expect(Date.parse(expected.toISOString()) >= cutoff).toBe(true)
    expect(expected.getTime() - 1 >= cutoff).toBe(false)
  })

  it('uses local calendar arithmetic across a DST transition', () => {
    expect(cutoffForRange('1_WEEK', new Date(2026, 2, 10, 16))).toBe(
      new Date(2026, 2, 3).toISOString()
    )
  })
})
