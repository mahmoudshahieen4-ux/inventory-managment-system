import { beforeEach, describe, expect, it } from 'vitest'

import { getHardwareId } from '@/services/hardware-id'
import { generateLicenseKey } from '@/lib/license-key'
import type { LicenseRecord } from '@/types/license'
import { TRIAL_DAYS, useLicenseStore } from './useLicenseStore'

const DAY_MS = 86_400_000

/** Resets the license slice to a pristine UNREGISTERED state. */
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
    initialized: false,
  })
}

describe('useLicenseStore', () => {
  beforeEach(() => {
    resetState()
  })

  it('starts UNREGISTERED and uninitialized', () => {
    const state = useLicenseStore.getState()

    expect(state.status).toBe('UNREGISTERED')
    expect(state.initialized).toBe(false)
    expect(state.licenseKey).toBeNull()
  })

  it('applies the dev bypass on initialize outside Tauri', async () => {
    await useLicenseStore.getState().initialize()
    const state = useLicenseStore.getState()

    expect(state.initialized).toBe(true)
    expect(state.status).toBe('ACTIVE')
  })

  it('activates a valid key for this machine and unlocks the app', async () => {
    const { machineId } = await getHardwareId()
    const key = generateLicenseKey(
      machineId,
      new Date(Date.now() + 365 * DAY_MS)
    )

    const record = await useLicenseStore.getState().activate(key)
    const state = useLicenseStore.getState()

    expect(record).not.toBeNull()
    expect(state.status).toBe('ACTIVE')
    expect(state.licenseKey).toBe(key)
    expect(state.isTrial).toBe(false)
    expect(state.activationDate).toBeTruthy()
    expect(Date.parse(state.expirationDate ?? '')).toBeGreaterThan(Date.now())
  })

  it('rejects a key bound to another machine and stays locked', async () => {
    const key = generateLicenseKey(
      'FFFFFFFF',
      new Date(Date.now() + 365 * DAY_MS)
    )

    const record = await useLicenseStore.getState().activate(key)

    expect(record).toBeNull()
    expect(useLicenseStore.getState().status).toBe('UNREGISTERED')
    expect(useLicenseStore.getState().licenseKey).toBeNull()
  })

  it('rejects a garbage key', async () => {
    const record = await useLicenseStore.getState().activate('not-a-key')

    expect(record).toBeNull()
    expect(useLicenseStore.getState().status).toBe('UNREGISTERED')
  })

  it('starts a 3-day free trial in TRIAL status', async () => {
    await useLicenseStore.getState().startTrial()
    const state = useLicenseStore.getState()

    expect(state.status).toBe('TRIAL')
    expect(state.isTrial).toBe(true)
    expect(state.licenseKey).toBeNull()
    expect(state.firstRunDate).toBeTruthy()
    expect(state.lastActiveTime).toBeTruthy()
    expect(TRIAL_DAYS).toBe(3)

    const remainingDays =
      (Date.parse(state.trialExpirationDate ?? '') - Date.now()) / DAY_MS
    expect(remainingDays).toBeGreaterThan(TRIAL_DAYS - 0.1)
    expect(remainingDays).toBeLessThanOrEqual(TRIAL_DAYS)
  })

  it('transitions ACTIVE licenses to EXPIRED once the expiration passes', async () => {
    useLicenseStore.setState({
      status: 'ACTIVE',
      expirationDate: new Date(Date.now() - DAY_MS).toISOString(),
      isTrial: true,
    } as Partial<LicenseRecord>)

    const result = await useLicenseStore.getState().runExpirationCheck()

    expect(result).toBe('EXPIRED')
    expect(useLicenseStore.getState().status).toBe('EXPIRED')
  })

  it('warns when expiring within the grace window without expiring', async () => {
    useLicenseStore.setState({
      status: 'ACTIVE',
      expirationDate: new Date(Date.now() + 2 * DAY_MS).toISOString(),
    } as Partial<LicenseRecord>)

    const result = await useLicenseStore.getState().runExpirationCheck()

    expect(result).toBe('EXPIRING_SOON')
    expect(useLicenseStore.getState().status).toBe('ACTIVE')
  })

  it('returns OK for a comfortably valid license', async () => {
    useLicenseStore.setState({
      status: 'ACTIVE',
      expirationDate: new Date(Date.now() + 30 * DAY_MS).toISOString(),
    } as Partial<LicenseRecord>)

    expect(await useLicenseStore.getState().runExpirationCheck()).toBe('OK')
  })

  it('reports EXPIRED for an already-expired license', async () => {
    useLicenseStore.setState({ status: 'EXPIRED' } as Partial<LicenseRecord>)

    expect(await useLicenseStore.getState().runExpirationCheck()).toBe(
      'EXPIRED'
    )
  })
})
