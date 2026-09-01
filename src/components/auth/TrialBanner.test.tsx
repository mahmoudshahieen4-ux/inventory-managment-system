import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { render, screen } from '@/test/test-utils'
import { useLicenseStore } from '@/store/useLicenseStore'
import { TrialBanner } from './TrialBanner'

const HOUR_MS = 3_600_000

describe('TrialBanner', () => {
  beforeEach(() => {
    useLicenseStore.setState({
      licenseKey: null,
      status: 'TRIAL',
      activationDate: null,
      expirationDate: null,
      isTrial: true,
      firstRunDate: new Date().toISOString(),
      trialExpirationDate: new Date(Date.now() + 50 * HOUR_MS).toISOString(),
      lastActiveTime: new Date().toISOString(),
      initialized: true,
    })
  })

  it('shows the remaining trial time and a buy-now button', () => {
    render(<TrialBanner />)

    expect(screen.getByText(/Trial Period/)).toBeInTheDocument()
    // 50 h remaining → 2 days + some hours.
    expect(screen.getByText(/2d \d+h remaining/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Buy Now / Activate' })
    ).toBeInTheDocument()
  })

  it('returns null outside TRIAL status', () => {
    useLicenseStore.setState({ status: 'ACTIVE' })

    const { container } = render(<TrialBanner />)

    expect(container).toBeEmptyDOMElement()
  })

  it('opens the dismissable activation overlay from the banner', async () => {
    const user = userEvent.setup()
    render(<TrialBanner />)

    await user.click(screen.getByRole('button', { name: 'Buy Now / Activate' }))
    // The activation modal appears over the app.
    expect(await screen.findByText('Activation Required')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Activation Required')).not.toBeInTheDocument()
  })
})
