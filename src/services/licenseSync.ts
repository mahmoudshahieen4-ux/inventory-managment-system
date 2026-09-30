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
import {
  verifySignedLicense,
  type LicenseTokenClaims,
} from '@/services/licenseVerification'
import type { LicenseRecord, LicenseStatus } from '@/types/license'

/** Status values stored in the Supabase `subscriptions` table. */
export type CloudSubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'BLOCKED'

/** Raw row shape returned by the Supabase Data API (snake_case columns). */
interface SubscriptionRow {
  machine_id: string
  license_token: string | null
  updated_at: string
}

export type LicenseSyncOutcome =
  /** Cloud row found → local SQLite updated. */
  | 'SYNCED'
  /** Cloud row found → local state already up to date. */
  | 'UNCHANGED'
  /** No cloud row for this machine → local state kept. */
  | 'NO_SUBSCRIPTION'
  /** A cloud row without a valid signature is never applied. */
  | 'INVALID_SIGNATURE'
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
 * Maps authenticated claims to the local status. Unsigned database columns
 * are deliberately not consulted for access decisions.
 */
export function resolveLocalStatus(
  claims: LicenseTokenClaims,
  now: Date = new Date()
): Extract<LicenseStatus, 'ACTIVE' | 'EXPIRED'> {
  if (claims.status === 'BLOCKED' || claims.exp * 1000 <= now.getTime()) {
    return 'EXPIRED'
  }
  return 'ACTIVE'
}

/** Merges a verified signed token into the local license record. */
export function mergeCloudSubscription(
  local: LicenseRecord | null,
  row: SubscriptionRow,
  claims: LicenseTokenClaims,
  now: Date = new Date()
): LicenseRecord {
  return {
    licenseKey: row.license_token,
    status: resolveLocalStatus(claims, now),
    activationDate: local?.activationDate ?? null,
    expirationDate: new Date(claims.exp * 1000).toISOString(),
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
    local.licenseKey === merged.licenseKey &&
    local.status === merged.status &&
    local.expirationDate === merged.expirationDate &&
    local.isTrial === merged.isTrial
  )
}

/**
 * Reconciles the local license with the Supabase subscription for a machine.
 * Never trusts cloud status or expiry columns: the returned token must verify
 * against the embedded Ed25519 public key and bind to this machine.
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
      .select('machine_id, license_token, updated_at')
      .eq('machine_id', machineId.toUpperCase())
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

  if (
    !row.license_token ||
    row.machine_id.toUpperCase() !== machineId.toUpperCase()
  ) {
    return { outcome: 'INVALID_SIGNATURE', record: local }
  }

  const verification = await verifySignedLicense(machineId, row.license_token)
  const claims = verification.claims
  if (!claims || claims.machineId !== machineId.toUpperCase()) {
    return { outcome: 'INVALID_SIGNATURE', record: local }
  }

  const merged = mergeCloudSubscription(local, row, claims)
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
