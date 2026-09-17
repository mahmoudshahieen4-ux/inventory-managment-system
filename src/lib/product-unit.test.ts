import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PRODUCT_UNIT,
  PRODUCT_UNIT_VALUES,
  isCartonUnit,
  normalizeProductUnit,
  resolveProductUnit,
  resolveUnitsPerCarton,
} from './product-unit'

describe('product unit helpers', () => {
  it('normalizes blank and missing units to an empty string', () => {
    expect(normalizeProductUnit(undefined)).toBe('')
    expect(normalizeProductUnit(null)).toBe('')
    expect(normalizeProductUnit('  ')).toBe('')
    expect(normalizeProductUnit(' علبة ')).toBe('علبة')
  })

  it('always resolves to a usable unit, defaulting to pieces', () => {
    expect(DEFAULT_PRODUCT_UNIT).toBe('قطعة')
    expect(resolveProductUnit(undefined)).toBe('قطعة')
    expect(resolveProductUnit(null)).toBe('قطعة')
    expect(resolveProductUnit('   ')).toBe('قطعة')
    expect(resolveProductUnit('كرتونة')).toBe('كرتونة')
  })

  it('stores canonical, language-neutral unit values', () => {
    expect(PRODUCT_UNIT_VALUES.PIECE).toBe('قطعة')
    expect(PRODUCT_UNIT_VALUES.BOX).toBe('علبة')
    expect(PRODUCT_UNIT_VALUES.CARTON).toBe('كرتونة')
  })

  it('detects carton units', () => {
    expect(isCartonUnit('كرتونة')).toBe(true)
    expect(isCartonUnit(' كرتونة ')).toBe(true)
    expect(isCartonUnit('علبة')).toBe(false)
    expect(isCartonUnit(undefined)).toBe(false)
  })

  it('returns the box count only for cartons with a positive count', () => {
    expect(resolveUnitsPerCarton({ unit: 'كرتونة', unitsPerCarton: 12 })).toBe(
      12
    )
    expect(
      resolveUnitsPerCarton({ unit: 'كرتونة', unitsPerCarton: 0 })
    ).toBeUndefined()
    expect(
      resolveUnitsPerCarton({ unit: 'كرتونة', unitsPerCarton: -3 })
    ).toBeUndefined()
    expect(
      resolveUnitsPerCarton({ unit: 'علبة', unitsPerCarton: 12 })
    ).toBeUndefined()
    expect(
      resolveUnitsPerCarton({ unit: 'كرتونة', unitsPerCarton: undefined })
    ).toBeUndefined()
  })
})
