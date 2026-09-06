import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test/test-utils'
import { useLicenseStore } from '@/store/useLicenseStore'
import { SubscriptionBanner } from './SubscriptionBanner'

// Deterministic hardware fingerprint for every test.
vi.mock('@/services/hardware-id', () => ({
  getHardwareId: () =>
    Promise.resolve({
      machineId: 'AABBCCDD',
      displayId: 'AABB-CCDD-1122-3344',
    }),
}))

const DAY_MS = 86_400_000

describe('SubscriptionBanner', () => {
  beforeEach(() => {
    useLicenseStore.setState({
      licenseKey: 'ABCD-EF01-2345-6789',
      status: 'ACTIVE',
      activationDate: new Date().toISOString(),
      expirationDate: new Date(Date.now() + 2 * DAY_MS).toISOString(),
      isTrial: false,
      daysRemaining: 2,
      isExpiringSoon: true,
      graceWarning: true,
      initialized: true,
    })
  })

  it('warns when an ACTIVE subscription expires within 3 days', () => {
    render(<SubscriptionBanner />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Warning: 2 day/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Renew Now / Contact Support' })
    ).toBeInTheDocument()
  })

  it('returns null while the subscription is healthy', () => {
    useLicenseStore.setState({
      isExpiringSoon: false,
      graceWarning: false,
      daysRemaining: 30,
    })

    const { container } = render(<SubscriptionBanner />)

    expect(container).toBeEmptyDOMElement()
  })

  it('returns null for the TRIAL status', () => {
    useLicenseStore.setState({
      status: 'TRIAL',
      isExpiringSoon: false,
      graceWarning: false,
      daysRemaining: null,
    })

    const { container } = render(<SubscriptionBanner />)

    expect(container).toBeEmptyDOMElement()
  })

  it('returns null for the EXPIRED status', () => {
    useLicenseStore.setState({
      status: 'EXPIRED',
      isExpiringSoon: false,
      graceWarning: false,
      daysRemaining: null,
    })

    const { container } = render(<SubscriptionBanner />)

    expect(container).toBeEmptyDOMElement()
  })

  it('opens the renewal dialog with machine ID and support details', async () => {
    const user = userEvent.setup()
    render(<SubscriptionBanner />)

    await user.click(
      screen.getByRole('button', { name: 'Renew Now / Contact Support' })
    )

    expect(
      await screen.findByText('Renew Your Subscription')
    ).toBeInTheDocument()
    expect(screen.getByText('Hardware ID')).toBeInTheDocument()
    expect(await screen.findByText('AABB-CCDD-1122-3344')).toBeInTheDocument()
    expect(screen.getByText('Days remaining')).toBeInTheDocument()
    expect(screen.getByText('2 days')).toBeInTheDocument()
    expect(screen.getByText('Contact on WhatsApp')).toBeInTheDocument()
  })
})
