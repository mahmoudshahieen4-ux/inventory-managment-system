import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { render, screen } from '@/test/test-utils'
import { useLicenseStore } from '@/store/useLicenseStore'
import { GracePeriodBanner } from './GracePeriodBanner'

const DAY_MS = 86_400_000

describe('GracePeriodBanner', () => {
  beforeEach(() => {
    useLicenseStore.setState({
      licenseKey: 'ABCD-EF01-2345-6789',
      status: 'ACTIVE',
      activationDate: new Date().toISOString(),
      expirationDate: new Date(Date.now() + 2 * DAY_MS).toISOString(),
      isTrial: false,
      daysRemaining: 2,
      graceWarning: true,
      initialized: true,
    })
  })

  it('warns when an ACTIVE subscription expires within 3 days', () => {
    render(<GracePeriodBanner />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Subscription Ending Soon/)).toBeInTheDocument()
    expect(screen.getByText(/Expires in 2 day/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Renew Now' })
    ).toBeInTheDocument()
  })

  it('returns null while the subscription is healthy', () => {
    useLicenseStore.setState({ graceWarning: false, daysRemaining: 30 })

    const { container } = render(<GracePeriodBanner />)

    expect(container).toBeEmptyDOMElement()
  })

  it('returns null for the TRIAL status', () => {
    useLicenseStore.setState({ status: 'TRIAL' })

    const { container } = render(<GracePeriodBanner />)

    expect(container).toBeEmptyDOMElement()
  })

  it('returns null for the EXPIRED status', () => {
    useLicenseStore.setState({ status: 'EXPIRED' })

    const { container } = render(<GracePeriodBanner />)

    expect(container).toBeEmptyDOMElement()
  })

  it('opens the dismissable activation overlay from the banner', async () => {
    const user = userEvent.setup()
    render(<GracePeriodBanner />)

    await user.click(screen.getByRole('button', { name: 'Renew Now' }))
    // While the license is still ACTIVE the overlay shows the activation
    // variant (same behavior as the trial banner).
    expect(await screen.findByText('Activation Required')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Activation Required')).not.toBeInTheDocument()
  })
})
