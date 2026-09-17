import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '@/test/test-utils'
import { useAuthStore } from '@/store/useAuthStore'
import { fetchFullAnalytics } from '@/services/db'
import { ProductAnalyticsPage } from './ProductAnalyticsPage'

vi.mock('@/services/db', () => ({
  fetchFullAnalytics: vi.fn(async () => ({
    summary: {
      totalUnitsSold: 0,
      totalRevenue: 0,
      totalProfit: 0,
      deadStockValue: 0,
    },
    productPerformance: [],
    deadStock: [],
    highestMargins: [],
  })),
}))

describe('analytics range selector', () => {
  it('loads today, week and month using the selected range', async () => {
    useAuthStore.setState({
      currentUser: {
        id: 'admin',
        username: 'admin',
        displayName: 'Admin',
        role: 'ADMIN',
      },
    })
    const user = userEvent.setup()
    render(<ProductAnalyticsPage />)
    await waitFor(() =>
      expect(fetchFullAnalytics).toHaveBeenLastCalledWith('TODAY')
    )
    await user.click(screen.getByRole('radio', { name: 'This Week' }))
    await waitFor(() =>
      expect(fetchFullAnalytics).toHaveBeenLastCalledWith('1_WEEK')
    )
    await user.click(screen.getByRole('radio', { name: 'This Month' }))
    await waitFor(() =>
      expect(fetchFullAnalytics).toHaveBeenLastCalledWith('1_MONTH')
    )
  })
})
