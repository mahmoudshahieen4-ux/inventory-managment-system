import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test/test-utils'
import { generateLicenseKey } from '@/lib/license-key'
import { useLicenseStore } from '@/store/useLicenseStore'
import { LicenseLockModal } from './LicenseLockModal'

// Deterministic hardware fingerprint for every test.
vi.mock('@/services/hardware-id', () => ({
  getHardwareId: () =>
    Promise.resolve({
      machineId: 'AABBCCDD',
      displayId: 'AABB-CCDD-1122-3344',
    }),
}))

const DAY_MS = 86_400_000

function resetState(): void {
  useLicenseStore.setState({
    licenseKey: null,
    status: 'UNREGISTERED',
    activationDate: null,
    expirationDate: null,
    isTrial: false,
    firstRunDate: null,
    trialExpirationDate: null,
    lastActiveTime: null,
    initialized: true,
  })
}

describe('LicenseLockModal', () => {
  beforeEach(() => {
    resetState()
  })

  it('renders a non-dismissable lock screen with the hardware ID and serial input', async () => {
    render(<LicenseLockModal />)

    expect(screen.getByText('Activation Required')).toBeInTheDocument()
    // The hardware fingerprint resolves asynchronously.
    expect(await screen.findByText('AABB-CCDD-1122-3344')).toBeInTheDocument()
    expect(screen.getByLabelText('Serial Key')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Activate Now' })
    ).toBeInTheDocument()
  })

  it('offers the trial while unregistered and shows the renewal variant when expired', () => {
    const { rerender } = render(<LicenseLockModal />)

    expect(
      screen.getByRole('button', { name: 'Start 3-Day Free Trial' })
    ).toBeInTheDocument()

    useLicenseStore.setState({ status: 'EXPIRED' })
    rerender(<LicenseLockModal />)

    expect(screen.getByText('License Expired')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Start 3-Day Free Trial' })
    ).not.toBeInTheDocument()
    // Support links stay available for renewals
    expect(screen.getByText('Contact on WhatsApp')).toBeInTheDocument()
  })

  it('activates a valid key and unlocks the application', async () => {
    const user = userEvent.setup()
    render(<LicenseLockModal />)

    const key = generateLicenseKey(
      'AABBCCDD',
      new Date(Date.now() + 365 * DAY_MS)
    )
    await user.type(screen.getByLabelText('Serial Key'), key)
    await user.click(screen.getByRole('button', { name: 'Activate Now' }))

    expect(useLicenseStore.getState().status).toBe('ACTIVE')
    expect(useLicenseStore.getState().licenseKey).toBe(key)
    expect(useLicenseStore.getState().isTrial).toBe(false)
  })

  it('keeps the app locked and shows an inline error for an invalid key', async () => {
    const user = userEvent.setup()
    render(<LicenseLockModal />)

    await user.type(screen.getByLabelText('Serial Key'), '1234-5678-9ABC-DEF0')
    await user.click(screen.getByRole('button', { name: 'Activate Now' }))

    expect(
      await screen.findByText('Invalid serial key for this device.')
    ).toBeInTheDocument()
    expect(useLicenseStore.getState().status).toBe('UNREGISTERED')
  })

  it('starts a trial from the lock screen', async () => {
    const user = userEvent.setup()
    render(<LicenseLockModal />)

    await user.click(
      screen.getByRole('button', { name: 'Start 3-Day Free Trial' })
    )

    expect(useLicenseStore.getState().status).toBe('TRIAL')
    expect(useLicenseStore.getState().isTrial).toBe(true)
  })
})
