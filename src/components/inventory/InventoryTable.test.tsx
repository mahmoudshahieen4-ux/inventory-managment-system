import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

import { useAuthStore } from '@/store/useAuthStore'
import { initialProducts, useInventoryStore } from '@/store/useInventoryStore'
import { render, screen } from '@/test/test-utils'
import { InventoryTable } from './InventoryTable'

describe('InventoryTable', () => {
  beforeEach(() => {
    useInventoryStore.setState({ products: [...initialProducts] })
    useAuthStore.setState({ role: 'ADMIN' })
  })

  it('renders every seeded product', () => {
    render(<InventoryTable />)

    expect(screen.getByText('Espresso Beans 1kg')).toBeInTheDocument()
    expect(screen.getByText('Whole Milk 1L')).toBeInTheDocument()
    expect(screen.getByText('Butter Croissant')).toBeInTheDocument()
    expect(screen.getByText('Dark Chocolate Bar')).toBeInTheDocument()
    expect(screen.getByText('Bottled Water 500ml')).toBeInTheDocument()
  })

  it('renders localized stock status badges for every state', () => {
    render(<InventoryTable />)

    // OUT_OF_STOCK: Espresso Beans only
    expect(screen.getAllByText('منتهي / Out of Stock')).toHaveLength(1)
    // LOW_STOCK: Whole Milk + Butter Croissant
    expect(screen.getAllByText('وشك على النفاذ / Low Stock')).toHaveLength(2)
    // IN_STOCK: Dark Chocolate + Bottled Water
    expect(screen.getAllByText('متوفر / In Stock')).toHaveLength(2)
  })

  it('filters products by name', async () => {
    const user = userEvent.setup()
    render(<InventoryTable />)

    await user.type(screen.getByLabelText(/search/i), 'croissant')

    expect(screen.getByText('Butter Croissant')).toBeInTheDocument()
    expect(screen.queryByText('Espresso Beans 1kg')).not.toBeInTheDocument()
  })

  it('filters products by SKU (case-insensitive)', async () => {
    const user = userEvent.setup()
    render(<InventoryTable />)

    await user.type(screen.getByLabelText(/search/i), 'cof-001')

    expect(screen.getByText('Espresso Beans 1kg')).toBeInTheDocument()
    expect(screen.queryByText('Whole Milk 1L')).not.toBeInTheDocument()
  })

  it('shows an empty state when no products match', async () => {
    const user = userEvent.setup()
    render(<InventoryTable />)

    await user.type(screen.getByLabelText(/search/i), 'zzz-no-match')

    expect(screen.getByText(/no products match/i)).toBeInTheDocument()
  })

  it('filters to low stock products via the status dropdown', async () => {
    const user = userEvent.setup()
    render(<InventoryTable />)

    await user.click(screen.getByLabelText(/filter by stock/i))
    await user.click(await screen.findByRole('option', { name: /low stock/i }))

    expect(screen.getByText('Whole Milk 1L')).toBeInTheDocument()
    expect(screen.getByText('Butter Croissant')).toBeInTheDocument()
    expect(screen.queryByText('Espresso Beans 1kg')).not.toBeInTheDocument()
    expect(screen.queryByText('Dark Chocolate Bar')).not.toBeInTheDocument()
  })

  it('filters to out of stock products via the status dropdown', async () => {
    const user = userEvent.setup()
    render(<InventoryTable />)

    await user.click(screen.getByLabelText(/filter by stock/i))
    await user.click(
      await screen.findByRole('option', { name: /out of stock/i })
    )

    expect(screen.getByText('Espresso Beans 1kg')).toBeInTheDocument()
    expect(screen.queryByText('Whole Milk 1L')).not.toBeInTheDocument()
    expect(screen.queryByText('Dark Chocolate Bar')).not.toBeInTheDocument()
  })

  it('highlights out of stock rows in red', () => {
    render(<InventoryTable />)

    const row = screen.getByText('Espresso Beans 1kg').closest('tr')
    expect(row?.className).toContain('bg-red-950/30')
    expect(row?.className).toContain('border-s-red-500')
  })

  it('highlights low stock rows in amber', () => {
    render(<InventoryTable />)

    const row = screen.getByText('Whole Milk 1L').closest('tr')
    expect(row?.className).toContain('bg-amber-950/30')
    expect(row?.className).toContain('border-s-amber-500')
  })

  it('does not highlight in stock rows', () => {
    render(<InventoryTable />)

    const row = screen.getByText('Dark Chocolate Bar').closest('tr')
    expect(row?.className).not.toContain('bg-red-950/30')
    expect(row?.className).not.toContain('bg-amber-950/30')
  })

  it('sorts rows by name when clicking the name header', async () => {
    const user = userEvent.setup()
    render(<InventoryTable />)

    await user.click(screen.getByText('Name'))

    const firstRow = screen.getByRole('table').querySelector('tbody tr')
    expect(firstRow?.textContent).toContain('Bottled Water 500ml')
  })

  it('shows admin actions for ADMIN role', () => {
    render(<InventoryTable />)

    expect(
      screen.getByRole('button', { name: 'Add Product' })
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Edit Espresso Beans 1kg')).toBeInTheDocument()
    expect(
      screen.getByLabelText('Delete Espresso Beans 1kg')
    ).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('hides all admin actions for CASHIER role', () => {
    useAuthStore.setState({ role: 'CASHIER' })
    render(<InventoryTable />)

    expect(
      screen.queryByRole('button', { name: 'Add Product' })
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/edit espresso/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/delete espresso/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Actions')).not.toBeInTheDocument()
  })

  it('opens the edit modal prefilled from the table', async () => {
    const user = userEvent.setup()
    render(<InventoryTable />)

    await user.click(screen.getByLabelText('Edit Espresso Beans 1kg'))

    expect(screen.getByText('Edit Product')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Espresso Beans 1kg')
    expect(screen.getByLabelText('Quantity')).toHaveValue(0)
  })

  it('creates a product through the modal and shows it in the table', async () => {
    const user = userEvent.setup()
    render(<InventoryTable />)

    await user.click(screen.getByRole('button', { name: 'Add Product' }))
    await user.type(screen.getByLabelText('Name'), 'Green Tea Box')
    await user.type(screen.getByLabelText('SKU'), 'TEA-009')
    await user.type(screen.getByLabelText('Category'), 'Beverages')
    await user.type(screen.getByLabelText('Quantity'), '40')
    await user.type(screen.getByLabelText('Min Threshold'), '10')
    await user.type(screen.getByLabelText('Purchase Price'), '3')
    await user.type(screen.getByLabelText('Selling Price'), '8')

    await user.click(screen.getByRole('button', { name: 'Create Product' }))

    expect(screen.getByText('Green Tea Box')).toBeInTheDocument()
  })

  it('deletes a product after confirmation', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<InventoryTable />)

    await user.click(screen.getByLabelText('Delete Espresso Beans 1kg'))

    expect(confirmSpy).toHaveBeenCalled()
    expect(screen.queryByText('Espresso Beans 1kg')).not.toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('keeps the product when delete is cancelled', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<InventoryTable />)

    await user.click(screen.getByLabelText('Delete Espresso Beans 1kg'))

    expect(screen.getByText('Espresso Beans 1kg')).toBeInTheDocument()
    confirmSpy.mockRestore()
  })
})
