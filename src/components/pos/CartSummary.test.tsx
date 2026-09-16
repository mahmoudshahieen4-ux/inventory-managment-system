import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/i18n/config'
import { initialProducts, useInventoryStore } from '@/store/useInventoryStore'
import { useCartStore } from '@/store/useCartStore'
import { useSalesStore } from '@/store/useSalesStore'
import { render, screen, waitFor } from '@/test/test-utils'
import type { Sale } from '@/types/sales'
import { CartSummary } from './CartSummary'

/** The commit under test — deferred per test so the pending UI is observable. */
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

/** In-stock seed product sold by every test (Dark Chocolate Bar, qty 50). */
const product = initialProducts.find(entry => entry.id === 'prod-004')
if (!product) throw new Error('seed product prod-004 is missing')

/** Suspends the commit until the test releases it, so "submitting" is visible. */
function deferCommit(): { release: () => void } {
  let release: (() => void) | undefined
  persistSaleAtomicMock.mockImplementation(
    () =>
      new Promise<void>(resolve => {
        release = resolve
      })
  )
  return {
    release: () => release?.(),
  }
}

describe('CartSummary · checkout button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    persistSaleAtomicMock.mockResolvedValue(undefined)
    useInventoryStore.setState({ products: initialProducts })
    useCartStore.setState({ items: [] })
    useSalesStore.setState({
      sales: [],
      creditNotes: [],
      isSubmitting: false,
      _nextInvoiceSeq: 1,
      _nextCreditNoteSeq: 1,
    })
  })

  it('locks the checkout button while committing, then clears the cart and mirrors stock', async () => {
    const user = userEvent.setup()
    const onCheckoutComplete = vi.fn()
    const commit = deferCommit()
    useCartStore.getState().addToCart(product)
    render(<CartSummary onCheckoutComplete={onCheckoutComplete} />)

    await user.click(
      screen.getByRole('button', { name: i18n.t('pos.cart.checkout') })
    )

    // Loading state: the same button is now disabled and shows the spinner label.
    const pendingButton = await screen.findByRole('button', {
      name: i18n.t('pos.cart.processing'),
    })
    expect(pendingButton).toBeDisabled()
    // Nothing is reset while the commit is still running.
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(onCheckoutComplete).not.toHaveBeenCalled()

    commit.release()
    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(0))

    expect(onCheckoutComplete).toHaveBeenCalledTimes(1)
    expect(
      useInventoryStore
        .getState()
        .products.find(entry => entry.id === product.id)?.quantity
    ).toBe(product.quantity - 1)
    expect(toastError).not.toHaveBeenCalled()
  })

  it('keeps the cart, unlocks the button and toasts when the commit fails', async () => {
    const user = userEvent.setup()
    const onCheckoutComplete = vi.fn()
    persistSaleAtomicMock.mockRejectedValue(new Error('database is locked'))
    useCartStore.getState().addToCart(product)
    render(<CartSummary onCheckoutComplete={onCheckoutComplete} />)

    await user.click(
      screen.getByRole('button', { name: i18n.t('pos.cart.checkout') })
    )

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    // The cashier can retry the same cart — nothing was lost or half-committed.
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(onCheckoutComplete).not.toHaveBeenCalled()
    expect(useSalesStore.getState().sales).toHaveLength(0)
    expect(useSalesStore.getState().isSubmitting).toBe(false)
    expect(
      screen.getByRole('button', { name: i18n.t('pos.cart.checkout') })
    ).toBeEnabled()
  })

  it('sends a single commit for a double click', async () => {
    const user = userEvent.setup()
    const commit = deferCommit()
    useCartStore.getState().addToCart(product)
    render(<CartSummary onCheckoutComplete={vi.fn()} />)

    const checkoutButton = screen.getByRole('button', {
      name: i18n.t('pos.cart.checkout'),
    })
    await user.click(checkoutButton)
    await user.click(checkoutButton)

    expect(persistSaleAtomicMock).toHaveBeenCalledTimes(1)

    commit.release()
    await waitFor(() => expect(useSalesStore.getState().sales).toHaveLength(1))
    expect(useCartStore.getState().items).toHaveLength(0)
  })
})
