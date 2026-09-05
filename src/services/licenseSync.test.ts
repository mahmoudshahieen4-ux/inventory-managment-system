import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LicenseRecord } from '@/types/license'
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

/** Mocked SQLite persistence (see localLicenseRepository). */
const dbMocks = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
  initializeDatabase: vi.fn(() => Promise.resolve()),
  fetchLicenseRow: vi.fn<() => Promise<LicenseRecord | null>>(),
  persistLicense: vi.fn<(record: LicenseRecord) => Promise<void>>(),
}))

vi.mock('@/services/db', () => dbMocks)

function cloudRow(
  overrides: Partial<{
    machine_id: string
    client_name: string | null
    status: string
    expires_at: string
    updated_at: string
  }> = {}
) {
  return {
    machine_id: 'AABBCCDD',
    client_name: 'Corner Shop',
    status: 'ACTIVE',
    expires_at: new Date(Date.now() + 30 * DAY_MS).toISOString(),
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
    const expiresAt = new Date(Date.now() + 30 * DAY_MS).toISOString()
    supabaseMocks.maybeSingle.mockResolvedValue({
      data: cloudRow({ expires_at: expiresAt }),
      error: null,
    })

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
      data: cloudRow({ status: 'BLOCKED' }),
      error: null,
    })

    const result = await syncSubscriptionWithCloud('AABBCCDD')

    expect(result.outcome).toBe('SYNCED')
    expect(result.record?.status).toBe('EXPIRED')
  })

  it('expires a subscription whose cloud expiry already passed (UTC)', async () => {
    supabaseMocks.maybeSingle.mockResolvedValue({
      data: cloudRow({
        status: 'ACTIVE',
        expires_at: new Date(Date.now() - DAY_MS).toISOString(),
      }),
      error: null,
    })

    const result = await syncSubscriptionWithCloud('AABBCCDD')

    expect(result.outcome).toBe('SYNCED')
    expect(result.record?.status).toBe('EXPIRED')
  })

  it('reports UNCHANGED when the local record already matches the cloud', async () => {
    const expiresAt = new Date(Date.now() + 30 * DAY_MS).toISOString()
    dbMocks.fetchLicenseRow.mockResolvedValue({
      licenseKey: 'ABCD-EF01-2345-6789',
      status: 'ACTIVE',
      activationDate: null,
      expirationDate: expiresAt,
      isTrial: false,
      firstRunDate: null,
      trialExpirationDate: null,
      lastActiveTime: new Date().toISOString(),
    })
    supabaseMocks.maybeSingle.mockResolvedValue({
      data: cloudRow({ expires_at: expiresAt }),
      error: null,
    })

    const result = await syncSubscriptionWithCloud('AABBCCDD')

    expect(result.outcome).toBe('UNCHANGED')
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
    expect(resolveLocalStatus('ACTIVE', '2026-07-15T00:00:00.000Z', now)).toBe(
      'ACTIVE'
    )
  })

  it('expires an ACTIVE subscription whose expiry passed', () => {
    expect(resolveLocalStatus('ACTIVE', '2026-06-15T11:59:59.000Z', now)).toBe(
      'EXPIRED'
    )
  })

  it('treats an exactly-expired instant as EXPIRED', () => {
    expect(resolveLocalStatus('ACTIVE', '2026-06-15T12:00:00.000Z', now)).toBe(
      'EXPIRED'
    )
  })

  it('locks BLOCKED subscriptions regardless of the expiry date', () => {
    expect(resolveLocalStatus('BLOCKED', '2030-01-01T00:00:00.000Z', now)).toBe(
      'EXPIRED'
    )
  })

  it('expires EXPIRED cloud rows', () => {
    expect(resolveLocalStatus('EXPIRED', '2030-01-01T00:00:00.000Z', now)).toBe(
      'EXPIRED'
    )
  })

  it('fails safe on unparseable expiry data', () => {
    expect(resolveLocalStatus('ACTIVE', 'not-a-date', now)).toBe('EXPIRED')
  })
})

describe('mergeCloudSubscription', () => {
  it('preserves the local key and trial anchors while taking cloud state', () => {
    const local: LicenseRecord = {
      licenseKey: 'ABCD-EF01-2345-6789',
      status: 'TRIAL',
      activationDate: '2026-01-01T00:00:00.000Z',
      expirationDate: null,
      isTrial: true,
      firstRunDate: '2026-01-01T00:00:00.000Z',
      trialExpirationDate: '2026-01-04T00:00:00.000Z',
      lastActiveTime: '2026-01-02T00:00:00.000Z',
    }
    const now = new Date('2026-06-15T12:00:00.000Z')

    const merged = mergeCloudSubscription(
      local,
      cloudRow({
        status: 'ACTIVE',
        expires_at: '2026-07-15T00:00:00.000Z',
      }),
      now
    )

    expect(merged).toEqual({
      licenseKey: 'ABCD-EF01-2345-6789',
      status: 'ACTIVE',
      activationDate: '2026-01-01T00:00:00.000Z',
      expirationDate: '2026-07-15T00:00:00.000Z',
      isTrial: false,
      firstRunDate: '2026-01-01T00:00:00.000Z',
      trialExpirationDate: '2026-01-04T00:00:00.000Z',
      lastActiveTime: now.toISOString(),
    })
  })

  it('builds a full record from the cloud when no local state exists', () => {
    const now = new Date('2026-06-15T12:00:00.000Z')

    const merged = mergeCloudSubscription(
      null,
      cloudRow({ expires_at: '2026-07-15T00:00:00.000Z' }),
      now
    )

    expect(merged.status).toBe('ACTIVE')
    expect(merged.expirationDate).toBe('2026-07-15T00:00:00.000Z')
    expect(merged.licenseKey).toBeNull()
    expect(merged.lastActiveTime).toBe(now.toISOString())
  })
})
