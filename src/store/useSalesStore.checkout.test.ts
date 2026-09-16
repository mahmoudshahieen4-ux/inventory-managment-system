import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Sale } from '@/types/sales'
import { useSalesStore } from './useSalesStore'

/** The persistence function under test — a controllable, in-Tauri commit. */
const persistSaleAtomicMock = vi.hoisted(() =>
  vi.fn<(sale: Sale, stockUpdates: unknown[]) => Promise<void>>()
)

/** Keeps the real db helpers, but claims the desktop runtime and stubs the commit. */
vi.mock('@/services/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/services/db')
  return {
    ...actual,
    isTauriRuntime: () => true,
    persistSaleAtomic: persistSaleAtomicMock,
  }
})

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))

vi.mock('sonner', () => ({
  toast: { error: toastError, success: vi.fn(), info: vi.fn() },
}))

const cartItems = [
  {
    productId: 'prod-004',
    sku: 'SNK-004',
    name: 'Dark Chocolate Bar',
    purchasePrice: 1.2,
    unitPrice: 2.49,
    quantity: 2,
    lineTotal: 4.98,
    profit: 2.58,
  },
]

/** The sale payload CartSummary hands to the store (id/invoice come from the store). */
const saleInput = {
  items: cartItems,
  subtotal: 4.98,
  tax: 0,
  total: 4.98,
  cashierId: 'cashier',
}

describe('useSalesStore · checkout submission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    persistSaleAtomicMock.mockResolvedValue(undefined)
    useSalesStore.setState({
      sales: [],
      creditNotes: [],
      isSubmitting: false,
      _nextInvoiceSeq: 1,
      _nextCreditNoteSeq: 1,
    })
  })

  it('holds isSubmitting while the commit is in flight and lists the sale after it settles', async () => {
    let releaseCommit: (() => void) | undefined
    persistSaleAtomicMock.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          releaseCommit = resolve
        })
    )

    const pending = useSalesStore.getState().submitSale(saleInput, [])

    // Loading state is raised before the first await, so a double click lands
    // while the flag is already set.
    expect(useSalesStore.getState().isSubmitting).toBe(true)
    expect(useSalesStore.getState().sales).toHaveLength(0)

    releaseCommit?.()
    const sale = await pending

    expect(sale?.invoiceNumber).toBe('INV-0001')
    expect(useSalesStore.getState().isSubmitting).toBe(false)
    expect(useSalesStore.getState().sales).toHaveLength(1)
  })

  it('ignores a second submission while one is still committing', async () => {
    let releaseCommit: (() => void) | undefined
    persistSaleAtomicMock.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          releaseCommit = resolve
        })
    )

    const first = useSalesStore.getState().submitSale(saleInput, [])
    const second = await useSalesStore.getState().submitSale(saleInput, [])

    expect(second).toBeNull()
    expect(persistSaleAtomicMock).toHaveBeenCalledTimes(1)

    releaseCommit?.()
    await first
    expect(useSalesStore.getState().sales).toHaveLength(1)
  })

  it('drops the sale, keeps the sequence and toasts softly when the commit fails', async () => {
    persistSaleAtomicMock.mockRejectedValue(new Error('database is locked'))

    const sale = await useSalesStore.getState().submitSale(saleInput, [])

    expect(sale).toBeNull()
    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining('database is locked')
    )
    // No phantom invoice, and the next checkout still gets INV-0001.
    expect(useSalesStore.getState().sales).toHaveLength(0)
    expect(useSalesStore.getState()._nextInvoiceSeq).toBe(1)
    expect(useSalesStore.getState().isSubmitting).toBe(false)
  })

  it('recovers after a failed commit so the cashier can retry', async () => {
    persistSaleAtomicMock.mockRejectedValueOnce(new Error('database is locked'))

    await expect(
      useSalesStore.getState().submitSale(saleInput, [])
    ).resolves.toBeNull()

    const retry = await useSalesStore.getState().submitSale(saleInput, [])

    expect(retry?.invoiceNumber).toBe('INV-0001')
    expect(persistSaleAtomicMock).toHaveBeenCalledTimes(2)
    expect(useSalesStore.getState().sales).toHaveLength(1)
  })
})
