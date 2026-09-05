/**
 * Cloud subscription sync — Supabase ⇆ local SQLite (hybrid offline-first).
 *
 * Contract (see docs/developer/cloud-licensing.md):
 *  - The cloud is the source of truth for subscription STATUS and EXPIRY.
 *  - Local SQLite stays the source of truth for all business data AND for
 *    offline operation: when the network fails, the last known local state
 *    is kept and the app keeps working without crashing or locking.
 *  - `last_active_time` is refreshed on every write so the clock-rollback
 *    check in `useLicenseStore` can detect system-clock tampering.
 */
import { getLicense, saveLicense } from '@/services/localLicenseRepository'
import { getSupabaseClient, isSupabaseConfigured } from '@/services/supabase'
import type { LicenseRecord, LicenseStatus } from '@/types/license'

/** Status values stored in the Supabase `subscriptions` table. */
export type CloudSubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'BLOCKED'

/** Raw row shape returned by the Supabase Data API (snake_case columns). */
interface SubscriptionRow {
  machine_id: string
  client_name: string | null
  status: string
  expires_at: string
  updated_at: string
}

export type LicenseSyncOutcome =
  /** Cloud row found → local SQLite updated. */
  | 'SYNCED'
  /** Cloud row found → local state already up to date. */
  | 'UNCHANGED'
  /** No cloud row for this machine → local state kept. */
  | 'NO_SUBSCRIPTION'
  /** Network/API failure → local state kept (graceful offline fallback). */
  | 'OFFLINE'
  /** Supabase not configured (browser dev / tests) → no-op. */
  | 'SKIPPED'
  /** Unexpected failure (e.g. persistence) → local state kept. */
  | 'ERROR'

export interface LicenseSyncResult {
  outcome: LicenseSyncOutcome
  /** The local record after the sync attempt (unchanged unless SYNCED). */
  record: LicenseRecord | null
}

/**
 * Maps a cloud subscription row to the local license status. The comparison
 * runs in UTC: `expires_at` is a `timestamptz` ISO string and `Date.now()`
 * is UTC-based, so client timezone or wall-clock tricks cannot extend a
 * subscription. `BLOCKED` always locks regardless of the expiry instant.
 */
export function resolveLocalStatus(
  cloudStatus: string,
  expiresAt: string,
  now: Date = new Date()
): Extract<LicenseStatus, 'ACTIVE' | 'EXPIRED'> {
  if (cloudStatus === 'BLOCKED' || cloudStatus === 'EXPIRED') return 'EXPIRED'
  const expires = Date.parse(expiresAt)
  if (Number.isNaN(expires)) {
    // Unparseable vendor data — fail safe: lock instead of granting access.
    return 'EXPIRED'
  }
  // The expiry instant itself is already past (>=) — same rule as the
  // offline key validator in `license-key.ts`.
  return now.getTime() >= expires ? 'EXPIRED' : 'ACTIVE'
}

/** Merges a cloud subscription row into the local license record. */
export function mergeCloudSubscription(
  local: LicenseRecord | null,
  row: SubscriptionRow,
  now: Date = new Date()
): LicenseRecord {
  return {
    licenseKey: local?.licenseKey ?? null,
    status: resolveLocalStatus(row.status, row.expires_at, now),
    activationDate: local?.activationDate ?? null,
    // The cloud expiry is authoritative — clients never compute their own.
    expirationDate: row.expires_at,
    isTrial: false,
    firstRunDate: local?.firstRunDate ?? null,
    trialExpirationDate: local?.trialExpirationDate ?? null,
    // Pulse the local clock anchor so rollback detection stays effective.
    lastActiveTime: now.toISOString(),
  }
}

/** True when persisting would not change anything worth writing. */
function isSameSubscription(
  local: LicenseRecord | null,
  merged: LicenseRecord
): boolean {
  return Boolean(
    local &&
    local.status === merged.status &&
    local.expirationDate === merged.expirationDate &&
    local.isTrial === merged.isTrial
  )
}

/**
 * Reconciles the local license with the Supabase subscription for a machine.
 * Never throws: every failure path returns a result so the app can continue
 * with the local state (offline-first). A `BLOCKED` cloud status maps to the
 * local `EXPIRED` status, which locks the app behind the renewal screen.
 */
export async function syncSubscriptionWithCloud(
  machineId: string
): Promise<LicenseSyncResult> {
  const local = await getLicense()

  if (!isSupabaseConfigured()) {
    return { outcome: 'SKIPPED', record: local }
  }

  let row: SubscriptionRow | null
  try {
    const { data, error } = await getSupabaseClient()
      .from('subscriptions')
      .select('machine_id, client_name, status, expires_at, updated_at')
      .eq('machine_id', machineId)
      .maybeSingle()

    if (error) {
      // Network / RLS / service errors → graceful fallback to local state.
      return { outcome: 'OFFLINE', record: local }
    }
    row = data
  } catch {
    return { outcome: 'OFFLINE', record: local }
  }

  if (!row) {
    // Unknown machine — the vendor has not created a subscription yet; the
    // local (offline/trial) state stays authoritative.
    return { outcome: 'NO_SUBSCRIPTION', record: local }
  }

  const merged = mergeCloudSubscription(local, row)
  if (isSameSubscription(local, merged)) {
    return { outcome: 'UNCHANGED', record: local }
  }

  try {
    await saveLicense(merged)
    return { outcome: 'SYNCED', record: merged }
  } catch {
    return { outcome: 'ERROR', record: local }
  }
}
