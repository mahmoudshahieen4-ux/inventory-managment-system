import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useInventoryStore } from '@/store/useInventoryStore'
import { usePayrollStore } from '@/store/usePayrollStore'
import { useSalesStore } from '@/store/useSalesStore'
import { useUIStore } from '@/store/ui-store'
import { BOOTSTRAP_TIMEOUT_MS, useAppBootstrap } from './bootstrap'

/** Toggleable './db' stub: real-runtime off by default, hang on demand. */
const dbMocks = vi.hoisted(() => ({
  tauriRuntime: false,
  hangCleanup: false,
}))

vi.mock('./db', () => ({
  isTauriRuntime: () => dbMocks.tauriRuntime,
  cleanupOldSalesData: () =>
    dbMocks.hangCleanup
      ? new Promise<void>(() => {
          // Never settles — exercises the bootstrap timeout.
        })
      : Promise.resolve(),
}))

describe('useAppBootstrap', () => {
  beforeEach(() => {
    dbMocks.tauriRuntime = false
    dbMocks.hangCleanup = false
    useUIStore.setState({ isDbInitializing: false })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('is a no-op outside the Tauri runtime (no loading flag, no state changes)', () => {
    renderHook(() => useAppBootstrap())

    // jsdom is not the desktop runtime, so hydration never starts.
    expect(useUIStore.getState().isDbInitializing).toBe(false)
  })

  it('clears the loading flag when a startup task hangs (timeout safety net)', async () => {
    dbMocks.tauriRuntime = true
    dbMocks.hangCleanup = true
    vi.useFakeTimers()

    // A hydrate that never settles (wedged plugin call) must not keep the
    // "loading database" spinner up forever.
    const hang = () =>
      new Promise<void>(() => {
        // Never settles — exercises the bootstrap timeout.
      })
    vi.spyOn(useInventoryStore.getState(), 'hydrate').mockImplementation(hang)
    vi.spyOn(useSalesStore.getState(), 'hydrate').mockImplementation(hang)
    vi.spyOn(usePayrollStore.getState(), 'hydrate').mockImplementation(hang)

    renderHook(() => useAppBootstrap())

    // The effect flips the flag synchronously on mount.
    expect(useUIStore.getState().isDbInitializing).toBe(true)

    // Flush the effect's microtasks, then run out the safety-net timer.
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(BOOTSTRAP_TIMEOUT_MS)

    expect(useUIStore.getState().isDbInitializing).toBe(false)
  })
})
