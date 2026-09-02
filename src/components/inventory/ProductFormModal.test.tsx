import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

import { initialProducts, useInventoryStore } from '@/store/useInventoryStore'
import { render, screen } from '@/test/test-utils'
import type { Product } from '@/types/inventory'
import { ProductFormModal } from './ProductFormModal'

const onOpenChangeMock = vi.fn()

function findProduct(id: string): Product {
  const product = initialProducts.find(item => item.id === id)
  if (!product) throw new Error(`Test product ${id} not found`)
  return product
}

function renderCreateModal() {
  return render(<ProductFormModal open onOpenChange={onOpenChangeMock} />)
}

function renderEditModal(product: Product) {
  return render(
    <ProductFormModal open onOpenChange={onOpenChangeMock} product={product} />
  )
}

describe('ProductFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useInventoryStore.setState({ products: [...initialProducts] })
  })

  it('renders in create mode with an empty form', () => {
    renderCreateModal()

    expect(screen.getByText('Add New Product')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('SKU')).toHaveValue('')
    expect(screen.getByLabelText('Category')).toHaveValue('')
    expect(
      screen.getByRole('button', { name: 'Create Product' })
    ).toBeInTheDocument()
  })

  it('renders in edit mode with prefilled values', () => {
    renderEditModal(findProduct('prod-001'))

    expect(screen.getByText('Edit Product')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Espresso Beans 1kg')
    expect(screen.getByLabelText('SKU')).toHaveValue('COF-001')
    expect(screen.getByLabelText('Quantity')).toHaveValue(0)
    expect(screen.getByLabelText('Min Threshold')).toHaveValue(10)
    expect(screen.getByLabelText('Purchase Price')).toHaveValue('12.5')
    expect(screen.getByLabelText('Selling Price')).toHaveValue('24.99')
  })

  it('shows validation errors when submitting an empty form', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    await user.click(screen.getByRole('button', { name: 'Create Product' }))

    expect(screen.getAllByText('This field is required.')).toHaveLength(6)
    expect(onOpenChangeMock).not.toHaveBeenCalled()
    expect(useInventoryStore.getState().products).toHaveLength(
      initialProducts.length
    )
  })

  it('rejects negative numeric values', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    await user.type(screen.getByLabelText('Name'), 'Test Product')
    await user.type(screen.getByLabelText('SKU'), 'TST-001')
    await user.type(screen.getByLabelText('Category'), 'Testing')
    await user.type(screen.getByLabelText('Quantity'), '-5')
    await user.type(screen.getByLabelText('Min Threshold'), '2')
    await user.type(screen.getByLabelText('Purchase Price'), '1')
    await user.type(screen.getByLabelText('Selling Price'), '3')

    await user.click(screen.getByRole('button', { name: 'Create Product' }))

    expect(screen.getByText('Must be 0 or greater.')).toBeInTheDocument()
    expect(useInventoryStore.getState().products).toHaveLength(
      initialProducts.length
    )
    expect(onOpenChangeMock).not.toHaveBeenCalled()
  })

  it('creates a product and closes the modal', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    await user.type(screen.getByLabelText('Name'), 'Test Product')
    await user.type(screen.getByLabelText('SKU'), 'TST-001')
    await user.type(screen.getByLabelText('Category'), 'Testing')
    await user.type(screen.getByLabelText('Quantity'), '25')
    await user.type(screen.getByLabelText('Min Threshold'), '5')
    await user.type(screen.getByLabelText('Purchase Price'), '10')
    await user.type(screen.getByLabelText('Selling Price'), '20')

    await user.click(screen.getByRole('button', { name: 'Create Product' }))

    expect(onOpenChangeMock).toHaveBeenCalledWith(false)

    const created = useInventoryStore
      .getState()
      .products.find(product => product.sku === 'TST-001')
    expect(created).toMatchObject({
      name: 'Test Product',
      category: 'Testing',
      quantity: 25,
      minThreshold: 5,
      purchasePrice: 10,
      sellingPrice: 20,
    })
  })

  it('creates a product with comma-decimal prices and a unit', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    await user.type(screen.getByLabelText('Name'), 'Olive Oil 1L')
    await user.type(screen.getByLabelText('SKU'), 'OIL-010')
    await user.type(screen.getByLabelText('Category'), 'Pantry')
    await user.type(screen.getByLabelText(/Unit/), 'bottle')
    await user.type(screen.getByLabelText('Quantity'), '12')
    await user.type(screen.getByLabelText('Min Threshold'), '4')
    // Locale-style decimal comma must be parsed as 12.5
    await user.type(screen.getByLabelText('Purchase Price'), '12,50')
    await user.type(screen.getByLabelText('Selling Price'), '20')

    await user.click(screen.getByRole('button', { name: 'Create Product' }))

    expect(onOpenChangeMock).toHaveBeenCalledWith(false)

    const created = useInventoryStore
      .getState()
      .products.find(product => product.sku === 'OIL-010')
    expect(created).toMatchObject({
      name: 'Olive Oil 1L',
      unit: 'bottle',
      quantity: 12,
      minThreshold: 4,
      purchasePrice: 12.5,
      sellingPrice: 20,
    })
  })

  it('updates an existing product and closes the modal', async () => {
    const user = userEvent.setup()
    renderEditModal(findProduct('prod-002'))

    const nameInput = screen.getByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Whole Milk 2L')

    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(onOpenChangeMock).toHaveBeenCalledWith(false)

    const updated = useInventoryStore
      .getState()
      .products.find(product => product.id === 'prod-002')
    expect(updated?.name).toBe('Whole Milk 2L')
    expect(updated?.quantity).toBe(5)
  })
})
