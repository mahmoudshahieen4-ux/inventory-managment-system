import { useEffect } from 'react'

import { isTauriRuntime } from '@/services/db'
import { getHardwareId } from '@/services/hardware-id'
import { logger } from '@/lib/logger'
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

    // The IIFE must never die silently: `initialized` only flips inside the
    // store's initialize(), so a swallowed rejection here would leave the
    // app stuck on the "loading database" screen forever.
    void (async () => {
      // A failed fingerprint must not block initialization — continue with
      // machineId undefined so the store initializes from the local record
      // and simply skips the cloud reconciliation.
      let machineId: string | undefined
      if (isTauriRuntime()) {
        try {
          machineId = (await getHardwareId()).machineId
        } catch (error) {
          logger.warn(
            '[license] hardware id unavailable — initializing without cloud sync',
            { error }
          )
        }
      }
      if (cancelled) return

      await useLicenseStore.getState().initialize(machineId)
      if (cancelled) return

      void useLicenseStore.getState().runExpirationCheck()
      intervalId = window.setInterval(() => {
        void useLicenseStore.getState().runExpirationCheck()
      }, LICENSE_CHECK_INTERVAL_MS)
    })().catch(error => {
      logger.error('[license] startup license initialization crashed', {
        error,
      })
    })

    return () => {
      cancelled = true
      if (intervalId !== undefined) window.clearInterval(intervalId)
    }
  }, [])
}
