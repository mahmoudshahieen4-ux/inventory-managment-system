import { describe, expect, it } from 'vitest'

import { deductBoxStock, getTotalBoxStock } from './dual-unit-stock'

describe('dual-unit stock conversion', () => {
  it('deducts directly from loose boxes when enough are available', () => {
    expect(
      deductBoxStock(
        { cartonQuantity: 3, boxQuantity: 8, boxesPerCarton: 12 },
        5
      )
    ).toEqual({ cartonQuantity: 3, boxQuantity: 3 })
  })

  it('unpacks the minimum cartons and retains leftover boxes', () => {
    expect(
      deductBoxStock(
        { cartonQuantity: 2, boxQuantity: 2, boxesPerCarton: 12 },
        13
      )
    ).toEqual({ cartonQuantity: 1, boxQuantity: 1 })
  })

  it('rejects a sale exceeding combined stock', () => {
    expect(
      deductBoxStock(
        { cartonQuantity: 1, boxQuantity: 2, boxesPerCarton: 12 },
        15
      )
    ).toBeNull()
  })

  it('reports the box-equivalent balance', () => {
    expect(
      getTotalBoxStock({
        cartonQuantity: 5,
        boxQuantity: 8,
        boxesPerCarton: 12,
      })
    ).toBe(68)
  })
})
