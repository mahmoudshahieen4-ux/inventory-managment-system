import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { render, screen, within } from '@/test/test-utils'
import { useAuthStore } from '@/store/useAuthStore'
import { useCartStore } from '@/store/useCartStore'
import { initialProducts, useInventoryStore } from '@/store/useInventoryStore'
import { useSalesStore } from '@/store/useSalesStore'
import { POSScreen } from './POSScreen'

/** Finds the catalog card container for a product by its name. */
function getCard(productName: string): HTMLElement {
  const card = screen.getByText(productName).closest('div.rounded-lg')
  if (!card) throw new Error(`Card for ${productName} not found`)
  return card as HTMLElement
}

describe('POSScreen', () => {
  beforeEach(() => {
    useInventoryStore.setState({ products: initialProducts })
    useCartStore.setState({ items: [] })
    useSalesStore.setState({ sales: [] })
    useAuthStore.setState({ role: 'CASHIER' })
  })

  it('renders the product catalog with stock badges and prices', () => {
    render(<POSScreen />)

    expect(
      screen.getByRole('heading', { name: 'Point of Sale' })
    ).toBeInTheDocument()
    expect(screen.getByText('Espresso Beans 1kg')).toBeInTheDocument()
    expect(screen.getByText('Dark Chocolate Bar')).toBeInTheDocument()
    expect(screen.getByText('Stock: 0')).toBeInTheDocument()
    expect(screen.getByText('Stock: 50')).toBeInTheDocument()
    expect(screen.getByText('2.49 ج.م')).toBeInTheDocument()
  })

  it('disables Add for out-of-stock products', () => {
    render(<POSScreen />)

    const card = getCard('Espresso Beans 1kg')
    expect(within(card).getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  it('filters products instantly by name and SKU', async () => {
    const user = userEvent.setup()
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
    expect(screen.getByText('Tax (5%)')).toBeInTheDocument()
    expect(screen.getByText('0.25 ج.م')).toBeInTheDocument()
    expect(screen.getAllByText('4.98 ج.م').length).toBeGreaterThan(0)
    expect(screen.getByText('5.23 ج.م')).toBeInTheDocument()
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
    expect(screen.getByText('5.23 ج.م')).toBeInTheDocument()

    // Stock deducted immediately: 50 - 2 = 48
    const chocolate = useInventoryStore
      .getState()
      .products.find(product => product.id === 'prod-004')
    expect(chocolate?.quantity).toBe(48)

    // Sale recorded with the current role as cashier
    const sales = useSalesStore.getState().sales
    expect(sales).toHaveLength(1)
    expect(sales.at(0)?.items.at(0)).toMatchObject({
      productId: 'prod-004',
      quantity: 2,
      lineTotal: 4.98,
    })
    expect(sales.at(0)?.cashierId).toBe('CASHIER')
    expect(sales.at(0)?.total).toBe(5.23)

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

    // Switch to the history tab and inspect the stored invoice (1 × $2.49 + 5% tax)
    await user.click(screen.getByText('Sales History'))
    expect(screen.getByText('INV-0001')).toBeInTheDocument()
    expect(screen.getByText('2.61 ج.م')).toBeInTheDocument()

    // Re-open the receipt from history
    await user.click(
      screen.getByRole('button', { name: 'Re-print receipt INV-0001' })
    )
    expect(await screen.findByText('Receipt')).toBeInTheDocument()
    expect(screen.getByText('Invoice No.: INV-0001')).toBeInTheDocument()
  })
})
