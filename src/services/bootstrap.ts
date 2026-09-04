import { useEffect } from 'react'

import { cleanupOldSalesData, isTauriRuntime } from './db'
import { useInventoryStore } from '@/store/useInventoryStore'
import { usePayrollStore } from '@/store/usePayrollStore'
import { useSalesStore } from '@/store/useSalesStore'
import { useUIStore } from '@/store/ui-store'

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

    Promise.all([
      cleanupOldSalesData(),
      useInventoryStore.getState().hydrate(),
      useSalesStore.getState().hydrate(),
      usePayrollStore.getState().hydrate(),
    ])
      .then(() => {
        if (!cancelled) setDbInitializing(false)
      })
      .catch(() => {
        // Error toast already shown by the failing hydrate.
        if (!cancelled) setDbInitializing(false)
      })

    return () => {
      cancelled = true
    }
  }, [])
}
