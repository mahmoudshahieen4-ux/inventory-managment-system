import { describe, expect, it } from 'vitest'

import { planFefoDeductions } from './fefo'
import type { ProductBatch } from '@/types/inventory'

const batches: ProductBatch[] = [
  {
    id: 'later',
    productId: 'p1',
    quantity: 8,
    expiryDate: '2027-02-01',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'no-date',
    productId: 'p1',
    quantity: 100,
    expiryDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'first',
    productId: 'p1',
    quantity: 3,
    expiryDate: '2026-12-01',
    createdAt: '2026-01-02T00:00:00.000Z',
  },
]

describe('FEFO batch deduction', () => {
  it('deducts the earliest dated stock first and leaves standard stock alone', () => {
    expect(planFefoDeductions(batches, 6)).toEqual({
      deductions: [
        { batchId: 'first', quantity: 3 },
        { batchId: 'later', quantity: 3 },
      ],
      remainingQuantity: 0,
    })
  })

  it('leaves any shortage for general non-expiring inventory', () => {
    expect(
      planFefoDeductions(
        batches.filter(batch => batch.id === 'first'),
        7
      )
    ).toEqual({
      deductions: [{ batchId: 'first', quantity: 3 }],
      remainingQuantity: 4,
    })
  })
})
