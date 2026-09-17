import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Mocked `@tauri-apps/plugin-sql` connection.
 *
 * `load` resolves with a database handle whose `execute`/`select` are shared
 * spies, so each test can decide whether a statement succeeds or fails
 * (e.g. a rejected `database is locked` error).
 */
const dbMocks = vi.hoisted(() => ({
  execute: vi.fn<(query: string) => Promise<unknown>>(),
  select: vi.fn<(query: string) => Promise<unknown>>(),
  load: vi.fn<(url: string) => Promise<unknown>>(),
}))

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: dbMocks.load },
}))

/** Marks the jsdom window as the desktop runtime (or clears the marker). */
function setTauriRuntime(active: boolean): void {
  const target = window as unknown as { __TAURI_INTERNALS__?: unknown }
  if (active) {
    target.__TAURI_INTERNALS__ = {}
  } else {
    delete target.__TAURI_INTERNALS__
  }
}

/**
 * Imports a fresh copy of the db module so the module-level connection cache
 * (`dbPromise`) is reset between tests and pragma setup runs again.
 */
async function importDb() {
  vi.resetModules()
  // `mockReset` (not `mockClear`) so neither call history nor a previous
  // test's failing implementation leaks into the next one.
  dbMocks.execute.mockReset()
  dbMocks.select.mockReset()
  dbMocks.load.mockReset()
  dbMocks.execute.mockImplementation(() =>
    Promise.resolve({ rowsAffected: 0, lastInsertId: 0 })
  )
  dbMocks.select.mockImplementation(() => Promise.resolve([]))
  dbMocks.load.mockResolvedValue({
    execute: dbMocks.execute,
    select: dbMocks.select,
  })
  return import('./db')
}

/** SQL text of every `execute` call, in call order. */
function executedStatements(): string[] {
  return dbMocks.execute.mock.calls.map(([query]) => query)
}

const EMPTY_ANALYTICS = {
  summary: {
    totalUnitsSold: 0,
    totalRevenue: 0,
    totalProfit: 0,
    deadStockValue: 0,
  },
  productPerformance: [],
  deadStock: [],
  highestMargins: [],
}

describe('db service — SQLite concurrency & analytics resilience', () => {
  afterEach(() => {
    setTauriRuntime(false)
    vi.useRealTimers()
  })

  it('enables WAL, a 5s busy timeout and NORMAL sync before creating the schema', async () => {
    setTauriRuntime(true)
    const db = await importDb()

    await db.initializeDatabase()

    const statements = executedStatements()
    expect(statements).toContain('PRAGMA journal_mode = WAL')
    expect(statements).toContain('PRAGMA busy_timeout = 5000')
    expect(statements).toContain('PRAGMA synchronous = NORMAL')
    // Pragmas must be the very first statements: the schema DDL (and every
    // later read) then runs on a WAL connection instead of the default
    // rollback journal, which is what caused "database is locked".
    expect(statements.slice(0, 3)).toEqual([
      'PRAGMA journal_mode = WAL',
      'PRAGMA busy_timeout = 5000',
      'PRAGMA synchronous = NORMAL',
    ])
  })

  it('still initializes the schema when a pragma fails', async () => {
    setTauriRuntime(true)
    const db = await importDb()
    dbMocks.execute.mockImplementation((query: string) =>
      query.startsWith('PRAGMA')
        ? Promise.reject(new Error('database is locked'))
        : Promise.resolve({ rowsAffected: 0, lastInsertId: 0 })
    )

    await expect(db.initializeDatabase()).resolves.toBeUndefined()
    expect(
      executedStatements().some(statement =>
        statement.includes('CREATE TABLE IF NOT EXISTS products')
      )
    ).toBe(true)
  })

  it('returns empty analytics instead of throwing when the database is locked', async () => {
    setTauriRuntime(true)
    const db = await importDb()
    dbMocks.select.mockRejectedValue(new Error('database is locked'))

    await expect(db.fetchAnalyticsSummary('TODAY')).resolves.toEqual(
      EMPTY_ANALYTICS.summary
    )
    await expect(db.fetchProductAnalytics('TODAY')).resolves.toEqual([])
    await expect(db.fetchDeadStockAnalytics('TODAY')).resolves.toEqual([])
    await expect(db.fetchHighestMarginProducts()).resolves.toEqual([])
    // The aggregate loader used by the Analytics screen must never reject —
    // that rejection is what tripped the Analytics ErrorBoundary.
    await expect(db.fetchFullAnalytics('TODAY')).resolves.toEqual(
      EMPTY_ANALYTICS
    )
  })

  it('returns empty analytics outside the desktop runtime', async () => {
    setTauriRuntime(false)
    const db = await importDb()

    await expect(db.fetchFullAnalytics('TODAY')).resolves.toEqual(
      EMPTY_ANALYTICS
    )
    expect(dbMocks.load).not.toHaveBeenCalled()
  })

  it.each(['TODAY', '1_WEEK', '1_MONTH'] as const)(
    'binds the same local-midnight cutoff for %s in history and analytics',
    async range => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 8, 16, 15, 30))
      setTauriRuntime(true)
      const db = await importDb()
      const days = { TODAY: 0, '1_WEEK': 7, '1_MONTH': 30 }[range]
      const expected = new Date(2026, 8, 16 - days).toISOString()
      await db.fetchSales(range)
      expect(dbMocks.select).toHaveBeenLastCalledWith(
        expect.stringContaining('WHERE created_at >= $1'),
        [expected]
      )
      await db.fetchProductAnalytics(range)
      expect(dbMocks.select).toHaveBeenLastCalledWith(
        expect.stringContaining('WHERE s.created_at >= $1'),
        [expected]
      )
      await db.fetchAnalyticsSummary(range)
      expect(dbMocks.select).toHaveBeenLastCalledWith(
        expect.stringContaining('created_at >= $1'),
        [expected]
      )
      await db.fetchDeadStockAnalytics(range)
      expect(dbMocks.select).toHaveBeenLastCalledWith(
        expect.stringContaining('created_at >= $1'),
        [expected]
      )
      await db.fetchSales()
      expect(dbMocks.select).toHaveBeenLastCalledWith(
        expect.not.stringContaining('WHERE created_at'),
        []
      )
    }
  )

  it('still maps real rows when the queries succeed', async () => {
    setTauriRuntime(true)
    const db = await importDb()
    dbMocks.select
      .mockResolvedValueOnce([
        { totalUnitsSold: 4, totalRevenue: 120, totalProfit: 40 },
      ])
      .mockResolvedValueOnce([{ deadStockValue: 250 }])

    await expect(db.fetchAnalyticsSummary('1_MONTH')).resolves.toEqual({
      totalUnitsSold: 4,
      totalRevenue: 120,
      totalProfit: 40,
      deadStockValue: 250,
    })
  })
})
