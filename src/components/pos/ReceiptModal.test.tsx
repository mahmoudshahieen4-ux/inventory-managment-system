import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test/test-utils'
import type { Sale } from '@/types/sales'
import { ReceiptModal } from './ReceiptModal'

const sale: Sale = {
  id: 'sale-1',
  invoiceNumber: 'INV-0001',
  items: [
    {
      productId: 'prod-1',
      sku: 'SNK-004',
      name: 'Dark Chocolate Bar',
      unitPrice: 2.49,
      quantity: 2,
      lineTotal: 4.98,
    },
  ],
  subtotal: 4.98,
  tax: 0.25,
  total: 5.23,
  cashierId: 'CASHIER',
  createdAt: '2026-08-31T10:30:00.000Z',
}

describe('ReceiptModal', () => {
  it('renders nothing when there is no sale', () => {
    render(<ReceiptModal sale={null} open onOpenChange={vi.fn()} />)

    expect(screen.queryByText('Receipt')).not.toBeInTheDocument()
  })

  it('shows the store header, invoice number and cashier', () => {
    render(<ReceiptModal sale={sale} open onOpenChange={vi.fn()} />)

    expect(screen.getByText('My Store')).toBeInTheDocument()
    expect(screen.getByText('123 Main Street, City Center')).toBeInTheDocument()
    expect(screen.getByText('+1 (555) 123-4567')).toBeInTheDocument()
    expect(screen.getByText(/Invoice No\.: INV-0001/)).toBeInTheDocument()
    expect(screen.getByText(/Cashier: Cashier/)).toBeInTheDocument()
    expect(screen.getByText(/Date:/)).toBeInTheDocument()
  })

  it('renders the itemized table with quantities, unit prices and line totals', () => {
    render(<ReceiptModal sale={sale} open onOpenChange={vi.fn()} />)

    expect(
      screen.getByRole('columnheader', { name: 'Item' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: 'Qty' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: 'Unit Price' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: 'Total' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('cell', { name: 'Dark Chocolate Bar' })
    ).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '4.98 ج.م' })).toBeInTheDocument()
  })

  it('shows subtotal, tax, final amount and the footer note', () => {
    render(<ReceiptModal sale={sale} open onOpenChange={vi.fn()} />)

    expect(screen.getByText('Subtotal')).toBeInTheDocument()
    expect(screen.getByText('Tax')).toBeInTheDocument()
    expect(screen.getByText('Final Total')).toBeInTheDocument()
    expect(
      screen.getByText('شكراً لزيارتكم / Thank you for your visit!')
    ).toBeInTheDocument()
  })

  it('prints via window.print and closes through the Close button', async () => {
    const user = userEvent.setup()
    const printSpy = vi.spyOn(window, 'print').mockImplementation(vi.fn())
    const onOpenChange = vi.fn()
    render(<ReceiptModal sale={sale} open onOpenChange={onOpenChange} />)

    await user.click(screen.getByRole('button', { name: 'Print Receipt' }))
    expect(printSpy).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Export as PDF' }))
    expect(printSpy).toHaveBeenCalledTimes(2)

    // The dialog's built-in "X" shares the accessible name "Close"; pick the footer button
    const closeButton = screen.getAllByRole('button', {
      name: 'Close',
    })[0] as HTMLElement
    await user.click(closeButton)
    expect(onOpenChange).toHaveBeenCalledWith(false)

    printSpy.mockRestore()
  })
})
