import { useEffect } from 'react'

import { isTauriRuntime } from '@/services/db'
import { getHardwareId } from '@/services/hardware-id'
import { useLicenseStore } from '@/store/useLicenseStore'

/** License expiration re-check interval: 1 hour. */
export const LICENSE_CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * Runs license initialization on startup, then re-checks expiration every
 * hour so an expired license locks the app without waiting for a restart.
 *
 * On boot the machine fingerprint is passed to the store so it can reconcile
 * the local SQLite license with the Supabase subscription (online) or fall
 * back to the last known local state (offline).
 */
export function useLicenseGuard(): void {
  useEffect(() => {
    let intervalId: number | undefined
    let cancelled = false

    void (async () => {
      const machineId = isTauriRuntime()
        ? (await getHardwareId()).machineId
        : undefined
      if (cancelled) return

      await useLicenseStore.getState().initialize(machineId)
      if (cancelled) return

      void useLicenseStore.getState().runExpirationCheck()
      intervalId = window.setInterval(() => {
        void useLicenseStore.getState().runExpirationCheck()
      }, LICENSE_CHECK_INTERVAL_MS)
    })()

    return () => {
      cancelled = true
      if (intervalId !== undefined) window.clearInterval(intervalId)
    }
  }, [])
}
