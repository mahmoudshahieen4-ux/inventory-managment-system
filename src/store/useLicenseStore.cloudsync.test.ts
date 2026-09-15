import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LicenseSyncResult } from '@/services/licenseSync'
import type { LicenseRecord } from '@/types/license'
import { CLOUD_SYNC_TIMEOUT_MS, useLicenseStore } from './useLicenseStore'

/** Mocked SQLite persistence layer so the store runs "in Tauri". */
const dbMocks = vi.hoisted(() => ({
  isTauriRuntime: () => true,
  initializeDatabase: () => Promise.resolve(),
  fetchLicenseRow: vi.fn<() => Promise<LicenseRecord | null>>(() =>
    Promise.resolve(null)
  ),
  persistLicense: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}))

/** Mocked cloud sync — hangs by default so the timeout guard is exercised. */
const syncMocks = vi.hoisted(() => ({
  syncSubscriptionWithCloud: vi.fn<() => Promise<LicenseSyncResult>>(),
}))

vi.mock('@/services/db', () => dbMocks)
vi.mock('@/services/licenseSync', () => syncMocks)

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

describe('useLicenseStore · cloud-sync hang guard', () => {
  beforeEach(() => {
    resetState()
    vi.clearAllMocks()
    syncMocks.syncSubscriptionWithCloud.mockImplementation(
      () =>
        new Promise<never>(() => {
          // Never settles — exercises the cloud-sync timeout guard.
        })
    )
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('unlocks the app when the boot cloud sync never answers', async () => {
    // First launch: no stored row → the local auto-trial drives the state.
    dbMocks.fetchLicenseRow.mockResolvedValue(null)

    const initialize = useLicenseStore.getState().initialize('ABCD1234')

    // Flush initialize()'s microtasks up to the hanging sync await...
    await vi.advanceTimersByTimeAsync(0)
    // ...then run out the safety-net timer instead of waiting forever.
    await vi.advanceTimersByTimeAsync(CLOUD_SYNC_TIMEOUT_MS)
    await initialize

    const state = useLicenseStore.getState()
    expect(state.initialized).toBe(true)
    expect(state.status).toBe('TRIAL')
    expect(syncMocks.syncSubscriptionWithCloud).toHaveBeenCalledWith('ABCD1234')
  })

  it('applies the cloud result when the sync answers before the timeout', async () => {
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
    syncMocks.syncSubscriptionWithCloud.mockImplementation(() =>
      Promise.resolve({ outcome: 'NO_SUBSCRIPTION', record: null })
    )

    const initialize = useLicenseStore.getState().initialize('ABCD1234')
    await vi.advanceTimersByTimeAsync(0)
    await initialize

    const state = useLicenseStore.getState()
    expect(state.initialized).toBe(true)
    expect(state.status).toBe('TRIAL')
  })
})
