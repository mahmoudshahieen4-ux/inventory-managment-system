import { beforeEach, describe, expect, it } from 'vitest'

import type { SaleItem } from '@/types/sales'
import { useSalesStore } from './useSalesStore'

const items: SaleItem[] = [
  {
    productId: 'prod-1',
    sku: 'SNK-004',
    name: 'Dark Chocolate Bar',
    unitPrice: 2.49,
    quantity: 2,
    lineTotal: 4.98,
  },
]

describe('useSalesStore', () => {
  beforeEach(() => {
    useSalesStore.setState({ sales: [] })
  })

  it('starts with an empty sales list', () => {
    expect(useSalesStore.getState().sales).toEqual([])
  })

  it('records a sale with a generated id, invoice number and timestamp', () => {
    const sale = useSalesStore.getState().addSale({
      items,
      subtotal: 4.98,
      tax: 0.25,
      total: 5.23,
      cashierId: 'CASHIER',
    })

    expect(sale.id).toBeTruthy()
    expect(sale.invoiceNumber).toBe('INV-0001')
    expect(Number.isNaN(Date.parse(sale.createdAt))).toBe(false)
    expect(sale.items).toEqual(items)
    expect(useSalesStore.getState().sales).toEqual([sale])
  })

  it('assigns sequential invoice numbers and prepends newer sales', () => {
    const { addSale } = useSalesStore.getState()
    const first = addSale({
      items,
      subtotal: 4.98,
      tax: 0.25,
      total: 5.23,
      cashierId: 'ADMIN',
    })
    const second = addSale({
      items,
      subtotal: 4.98,
      tax: 0.25,
      total: 5.23,
      cashierId: 'ADMIN',
    })

    expect(first.invoiceNumber).toBe('INV-0001')
    expect(second.invoiceNumber).toBe('INV-0002')

    const sales = useSalesStore.getState().sales
    expect(sales).toHaveLength(2)
    expect(sales.at(0)?.id).toBe(second.id)
    expect(sales.at(1)?.id).toBe(first.id)
  })

  it('retrieves a stored invoice by id for re-printing', () => {
    const { addSale } = useSalesStore.getState()
    const sale = addSale({
      items,
      subtotal: 4.98,
      tax: 0.25,
      total: 5.23,
      cashierId: 'ADMIN',
    })

    expect(useSalesStore.getState().getSaleById(sale.id)).toEqual(sale)
  })

  it('returns undefined for an unknown invoice id', () => {
    expect(useSalesStore.getState().getSaleById('missing')).toBeUndefined()
  })
})
