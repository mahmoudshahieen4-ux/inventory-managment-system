import { beforeEach, describe, expect, it } from 'vitest'

import { useCartStore } from '@/store/useCartStore'
import { useHeldInvoicesStore } from './useHeldInvoicesStore'

const cartItem = {
  productId: 'prod-test',
  sku: 'TEST-1',
  name: 'Test Product',
  purchasePrice: 2,
  unitPrice: 4,
  quantity: 2,
  unit: 'box' as const,
}

describe('useHeldInvoicesStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useCartStore.setState({ items: [] })
    useHeldInvoicesStore.setState({
      heldInvoices: [],
      activeHeldInvoiceId: null,
    })
  })

  it('holds the current cart with optional details and clears the cart', async () => {
    useCartStore.setState({ items: [cartItem] })

    expect(
      await useHeldInvoicesStore
        .getState()
        .holdCurrentCart('Samira', 'Call before delivery')
    ).toBe(true)

    expect(useCartStore.getState().items).toEqual([])
    expect(useHeldInvoicesStore.getState().heldInvoices[0]).toMatchObject({
      customerName: 'Samira',
      notes: 'Call before delivery',
      items: [cartItem],
      subtotal: 8,
      totalAmount: 8,
    })
  })

  it('does not overwrite a non-empty cart while resuming', async () => {
    useCartStore.setState({ items: [cartItem] })
    useHeldInvoicesStore.setState({
      heldInvoices: [
        {
          id: 'held-1',
          items: [cartItem],
          subtotal: 8,
          totalAmount: 8,
          createdAt: new Date().toISOString(),
        },
      ],
    })

    expect(
      await useHeldInvoicesStore.getState().resumeHeldInvoice('held-1')
    ).toBe(false)
    expect(useCartStore.getState().items).toEqual([cartItem])
  })

  it('resumes into the cart and removes the invoice from the held list', async () => {
    useHeldInvoicesStore.setState({
      heldInvoices: [
        {
          id: 'held-2',
          items: [cartItem],
          subtotal: 8,
          totalAmount: 8,
          createdAt: new Date().toISOString(),
        },
      ],
    })

    expect(
      await useHeldInvoicesStore.getState().resumeHeldInvoice('held-2')
    ).toBe(true)
    expect(useCartStore.getState().items).toEqual([cartItem])
    expect(useHeldInvoicesStore.getState().heldInvoices).toEqual([])
    expect(useHeldInvoicesStore.getState().activeHeldInvoiceId).toBe('held-2')
  })
})
