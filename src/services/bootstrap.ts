import { useEffect } from 'react'

import { withTimeout } from '@/lib/timeout'
import { cleanupOldSalesData, isTauriRuntime } from './db'
import { useInventoryStore } from '@/store/useInventoryStore'
import { usePayrollStore } from '@/store/usePayrollStore'
import { useSalesStore } from '@/store/useSalesStore'
import { useUIStore } from '@/store/ui-store'

/** Hard cap on the startup hydration so a hung task can never freeze the UI. */
export const BOOTSTRAP_TIMEOUT_MS = 20_000

/**
 * Loads persisted data from SQLite into the stores on application mount
 * (desktop runtime only — a no-op in the browser / tests). Flips the global
 * `isDbInitializing` flag while running so the UI can show a loading state.
 * Failures are toasted inside the stores' `hydrate()` implementations.
 */
export function useAppBootstrap(): void {
  useEffect(() => {
    if (!isTauriRuntime()) return

    let cancelled = false
    const { setDbInitializing } = useUIStore.getState()
    setDbInitializing(true)

    // Timeout safety net: every hydrate already toasts its own failures, but
    // a task that never settles (e.g. a wedged plugin call) must not keep the
    // "loading database" spinner up forever. Timeouts are logged by
    // withTimeout and surface as a warning in the console.
    withTimeout(
      Promise.all([
        cleanupOldSalesData(),
        useInventoryStore.getState().hydrate(),
        useSalesStore.getState().hydrate(),
        usePayrollStore.getState().hydrate(),
      ]),
      BOOTSTRAP_TIMEOUT_MS,
      { label: 'database bootstrap' }
    )
      .then(() => {
        if (!cancelled) setDbInitializing(false)
      })
      .catch(() => {
        // Error toast already shown by the failing hydrate; a timeout was
        // already logged by withTimeout.
        if (!cancelled) setDbInitializing(false)
      })

    return () => {
      cancelled = true
    }
  }, [])
}
