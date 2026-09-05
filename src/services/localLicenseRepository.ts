/**
 * Local license repository — adapter over the single-row SQLite `license`
 * table (see `db.ts`). Isolates the cloud-sync layer from the persistence
 * details and centralizes the desktop-runtime guard: outside the Tauri
 * webview (browser dev server / unit tests) reads return null and writes
 * are no-ops, so callers never need runtime checks themselves.
 */
import {
  fetchLicenseRow,
  initializeDatabase,
  isTauriRuntime,
  persistLicense,
} from '@/services/db'
import type { LicenseRecord } from '@/types/license'

/** Reads the locally stored license record, or null when none exists. */
export async function getLicense(): Promise<LicenseRecord | null> {
  if (!isTauriRuntime()) return null
  await initializeDatabase()
  return fetchLicenseRow()
}

/** Persists the license record (no-op outside the desktop runtime). */
export async function saveLicense(record: LicenseRecord): Promise<void> {
  if (!isTauriRuntime()) return
  await initializeDatabase()
  await persistLicense(record)
}
