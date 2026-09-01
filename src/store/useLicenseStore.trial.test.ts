import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LicenseRecord } from '@/types/license'
import { TRIAL_DAYS, useLicenseStore } from './useLicenseStore'

const DAY_MS = 86_400_000

/** Mocked SQLite persistence layer so the trial logic runs "in Tauri". */
const dbMocks = vi.hoisted(() => ({
  isTauriRuntime: () => true,
  initializeDatabase: () => Promise.resolve(),
  fetchLicenseRow: vi.fn<() => Promise<LicenseRecord | null>>(() =>
    Promise.resolve(null)
  ),
  persistLicense: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}))

vi.mock('@/services/db', () => dbMocks)

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

describe('useLicenseStore · 3-day trial', () => {
  beforeEach(() => {
    resetState()
    vi.clearAllMocks()
  })

  it('auto-starts a 3-day TRIAL on first launch (no stored row)', async () => {
    dbMocks.fetchLicenseRow.mockResolvedValue(null)

    await useLicenseStore.getState().initialize()
    const state = useLicenseStore.getState()

    expect(state.initialized).toBe(true)
    expect(state.status).toBe('TRIAL')
    expect(state.isTrial).toBe(true)
    expect(state.firstRunDate).toBeTruthy()
    expect(state.lastActiveTime).toBeTruthy()

    const remainingMs = Date.parse(state.trialExpirationDate ?? '') - Date.now()
    expect(remainingMs).toBeGreaterThan(TRIAL_DAYS * DAY_MS - 60_000)
    expect(remainingMs).toBeLessThanOrEqual(TRIAL_DAYS * DAY_MS)
    expect(dbMocks.persistLicense).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'TRIAL', isTrial: true })
    )
  })

  it('starts a trial for a legacy UNREGISTERED row without trial fields', async () => {
    dbMocks.fetchLicenseRow.mockResolvedValue({
      licenseKey: null,
      status: 'UNREGISTERED',
      activationDate: null,
      expirationDate: null,
      isTrial: false,
      firstRunDate: null,
      trialExpirationDate: null,
      lastActiveTime: null,
    } as LicenseRecord)

    await useLicenseStore.getState().initialize()

    expect(useLicenseStore.getState().status).toBe('TRIAL')
  })

  it('does NOT restart a trial for a stored ACTIVE license', async () => {
    dbMocks.fetchLicenseRow.mockResolvedValue({
      licenseKey: 'ABCD-EF01',
      status: 'ACTIVE',
      activationDate: new Date().toISOString(),
      expirationDate: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      isTrial: false,
      firstRunDate: null,
      trialExpirationDate: null,
      lastActiveTime: null,
    } as LicenseRecord)

    await useLicenseStore.getState().initialize()
    const state = useLicenseStore.getState()

    expect(state.status).toBe('ACTIVE')
    expect(state.licenseKey).toBe('ABCD-EF01')
    expect(dbMocks.persistLicense).not.toHaveBeenCalled()
  })

  it('loads an existing TRIAL record without resetting its timestamps', async () => {
    const firstRun = new Date(Date.now() - DAY_MS).toISOString()
    dbMocks.fetchLicenseRow.mockResolvedValue({
      licenseKey: null,
      status: 'TRIAL',
      activationDate: null,
      expirationDate: null,
      isTrial: true,
      firstRunDate: firstRun,
      trialExpirationDate: new Date(Date.now() + 2 * DAY_MS).toISOString(),
      lastActiveTime: firstRun,
    } as LicenseRecord)

    await useLicenseStore.getState().initialize()

    expect(useLicenseStore.getState().status).toBe('TRIAL')
    expect(useLicenseStore.getState().firstRunDate).toBe(firstRun)
  })

  it('locks immediately when the system clock is rolled back', async () => {
    useLicenseStore.setState({
      status: 'TRIAL',
      firstRunDate: new Date(Date.now() - DAY_MS).toISOString(),
      trialExpirationDate: new Date(Date.now() + 2 * DAY_MS).toISOString(),
      lastActiveTime: new Date(Date.now() + DAY_MS).toISOString(),
      initialized: true,
    } as Partial<LicenseRecord>)

    const result = await useLicenseStore.getState().runExpirationCheck()

    expect(result).toBe('EXPIRED')
    expect(useLicenseStore.getState().status).toBe('EXPIRED')
    expect(dbMocks.persistLicense).toHaveBeenCalled()
  })

  it('locks when the trial period has elapsed', async () => {
    useLicenseStore.setState({
      status: 'TRIAL',
      firstRunDate: new Date(Date.now() - 4 * DAY_MS).toISOString(),
      trialExpirationDate: new Date(Date.now() - DAY_MS).toISOString(),
      lastActiveTime: new Date(Date.now() - 2 * DAY_MS).toISOString(),
      initialized: true,
    } as Partial<LicenseRecord>)

    const result = await useLicenseStore.getState().runExpirationCheck()

    expect(result).toBe('EXPIRED')
    expect(useLicenseStore.getState().status).toBe('EXPIRED')
  })

  it('keeps a valid trial active and pulses the last-active timestamp', async () => {
    const before = new Date(Date.now() - 3_600_000).toISOString()
    useLicenseStore.setState({
      status: 'TRIAL',
      firstRunDate: new Date(Date.now() - DAY_MS).toISOString(),
      trialExpirationDate: new Date(Date.now() + 2 * DAY_MS).toISOString(),
      lastActiveTime: before,
      initialized: true,
    } as Partial<LicenseRecord>)

    const result = await useLicenseStore.getState().runExpirationCheck()
    const state = useLicenseStore.getState()

    expect(result).toBe('TRIAL')
    expect(state.status).toBe('TRIAL')
    expect(Date.parse(state.lastActiveTime ?? '')).toBeGreaterThan(
      Date.parse(before)
    )
    expect(dbMocks.persistLicense).toHaveBeenCalled()
  })
})
