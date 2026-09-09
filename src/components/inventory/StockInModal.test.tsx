import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

import { initialProducts, useInventoryStore } from '@/store/useInventoryStore'
import { render, screen } from '@/test/test-utils'
import type { Product } from '@/types/inventory'
import { StockInModal } from './StockInModal'

const onOpenChange = vi.fn()

function findProduct(id: string): Product {
  const product = initialProducts.find(item => item.id === id)
  if (!product) throw new Error(`Test product ${id} not found`)
  return product
}

describe('StockInModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useInventoryStore.setState({ products: [...initialProducts] })
  })

  describe('single-product (locked) mode', () => {
    const target = findProduct('prod-002') // Whole Milk 1L — q=5, unit=علبة

    function renderLocked() {
      return render(
        <StockInModal open onOpenChange={onOpenChange} product={target} />
      )
    }

    it('renders the locked product with its current stock', () => {
      renderLocked()

      expect(screen.getByText('Add Shipment / Stock In')).toBeInTheDocument()
      expect(screen.getByText(target.name)).toBeInTheDocument()
      expect(screen.getByText('Current Stock')).toBeInTheDocument()
      expect(
        screen.getByText(`${target.quantity} ${target.unit ?? ''}`)
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Add to Stock' })
      ).toBeDisabled()
    })

    it('keeps the submit button disabled until a valid quantity is entered', () => {
      renderLocked()

      expect(
        screen.getByRole('button', { name: 'Add to Stock' })
      ).toBeDisabled()
    })

    it('rejects zero and shows the positive-integer validation error', async () => {
      const user = userEvent.setup()
      renderLocked()

      await user.type(screen.getByLabelText(/quantity to add/i), '0')

      expect(
        screen.getByText('Must be a whole number greater than zero.')
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Add to Stock' })
      ).toBeDisabled()
    })

    it('rejects non-integer quantities', async () => {
      const user = userEvent.setup()
      renderLocked()

      await user.type(screen.getByLabelText(/quantity to add/i), '2.5')

      expect(
        screen.getByText('Must be a whole number greater than zero.')
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Add to Stock' })
      ).toBeDisabled()
    })

    it('enables submit and previews the new total for a valid quantity', async () => {
      const user = userEvent.setup()
      renderLocked()

      await user.type(screen.getByLabelText(/quantity to add/i), '10')

      expect(screen.getByRole('button', { name: 'Add to Stock' })).toBeEnabled()
      // Live preview: Current + Added = New Total (colored by resulting status).
      expect(screen.getByText(/^\d+ \+ 10 = 15/)).toBeInTheDocument()
    })

    it('adds stock to the store and closes on submit', async () => {
      const user = userEvent.setup()
      renderLocked()

      await user.type(screen.getByLabelText(/quantity to add/i), '10')
      await user.click(screen.getByRole('button', { name: 'Add to Stock' }))

      expect(onOpenChange).toHaveBeenCalledWith(false)

      const updated = useInventoryStore
        .getState()
        .products.find(product => product.id === target.id)
      expect(updated?.quantity).toBe(target.quantity + 10)
    })

    it('updates the purchase price when a new cost is provided', async () => {
      const user = userEvent.setup()
      renderLocked()

      await user.type(screen.getByLabelText(/purchase price/i), '1.75')
      await user.type(screen.getByLabelText(/quantity to add/i), '4')
      await user.click(screen.getByRole('button', { name: 'Add to Stock' }))

      const updated = useInventoryStore
        .getState()
        .products.find(product => product.id === target.id)
      expect(updated?.quantity).toBe(target.quantity + 4)
      expect(updated?.purchasePrice).toBe(1.75)
    })

    it('leaves the purchase price untouched when cost is left blank', async () => {
      const user = userEvent.setup()
      renderLocked()

      await user.type(screen.getByLabelText(/quantity to add/i), '6')
      await user.click(screen.getByRole('button', { name: 'Add to Stock' }))

      const updated = useInventoryStore
        .getState()
        .products.find(product => product.id === target.id)
      expect(updated?.quantity).toBe(target.quantity + 6)
      expect(updated?.purchasePrice).toBe(target.purchasePrice)
    })
  })

  describe('batch (toolbar) mode', () => {
    it('disables submit and prompts selection when no product is chosen', () => {
      render(<StockInModal open onOpenChange={onOpenChange} />)

      expect(
        screen.getByRole('button', { name: 'Add to Stock' })
      ).toBeDisabled()
      expect(
        screen.getByText('Select a product, then enter the quantity to add.')
      ).toBeInTheDocument()
    })

    it('narrows the product list as you type in the search box', async () => {
      const user = userEvent.setup()
      render(<StockInModal open onOpenChange={onOpenChange} />)

      await user.type(
        screen.getByPlaceholderText('Search by SKU, name, or barcode...'),
        'Milk'
      )

      expect(
        screen.getByRole('button', { name: /whole milk/i })
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /espresso/i })
      ).not.toBeInTheDocument()
    })

    it('selects a product, enters a quantity and adds stock on submit', async () => {
      const user = userEvent.setup()
      render(<StockInModal open onOpenChange={onOpenChange} />)

      await user.click(screen.getByRole('button', { name: /whole milk/i }))
      expect(screen.getByText('Current Stock')).toBeInTheDocument()

      await user.type(screen.getByLabelText(/quantity to add/i), '4')
      await user.click(screen.getByRole('button', { name: 'Add to Stock' }))

      expect(onOpenChange).toHaveBeenCalledWith(false)

      const updated = useInventoryStore
        .getState()
        .products.find(product => product.id === 'prod-002')
      expect(updated?.quantity).toBe(9)
    })
  })
})
