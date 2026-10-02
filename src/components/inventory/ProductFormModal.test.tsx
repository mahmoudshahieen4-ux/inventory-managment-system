import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

import { isValidEAN13 } from '@/lib/barcode'
import { initialProducts, useInventoryStore } from '@/store/useInventoryStore'
import { fireEvent, render, screen } from '@/test/test-utils'
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

/** The optional fields (SKU, barcode) live behind a disclosure. */
async function showMoreOptions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /show more options/i }))
}

function collapsibleContent() {
  return screen.getByText('SKU').closest('[data-slot="collapsible-content"]')
}

describe('ProductFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useInventoryStore.setState({ products: [...initialProducts] })
  })

  it('renders in create mode with an empty form', () => {
    renderCreateModal()

    expect(screen.getByText('Add New Product')).toBeInTheDocument()
    expect(screen.getByLabelText('Name*')).toHaveValue('')
    expect(screen.getByLabelText('Category')).toHaveValue('')
    expect(screen.getByLabelText('Category')).not.toHaveAttribute('required')
    expect(screen.getByLabelText('Units per Carton*')).toHaveValue(1)
    expect(
      screen.getByLabelText('Loose Boxes/Pieces in Stock (optional)')
    ).toHaveValue(0)
    expect(
      screen.getByLabelText('Loose Boxes/Pieces in Stock (optional)')
    ).not.toHaveAttribute('required')
    expect(
      screen.getByRole('button', { name: 'Create Product' })
    ).toBeInTheDocument()
  })

  it('renders in edit mode with prefilled values', () => {
    renderEditModal(findProduct('prod-001'))

    expect(screen.getByText('Edit Product')).toBeInTheDocument()
    expect(screen.getByLabelText('Name*')).toHaveValue('Espresso Beans 1kg')
    expect(screen.getByLabelText('SKU')).toHaveValue('COF-001')
    expect(screen.getByLabelText('Cartons in Stock*')).toHaveValue(0)
    expect(
      screen.getByLabelText('Loose Boxes/Pieces in Stock (optional)')
    ).toHaveValue(0)
    expect(screen.getByLabelText('Units per Carton*')).toHaveValue(12)
    expect(screen.getByLabelText('Carton Purchase Price')).toHaveValue('12.5')
    expect(
      screen.getByText('Piece purchase cost automatically: 1.04 ج.م')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Carton selling price: 24.99 ج.م')
    ).toBeInTheDocument()
  })

  it('replaces prefilled prices and removes leading zeroes', async () => {
    const user = userEvent.setup()
    renderEditModal(findProduct('prod-001'))

    const purchasePrice = screen.getByLabelText('Carton Purchase Price')
    const sellingPrice = screen.getByLabelText('Box/Piece Selling Price*')

    await user.type(purchasePrice, '0010.50')
    await user.type(sellingPrice, '0002.25')

    expect(purchasePrice).toHaveValue('10.50')
    expect(sellingPrice).toHaveValue('2.25')
  })

  it('marks required fields and links error alerts via aria-describedby', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    expect(screen.getByLabelText('Name*')).toHaveAttribute('required')

    await user.click(screen.getByRole('button', { name: 'Create Product' }))

    const nameInput = screen.getByLabelText('Name*')
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput).toHaveAttribute('aria-describedby', 'product-name-error')
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
  })

  it('keeps optional fields collapsed behind an accessible disclosure', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    const trigger = screen.getByRole('button', { name: /show more options/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-controls')
    expect(screen.getByLabelText('Name*')).toBeVisible()
    expect(screen.getByLabelText('Box/Piece Selling Price*')).toBeVisible()
    expect(screen.getByLabelText('Cartons in Stock*')).toBeVisible()

    // Collapsed content is inert: untabbable and hidden from assistive tech.
    expect(collapsibleContent()).toHaveAttribute('inert')
    for (const label of [
      'Category',
      'Carton Purchase Price',
      'Loose Boxes/Pieces in Stock (optional)',
      'Units per Carton*',
    ]) {
      expect(
        screen
          .getByLabelText(label)
          .closest('[data-slot="collapsible-content"]')
      ).toHaveAttribute('inert')
    }
    expect(
      screen
        .getByLabelText('Min Threshold')
        .closest('[data-slot="collapsible-content"]')
    ).toHaveAttribute('inert')

    await showMoreOptions(user)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(collapsibleContent()).not.toHaveAttribute('inert')
    expect(screen.getByLabelText('Barcode')).toBeInTheDocument()
    expect(screen.queryByLabelText('Unit')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Min Threshold')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /hide extra options/i })
    ).toBeInTheDocument()
  })

  it('shows how many optional fields are already filled', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    await showMoreOptions(user)
    await user.type(screen.getByLabelText('SKU'), 'ABC-123')

    expect(screen.getByText('1 filled')).toBeInTheDocument()
  })

  it('shows validation errors when submitting an empty form', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    await user.click(screen.getByRole('button', { name: 'Create Product' }))

    expect(screen.getAllByText('This field is required.')).toHaveLength(2)
    expect(onOpenChangeMock).not.toHaveBeenCalled()
    expect(useInventoryStore.getState().products).toHaveLength(
      initialProducts.length
    )
  })

  it('allows an empty purchase price and stores it as zero', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    await user.type(screen.getByLabelText('Name*'), 'No Cost Product')
    await user.type(screen.getByLabelText('Box/Piece Selling Price*'), '5')

    expect(screen.getByLabelText('Carton Purchase Price')).not.toHaveAttribute(
      'required'
    )
    expect(
      screen.getByText(
        "Optional — leave blank if you don't want to track purchase cost."
      )
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create Product' }))

    const created = useInventoryStore
      .getState()
      .products.find(product => product.name === 'No Cost Product')
    expect(created).toMatchObject({
      cartonPurchasePrice: 0,
      boxPurchasePrice: 0,
      purchasePrice: 0,
    })
  })

  it('shows a live purchase price conflict and disables saving', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    await user.type(screen.getByLabelText('Name*'), 'Price Conflict Product')
    await showMoreOptions(user)
    await user.type(screen.getByLabelText('Carton Purchase Price'), '10')
    await user.type(screen.getByLabelText('Box/Piece Selling Price*'), '5')

    expect(
      screen.getByText(
        'Error: Purchase price cannot be higher than selling price.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Create Product' })
    ).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Box/Piece Selling Price*'), {
      target: { value: '15' },
    })

    expect(
      screen.queryByText(
        'Error: Purchase price cannot be higher than selling price.'
      )
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Product' })).toBeEnabled()
  })

  it('requires the selling price to be greater than zero', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    await user.type(screen.getByLabelText('Name*'), 'Zero Price Product')
    fireEvent.change(screen.getByLabelText('Box/Piece Selling Price*'), {
      target: { value: '0' },
    })

    await user.click(screen.getByRole('button', { name: 'Create Product' }))

    expect(screen.getByText('Must be greater than zero.')).toBeInTheDocument()
    expect(useInventoryStore.getState().products).toHaveLength(
      initialProducts.length
    )
    expect(onOpenChangeMock).not.toHaveBeenCalled()
  })

  it('expands the optional section when a hidden field has an error', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    await user.type(screen.getByLabelText('Name*'), 'Duplicate Barcode')
    await user.type(
      screen.getByLabelText('Loose Boxes/Pieces in Stock (optional)'),
      '1'
    )
    await user.type(screen.getByLabelText('Box/Piece Selling Price*'), '2')

    // prod-001 (Espresso Beans) already owns this barcode.
    await showMoreOptions(user)
    await user.type(screen.getByLabelText('Barcode'), '6291041500213')
    await user.click(
      screen.getByRole('button', { name: /hide extra options/i })
    )

    await user.click(screen.getByRole('button', { name: 'Create Product' }))

    // The section auto-expanded so the error is actually visible.
    expect(
      screen.getByRole('button', { name: /hide extra options/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText('This barcode is already assigned to another product.')
    ).toBeVisible()
    expect(onOpenChangeMock).not.toHaveBeenCalled()
  }, 15000)

  it('rejects negative numeric values', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    await user.type(screen.getByLabelText('Name*'), 'Test Product')
    // type="number" inputs reject the "-" character via keyboard simulation in
    // jsdom; use fireEvent.change to set a negative value the validator can catch.
    fireEvent.change(
      screen.getByLabelText('Loose Boxes/Pieces in Stock (optional)'),
      { target: { value: '-5' } }
    )
    await user.type(screen.getByLabelText('Box/Piece Selling Price*'), '3')

    await user.click(screen.getByRole('button', { name: 'Create Product' }))

    expect(screen.getByText('Must be 0 or greater.')).toBeInTheDocument()
    expect(useInventoryStore.getState().products).toHaveLength(
      initialProducts.length
    )
    expect(onOpenChangeMock).not.toHaveBeenCalled()
  })

  it('creates a product with optional fields and closes the modal', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    await user.type(screen.getByLabelText('Name*'), 'Olive Oil 1L')

    await showMoreOptions(user)
    await user.type(screen.getByLabelText('SKU'), 'OIL-010')
    // Locale-style decimal comma must be parsed as 120.
    await user.type(screen.getByLabelText('Carton Purchase Price'), '120,00')
    await user.type(screen.getByLabelText('Box/Piece Selling Price*'), '20')
    expect(
      screen.getByText('Piece purchase cost automatically: 120.00 ج.م')
    ).toBeInTheDocument()
    // Stock input uses useAutoSelectOnFocus; typing '12' char-by-char in
    // jsdom overwrites the first digit. Set the value directly instead.
    fireEvent.change(
      screen.getByLabelText('Loose Boxes/Pieces in Stock (optional)'),
      { target: { value: '12' } }
    )
    fireEvent.change(screen.getByLabelText('Units per Carton*'), {
      target: { value: '12' },
    })
    expect(
      screen.getByText('Piece purchase cost automatically: 10.00 ج.م')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Carton selling price: 240.00 ج.م')
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Set bulk carton price' })
    )
    fireEvent.change(screen.getByLabelText('Carton Selling Price'), {
      target: { value: '225' },
    })

    await user.click(screen.getByRole('button', { name: 'Create Product' }))

    expect(onOpenChangeMock).toHaveBeenCalledWith(false)

    const created = useInventoryStore
      .getState()
      .products.find(product => product.sku === 'OIL-010')
    expect(created).toMatchObject({
      name: 'Olive Oil 1L',
      quantity: 12,
      minThreshold: 0,
      purchasePrice: 10,
      sellingPrice: 20,
      boxesPerCarton: 12,
      boxPurchasePrice: 10,
      cartonPurchasePrice: 120,
      cartonSellingPrice: 225,
    })
  }, 15000)

  it('treats a cleared loose-box quantity as zero', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    await user.type(screen.getByLabelText('Name*'), 'Single Item')
    fireEvent.change(screen.getByLabelText('Cartons in Stock*'), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByLabelText('Units per Carton*'), {
      target: { value: '12' },
    })
    await user.type(screen.getByLabelText('Carton Purchase Price'), '24')
    await user.type(screen.getByLabelText('Box/Piece Selling Price*'), '3')
    await user.clear(
      screen.getByLabelText('Loose Boxes/Pieces in Stock (optional)')
    )

    await user.click(screen.getByRole('button', { name: 'Create Product' }))

    const created = useInventoryStore
      .getState()
      .products.find(product => product.name === 'Single Item')
    expect(created).toMatchObject({ boxQuantity: 0, quantity: 12 })
  })

  it('updates an existing product and closes the modal', async () => {
    const user = userEvent.setup()
    renderEditModal(findProduct('prod-002'))

    expect(
      screen.getByText('Carton selling price: 3.49 ج.م')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Set bulk carton price' })
    ).toBeInTheDocument()

    const nameInput = screen.getByLabelText('Name*')
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

  it('generates a readable PRD code into the SKU field with the Generate button', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    await showMoreOptions(user)

    expect(screen.getByLabelText('SKU')).toHaveValue('')

    await user.click(
      screen.getByRole('button', { name: 'Generate Random Barcode' })
    )

    const sku = screen.getByLabelText('SKU') as HTMLInputElement
    expect(sku.value).toMatch(/^PRD-[0-9A-F]{8}$/)
    // The field stays editable for manual / scanner input.
    await user.type(sku, '-manual')
    expect(sku.value).toMatch(/^PRD-[0-9A-F]{8}-manual$/)
  })

  it('generates a valid EAN-13 barcode into the barcode field', async () => {
    const user = userEvent.setup()
    renderCreateModal()

    await showMoreOptions(user)
    await user.click(screen.getByRole('button', { name: 'Generate EAN-13' }))

    const barcode = screen.getByLabelText('Barcode') as HTMLInputElement
    expect(barcode.value).toMatch(/^\d{13}$/)
    expect(isValidEAN13(barcode.value)).toBe(true)
  })
})
