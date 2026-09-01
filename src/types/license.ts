/**
 * Domain types for the application licensing system.
 */

export type LicenseStatus = 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'UNREGISTERED'

/** The persisted license record (SQLite `license` table, single row). */
export interface LicenseRecord {
  licenseKey: string | null
  status: LicenseStatus
  /** ISO timestamp of the moment the license was activated. */
  activationDate: string | null
  /** ISO timestamp after which the app locks (paid license). */
  expirationDate: string | null
  isTrial: boolean
  /** ISO timestamp of the very first run — the trial anchor. */
  firstRunDate: string | null
  /** ISO timestamp when the free trial ends (firstRunDate + 3 days). */
  trialExpirationDate: string | null
  /** ISO timestamp of the last seen "now" — used for clock rollback detection. */
  lastActiveTime: string | null
}
