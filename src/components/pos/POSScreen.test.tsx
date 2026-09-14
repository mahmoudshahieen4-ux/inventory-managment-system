import { fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, within } from '@/test/test-utils'
import { useAuthStore } from '@/store/useAuthStore'
import { useCartStore } from '@/store/useCartStore'
import { initialProducts, useInventoryStore } from '@/store/useInventoryStore'
import { useSalesStore } from '@/store/useSalesStore'
import { POSScreen } from './POSScreen'

const { toastError, toastSuccess, toastInfo } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: toastError,
    success: toastSuccess,
    info: toastInfo,
    warning: () => undefined,
  },
}))

/** Fires a scanner-style burst: rapid single-character keydowns + Enter. */
function scanCode(code: string): void {
  for (const char of code) {
    fireEvent.keyDown(window, { key: char })
  }
  fireEvent.keyDown(window, { key: 'Enter' })
}

/** Finds the catalog card container for a product by its name. */
function getCard(productName: string): HTMLElement {
  const card = screen.getByText(productName).closest('div.rounded-lg')
  if (!card) throw new Error(`Card for ${productName} not found`)
  return card as HTMLElement
}

describe('POSScreen', () => {
  beforeEach(() => {
    toastError.mockClear()
    toastSuccess.mockClear()
    toastInfo.mockClear()
    useInventoryStore.setState({ products: initialProducts })
    useCartStore.setState({ items: [] })
    useSalesStore.setState({
      sales: [],
      creditNotes: [],
      _nextInvoiceSeq: 1,
      _nextCreditNoteSeq: 1,
    })
    useAuthStore.setState({
      currentUser: {
        id: 'user-cashier',
        username: 'cashier',
        displayName: 'Cashier',
        role: 'CASHIER',
      },
    })
  })

  it('renders the product catalog with stock badges and prices', () => {
    render(<POSScreen />)

    expect(
      screen.getByRole('heading', { name: 'Point of Sale' })
    ).toBeInTheDocument()
    expect(screen.getByText('Dark Chocolate Bar')).toBeInTheDocument()
    expect(screen.queryByText('Espresso Beans 1kg')).not.toBeInTheDocument()
    expect(screen.queryByText('Stock: 0')).not.toBeInTheDocument()
    expect(screen.getByText('Stock: 50')).toBeInTheDocument()
    expect(screen.getByText('2.49 ج.م')).toBeInTheDocument()
  })

  it('hides out-of-stock products from the catalog', () => {
    render(<POSScreen />)

    expect(screen.queryByText('Espresso Beans 1kg')).not.toBeInTheDocument()
    expect(screen.queryByText('Stock: 0')).not.toBeInTheDocument()
  })

  it('filters products instantly by name and SKU', async () => {
    // Human-like typing delay keeps the keystrokes outside the scanner burst
    // window, so the global scanner hook must not swallow them.
    const user = userEvent.setup({ delay: 100 })
    render(<POSScreen />)

    const search = screen.getByLabelText('Search products')
    await user.type(search, 'chocolate')
    expect(screen.queryByText('Espresso Beans 1kg')).not.toBeInTheDocument()
    expect(screen.getByText('Dark Chocolate Bar')).toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'DAI-002')
    expect(screen.getByText('Whole Milk 1L')).toBeInTheDocument()
    expect(screen.queryByText('Dark Chocolate Bar')).not.toBeInTheDocument()
  })

  it('adds products to the cart and shows totals', async () => {
    const user = userEvent.setup()
    render(<POSScreen />)

    const add = within(getCard('Dark Chocolate Bar')).getByRole('button', {
      name: 'Add',
    })
    await user.click(add)
    await user.click(add)

    expect(screen.getByText('In cart: 2')).toBeInTheDocument()
    // Sales tax is disabled (TAX_RATE = 0): no tax row, total == subtotal.
    expect(screen.queryByText('Tax (5%)')).not.toBeInTheDocument()
    expect(screen.getAllByText('4.98 ج.م').length).toBeGreaterThan(0)
    expect(useCartStore.getState().items.at(0)).toMatchObject({
      productId: 'prod-004',
      quantity: 2,
      unitPrice: 2.49,
    })
  })

  it('prevents increasing quantity beyond available stock', async () => {
    const user = userEvent.setup()
    render(<POSScreen />)

    const add = within(getCard('Whole Milk 1L')).getByRole('button', {
      name: 'Add',
    })
    for (let i = 0; i < 5; i++) {
      await user.click(add)
    }

    expect(useCartStore.getState().items.at(0)?.quantity).toBe(5)
    expect(add).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Increase quantity' })
    ).toBeDisabled()
  })

  it('checkout deducts stock, records the sale, clears the cart and opens the receipt', async () => {
    const user = userEvent.setup()
    render(<POSScreen />)

    const add = within(getCard('Dark Chocolate Bar')).getByRole('button', {
      name: 'Add',
    })
    await user.click(add)
    await user.click(add)
    await user.click(
      screen.getByRole('button', { name: 'إتمام البيع / Complete Sale' })
    )

    // Receipt dialog opens automatically
    expect(await screen.findByText('Receipt')).toBeInTheDocument()
    expect(screen.getByText('My Store')).toBeInTheDocument()
    // No tax: the grand total equals the line total.
    expect(screen.getAllByText('4.98 ج.م').length).toBeGreaterThan(0)

    // Stock deducted immediately: 50 - 2 = 48
    const chocolate = useInventoryStore
      .getState()
      .products.find(product => product.id === 'prod-004')
    expect(chocolate?.quantity).toBe(48)

    // Sale recorded with the signed-in cashier's username
    const sales = useSalesStore.getState().sales
    expect(sales).toHaveLength(1)
    expect(sales.at(0)?.items.at(0)).toMatchObject({
      productId: 'prod-004',
      quantity: 2,
      lineTotal: 4.98,
    })
    expect(sales.at(0)?.cashierId).toBe('cashier')
    // Sales tax is disabled: the stored total equals the subtotal.
    expect(sales.at(0)?.total).toBe(4.98)

    // Cart reset for the next sale
    expect(useCartStore.getState().items).toHaveLength(0)
    expect(
      screen.getByText('Cart is empty. Add products to start a sale.')
    ).toBeInTheDocument()
  })

  it('clears the cart with the Clear Cart button', async () => {
    const user = userEvent.setup()
    render(<POSScreen />)

    await user.click(
      within(getCard('Dark Chocolate Bar')).getByRole('button', { name: 'Add' })
    )
    await user.click(screen.getByRole('button', { name: 'Clear Cart' }))

    expect(useCartStore.getState().items).toHaveLength(0)
    expect(
      screen.getByText('Cart is empty. Add products to start a sale.')
    ).toBeInTheDocument()
  })

  it('shows sales history and re-opens a stored invoice for re-printing', async () => {
    const user = userEvent.setup()
    render(<POSScreen />)

    // Create a completed sale first
    await user.click(
      within(getCard('Dark Chocolate Bar')).getByRole('button', { name: 'Add' })
    )
    await user.click(
      screen.getByRole('button', { name: 'إتمام البيع / Complete Sale' })
    )
    await screen.findByText('Receipt')
    // Footer "Close" (first in DOM; the dialog's "X" shares the same name)
    const closeButton = screen.getAllByRole('button', {
      name: 'Close',
    })[0] as HTMLElement
    await user.click(closeButton)

    // Switch to the history tab and inspect the stored invoice (1 × 2.49, no tax)
    await user.click(screen.getByText('Sales History'))
    expect(screen.getByText('INV-0001')).toBeInTheDocument()
    expect(screen.getByText('2.49 ج.م')).toBeInTheDocument()

    // Re-open the receipt from history
    await user.click(
      screen.getByRole('button', { name: 'Re-print receipt INV-0001' })
    )
    expect(await screen.findByText('Receipt')).toBeInTheDocument()
    expect(screen.getByText('Invoice No.')).toBeInTheDocument()
    expect(screen.getAllByText('INV-0001').length).toBeGreaterThan(0)
  })

  it('adds a product to the cart when its barcode is scanned hands-free', () => {
    render(<POSScreen />)

    scanCode('6291071500214') // Dark Chocolate Bar

    expect(useCartStore.getState().items.at(0)).toMatchObject({
      productId: 'prod-004',
      quantity: 1,
    })
    expect(toastSuccess).toHaveBeenCalledWith(
      'Dark Chocolate Bar added to cart'
    )
  })

  it('clears the catalog search box after a successful scan', () => {
    render(<POSScreen />)

    const search = screen.getByLabelText('Search products')
    // Simulate a leaked first keystroke landing in the search box.
    fireEvent.change(search, { target: { value: '6' } })
    expect(search).toHaveValue('6')

    scanCode('6291071500214')
    expect(search).toHaveValue('')
  })

  it('increments an existing cart line when the same barcode is scanned twice', () => {
    render(<POSScreen />)

    scanCode('6291071500214')
    scanCode('6291071500214')

    expect(useCartStore.getState().items.at(0)).toMatchObject({
      productId: 'prod-004',
      quantity: 2,
    })
  })

  it('shows an error toast for an unknown barcode', () => {
    render(<POSScreen />)

    scanCode('9999999999998')

    expect(useCartStore.getState().items).toHaveLength(0)
    expect(toastError).toHaveBeenCalledWith(
      'Product not found for barcode 9999999999998'
    )
  })

  it('refuses to scan out-of-stock products into the cart', () => {
    render(<POSScreen />)

    scanCode('6291041500213') // Espresso Beans 1kg (quantity 0)

    expect(useCartStore.getState().items).toHaveLength(0)
    expect(toastError).toHaveBeenCalledWith(
      'Espresso Beans 1kg is out of stock'
    )
  })

  it('does not fire scans while the sales-history tab is open', async () => {
    const user = userEvent.setup()
    render(<POSScreen />)

    await user.click(screen.getByText('Sales History'))
    scanCode('6291071500214')

    expect(useCartStore.getState().items).toHaveLength(0)
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})
