import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LicenseRecord } from '@/types/license'
import type { LicenseTokenClaims } from '@/services/licenseVerification'
import { mergeCloudSubscription, resolveLocalStatus } from './licenseSync'
import { syncSubscriptionWithCloud } from './licenseSync'

const DAY_MS = 86_400_000

/** Mocked Supabase Data API (chainable query builder). */
const supabaseMocks = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  return {
    maybeSingle,
    isSupabaseConfigured: vi.fn(() => true),
    getSupabaseClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle }),
        }),
      }),
    }),
  }
})

vi.mock('./supabase', () => supabaseMocks)

const verificationMocks = vi.hoisted(() => ({
  verifySignedLicense: vi.fn(),
}))

vi.mock('@/services/licenseVerification', () => verificationMocks)

/** Mocked SQLite persistence (see localLicenseRepository). */
const dbMocks = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
  initializeDatabase: vi.fn(() => Promise.resolve()),
  fetchLicenseRow: vi.fn<() => Promise<LicenseRecord | null>>(),
  persistLicense: vi.fn<(record: LicenseRecord) => Promise<void>>(),
}))

vi.mock('@/services/db', () => dbMocks)

const ACTIVE_EXP = Math.floor((Date.now() + 30 * DAY_MS) / 1000)

function signedClaims(
  overrides: Partial<LicenseTokenClaims> = {}
): LicenseTokenClaims {
  return {
    version: 1,
    issuer: 'hyper-market',
    machineId: 'AABBCCDD',
    status: 'ACTIVE',
    exp: ACTIVE_EXP,
    jti: 'license-test',
    ...overrides,
  }
}

function cloudRow(
  overrides: Partial<{
    machine_id: string
    license_token: string | null
    updated_at: string
  }> = {}
) {
  return {
    machine_id: 'AABBCCDD',
    license_token: 'signed-active',
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('syncSubscriptionWithCloud', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseMocks.isSupabaseConfigured.mockReturnValue(true)
    dbMocks.isTauriRuntime.mockReturnValue(true)
    dbMocks.fetchLicenseRow.mockResolvedValue(null)
    dbMocks.persistLicense.mockResolvedValue(undefined)
    verificationMocks.verifySignedLicense.mockImplementation(
      async (machineId: string, token: string) => {
        if (token === 'unsigned-token') {
          return { valid: false, error: 'SIGNATURE' }
        }
        const claims = signedClaims({
          machineId: machineId.toUpperCase(),
          status: token === 'signed-blocked' ? 'BLOCKED' : 'ACTIVE',
          exp:
            token === 'signed-expired'
              ? Math.floor(Date.now() / 1000) - 1
              : ACTIVE_EXP,
        })
        return {
          valid: claims.status === 'ACTIVE' && claims.exp * 1000 > Date.now(),
          claims,
          expiresAt: new Date(claims.exp * 1000).toISOString(),
        }
      }
    )
  })

  it('skips the sync when Supabase is not configured', async () => {
    supabaseMocks.isSupabaseConfigured.mockReturnValue(false)

    const result = await syncSubscriptionWithCloud('AABBCCDD')

    expect(result.outcome).toBe('SKIPPED')
    expect(dbMocks.persistLicense).not.toHaveBeenCalled()
  })

  it('falls back to the local license when the query reports an error (offline)', async () => {
    supabaseMocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'fetch failed' },
    })

    const result = await syncSubscriptionWithCloud('AABBCCDD')

    expect(result.outcome).toBe('OFFLINE')
    expect(dbMocks.persistLicense).not.toHaveBeenCalled()
  })

  it('falls back to the local license when the request throws (offline)', async () => {
    supabaseMocks.maybeSingle.mockRejectedValue(new TypeError('network down'))

    const result = await syncSubscriptionWithCloud('AABBCCDD')

    expect(result.outcome).toBe('OFFLINE')
    expect(dbMocks.persistLicense).not.toHaveBeenCalled()
  })

  it('keeps the local state when no subscription exists for this machine', async () => {
    supabaseMocks.maybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await syncSubscriptionWithCloud('AABBCCDD')

    expect(result.outcome).toBe('NO_SUBSCRIPTION')
    expect(dbMocks.persistLicense).not.toHaveBeenCalled()
  })

  it('applies an ACTIVE cloud subscription to the local license', async () => {
    supabaseMocks.maybeSingle.mockResolvedValue({
      data: cloudRow(),
      error: null,
    })
    const expiresAt = new Date(ACTIVE_EXP * 1000).toISOString()

    const result = await syncSubscriptionWithCloud('AABBCCDD')

    expect(result.outcome).toBe('SYNCED')
    expect(result.record).toEqual(
      expect.objectContaining({
        status: 'ACTIVE',
        expirationDate: expiresAt,
        isTrial: false,
      })
    )
    expect(dbMocks.persistLicense).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ACTIVE',
        expirationDate: expiresAt,
        isTrial: false,
      })
    )
    // last_active_time is refreshed so rollback detection stays effective.
    const persisted = dbMocks.persistLicense.mock.calls[0]?.[0]
    expect(persisted?.lastActiveTime).not.toBeNull()
  })

  it('locks the app locally when the cloud status is BLOCKED', async () => {
    supabaseMocks.maybeSingle.mockResolvedValue({
      data: cloudRow({ license_token: 'signed-blocked' }),
      error: null,
    })

    const result = await syncSubscriptionWithCloud('AABBCCDD')

    expect(result.outcome).toBe('SYNCED')
    expect(result.record?.status).toBe('EXPIRED')
  })

  it('expires a subscription whose cloud expiry already passed (UTC)', async () => {
    supabaseMocks.maybeSingle.mockResolvedValue({
      data: cloudRow({ license_token: 'signed-expired' }),
      error: null,
    })

    const result = await syncSubscriptionWithCloud('AABBCCDD')

    expect(result.outcome).toBe('SYNCED')
    expect(result.record?.status).toBe('EXPIRED')
  })

  it('reports UNCHANGED when the local record already matches the cloud', async () => {
    const expiresAt = new Date(ACTIVE_EXP * 1000).toISOString()
    dbMocks.fetchLicenseRow.mockResolvedValue({
      licenseKey: 'signed-active',
      status: 'ACTIVE',
      activationDate: null,
      expirationDate: expiresAt,
      isTrial: false,
      firstRunDate: null,
      trialExpirationDate: null,
      lastActiveTime: new Date().toISOString(),
    })
    supabaseMocks.maybeSingle.mockResolvedValue({
      data: cloudRow(),
      error: null,
    })

    const result = await syncSubscriptionWithCloud('AABBCCDD')

    expect(result.outcome).toBe('UNCHANGED')
    expect(dbMocks.persistLicense).not.toHaveBeenCalled()
  })

  it('does not apply a cloud row without a valid signed token', async () => {
    supabaseMocks.maybeSingle.mockResolvedValue({
      data: cloudRow({ license_token: 'unsigned-token' }),
      error: null,
    })

    const result = await syncSubscriptionWithCloud('AABBCCDD')

    expect(result.outcome).toBe('INVALID_SIGNATURE')
    expect(result.record).toBeNull()
    expect(dbMocks.persistLicense).not.toHaveBeenCalled()
  })

  it('returns ERROR without throwing when persisting fails', async () => {
    supabaseMocks.maybeSingle.mockResolvedValue({
      data: cloudRow(),
      error: null,
    })
    dbMocks.persistLicense.mockRejectedValue(new Error('disk full'))

    const result = await syncSubscriptionWithCloud('AABBCCDD')

    expect(result.outcome).toBe('ERROR')
    expect(result.record).toBeNull()
  })
})

describe('resolveLocalStatus', () => {
  const now = new Date('2026-06-15T12:00:00.000Z')

  it('keeps an ACTIVE subscription that expires in the future', () => {
    expect(
      resolveLocalStatus(
        signedClaims({
          exp: Math.floor(Date.parse('2026-07-15T00:00:00.000Z') / 1000),
        }),
        now
      )
    ).toBe('ACTIVE')
  })

  it('expires an ACTIVE subscription whose expiry passed', () => {
    expect(
      resolveLocalStatus(
        signedClaims({
          exp: Math.floor(Date.parse('2026-06-15T11:59:59.000Z') / 1000),
        }),
        now
      )
    ).toBe('EXPIRED')
  })

  it('treats an exactly-expired instant as EXPIRED', () => {
    expect(
      resolveLocalStatus(
        signedClaims({ exp: Math.floor(now.getTime() / 1000) }),
        now
      )
    ).toBe('EXPIRED')
  })

  it('locks BLOCKED subscriptions regardless of the expiry date', () => {
    expect(
      resolveLocalStatus(
        signedClaims({ status: 'BLOCKED', exp: ACTIVE_EXP }),
        now
      )
    ).toBe('EXPIRED')
  })
})

describe('mergeCloudSubscription', () => {
  it('takes the signed cloud token and preserves local trial anchors', () => {
    const local: LicenseRecord = {
      licenseKey: 'old-token',
      status: 'TRIAL',
      activationDate: '2026-01-01T00:00:00.000Z',
      expirationDate: null,
      isTrial: true,
      firstRunDate: '2026-01-01T00:00:00.000Z',
      trialExpirationDate: '2026-01-04T00:00:00.000Z',
      lastActiveTime: '2026-01-02T00:00:00.000Z',
    }
    const now = new Date('2026-06-15T12:00:00.000Z')

    const cloudClaims = signedClaims({
      exp: Math.floor(Date.parse('2026-07-15T00:00:00.000Z') / 1000),
    })
    const merged = mergeCloudSubscription(local, cloudRow(), cloudClaims, now)

    expect(merged).toEqual({
      licenseKey: 'signed-active',
      status: 'ACTIVE',
      activationDate: '2026-01-01T00:00:00.000Z',
      expirationDate: new Date(cloudClaims.exp * 1000).toISOString(),
      isTrial: false,
      firstRunDate: '2026-01-01T00:00:00.000Z',
      trialExpirationDate: '2026-01-04T00:00:00.000Z',
      lastActiveTime: now.toISOString(),
    })
  })

  it('builds a full record from the cloud when no local state exists', () => {
    const now = new Date('2026-06-15T12:00:00.000Z')

    const cloudClaims = signedClaims({
      exp: Math.floor(Date.parse('2026-07-15T00:00:00.000Z') / 1000),
    })
    const merged = mergeCloudSubscription(null, cloudRow(), cloudClaims, now)

    expect(merged.status).toBe('ACTIVE')
    expect(merged.expirationDate).toBe(
      new Date(cloudClaims.exp * 1000).toISOString()
    )
    expect(merged.licenseKey).toBe('signed-active')
    expect(merged.lastActiveTime).toBe(now.toISOString())
  })
})
