import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen } from '@/test/test-utils'
import { useSalesStore } from '@/store/useSalesStore'
import type { Sale } from '@/types/sales'
import { SalesHistory } from './SalesHistory'

function sale(id: string, daysAgo: number, offset = 0): Sale {
  return {
    id,
    invoiceNumber: id,
    items: [],
    subtotal: 10,
    tax: 0,
    total: 10,
    cashierId: 'cashier',
    createdAt: new Date(
      new Date(2026, 8, 16 - daysAgo).getTime() + offset
    ).toISOString(),
  }
}

describe('SalesHistory ranges', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 16, 15))
    useSalesStore.setState({
      sales: [
        sale('INV-TODAY', 0),
        sale('INV-YESTERDAY', 0, -1),
        sale('INV-WEEK', 7),
        sale('INV-BEFORE-WEEK', 7, -1),
        sale('INV-MONTH', 30),
        sale('INV-OLD', 30, -1),
      ],
    })
  })
  afterEach(() => vi.useRealTimers())

  it('includes exact boundaries and combines range with invoice search', async () => {
    const user = userEvent.setup()
    const onReprint = vi.fn()
    render(<SalesHistory onReprint={onReprint} onReturn={vi.fn()} />)
    expect(screen.getByText('INV-TODAY')).toBeInTheDocument()
    expect(screen.queryByText('INV-YESTERDAY')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'This Week' }))
    expect(screen.getByText('INV-WEEK')).toBeInTheDocument()
    expect(screen.queryByText('INV-BEFORE-WEEK')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'This Month' }))
    expect(screen.getByText('INV-MONTH')).toBeInTheDocument()
    expect(screen.queryByText('INV-OLD')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Search invoices'), 'inv-month')
    expect(screen.queryByText('INV-TODAY')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('Re-print receipt INV-MONTH'))
    expect(onReprint).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'INV-MONTH' })
    )
    await user.click(screen.getByRole('radio', { name: 'Today' }))
    expect(screen.getByRole('status')).toHaveTextContent(
      'No sales match these filters.'
    )
    expect(
      screen.getByRole('radio', { name: 'This Month' })
    ).toBeInTheDocument()
  })
})
