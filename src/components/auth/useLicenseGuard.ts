import { useEffect } from 'react'

import { useLicenseStore } from '@/store/useLicenseStore'

/** License expiration re-check interval: 1 hour. */
export const LICENSE_CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * Runs license initialization on startup, then re-checks expiration every
 * hour so an expired license locks the app without waiting for a restart.
 */
export function useLicenseGuard(): void {
  useEffect(() => {
    let intervalId: number | undefined
    void useLicenseStore
      .getState()
      .initialize()
      .finally(() => {
        void useLicenseStore.getState().runExpirationCheck()
        intervalId = window.setInterval(() => {
          void useLicenseStore.getState().runExpirationCheck()
        }, LICENSE_CHECK_INTERVAL_MS)
      })
    return () => {
      if (intervalId !== undefined) window.clearInterval(intervalId)
    }
  }, [])
}
