import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Sale } from '@/types/sales'

/**
 * Mocked `@tauri-apps/plugin-sql` connection (same shape as
 * `db.resilience.test.ts`), so each test can decide per statement whether it
 * succeeds, fails, or hangs.
 */
const dbMocks = vi.hoisted(() => ({
  execute: vi.fn<(query: string, bindValues?: unknown[]) => Promise<unknown>>(),
  select: vi.fn<(query: string, bindValues?: unknown[]) => Promise<unknown>>(),
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
 * Imports a fresh copy of the db module: resets the connection cache, the
 * statement queue and the duplicate-invoice guard between tests.
 */
async function importDb() {
  vi.resetModules()
  dbMocks.execute.mockReset()
  dbMocks.select.mockReset()
  dbMocks.load.mockReset()
  dbMocks.execute.mockImplementation(() =>
    Promise.resolve({ rowsAffected: 1, lastInsertId: 1 })
  )
  dbMocks.select.mockImplementation(() => Promise.resolve([]))
  dbMocks.load.mockResolvedValue({
    execute: dbMocks.execute,
    select: dbMocks.select,
    close: () => Promise.resolve(),
  })
  return import('./db')
}

/** SQL text of every `execute` call, in call order. */
function executedStatements(): string[] {
  return dbMocks.execute.mock.calls.map(([query]) => query)
}

/** Only the transaction-control statements: BEGIN / COMMIT / ROLLBACK. */
function transactionStatements(): string[] {
  return executedStatements().filter(statement =>
    /^(BEGIN|COMMIT|ROLLBACK)/.test(statement)
  )
}

/** Counts the statements writing one table. */
function writeCount(prefix: string): number {
  return executedStatements().filter(statement => statement.startsWith(prefix))
    .length
}

/** A minimal completed sale, complete enough for the atomic checkout path. */
function buildSale(id: string): Sale {
  return {
    id,
    invoiceNumber: 'INV-0001',
    items: [
      {
        productId: 'prod-004',
        sku: 'SNK-004',
        name: 'Dark Chocolate Bar',
        purchasePrice: 1.2,
        unitPrice: 2.49,
        quantity: 2,
        lineTotal: 4.98,
        profit: 2.58,
      },
    ],
    subtotal: 4.98,
    tax: 0,
    total: 4.98,
    totalProfit: 2.58,
    cashierId: 'cashier',
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

/** The exact failure the nested-transaction bug produced on the device. */
const NESTED_TRANSACTION_ERROR =
  'error returned from database: (code: 1) cannot start a transaction within a transaction'

describe('db service — checkout transactions', () => {
  afterEach(() => {
    setTauriRuntime(false)
  })

  it('wraps a checkout in exactly one BEGIN/COMMIT pair', async () => {
    setTauriRuntime(true)
    const db = await importDb()

    await db.persistSaleAtomic(buildSale('sale-1'), [
      { productId: 'prod-004', newQuantity: 48 },
    ])

    // A single pair — never a second BEGIN inside an open transaction.
    expect(transactionStatements()).toEqual(['BEGIN IMMEDIATE', 'COMMIT'])
    // Invoice, its line item and the stock decrement all ran inside that pair.
    expect(writeCount('INSERT INTO sales')).toBe(1)
    expect(writeCount('INSERT INTO sale_items')).toBe(1)
    expect(writeCount('UPDATE products SET quantity')).toBe(1)
  })

  it('rolls back and rethrows when a statement inside the checkout fails', async () => {
    setTauriRuntime(true)
    const db = await importDb()
    dbMocks.execute.mockImplementation((query: string) =>
      query.startsWith('INSERT INTO sale_items')
        ? Promise.reject(new Error('disk I/O error'))
        : Promise.resolve({ rowsAffected: 1, lastInsertId: 1 })
    )

    await expect(
      db.persistSaleAtomic(buildSale('sale-fail'), [])
    ).rejects.toThrow('disk I/O error')

    expect(transactionStatements()).toEqual(['BEGIN IMMEDIATE', 'ROLLBACK'])
  })

  it('heals a transaction left open on the connection instead of failing the sale', async () => {
    setTauriRuntime(true)
    const db = await importDb()
    let begins = 0
    dbMocks.execute.mockImplementation((query: string) => {
      if (query === 'BEGIN IMMEDIATE') {
        begins += 1
        return begins === 1
          ? Promise.reject(new Error(NESTED_TRANSACTION_ERROR))
          : Promise.resolve({ rowsAffected: 0, lastInsertId: 0 })
      }
      return Promise.resolve({ rowsAffected: 1, lastInsertId: 1 })
    })

    await expect(
      db.persistSaleAtomic(buildSale('sale-heal'), [])
    ).resolves.toBeUndefined()

    // The leaked transaction is rolled back, then the checkout commits cleanly.
    expect(transactionStatements()).toEqual([
      'BEGIN IMMEDIATE',
      'ROLLBACK',
      'BEGIN IMMEDIATE',
      'COMMIT',
    ])
  })

  it('ignores a second submission for the same invoice', async () => {
    setTauriRuntime(true)
    const db = await importDb()
    const invoice = buildSale('sale-dup')

    await db.persistSaleAtomic(invoice, [])
    await db.persistSaleAtomic(invoice, [])

    expect(transactionStatements()).toEqual(['BEGIN IMMEDIATE', 'COMMIT'])
    expect(writeCount('INSERT INTO sales')).toBe(1)
    expect(writeCount('INSERT INTO sale_items')).toBe(1)
  })

  it('shares the duplicate guard between persistSale and persistSaleAtomic', async () => {
    setTauriRuntime(true)
    const db = await importDb()
    const invoice = buildSale('sale-shared')

    // Both entry points must never open a transaction for the same invoice.
    await db.persistSale(invoice)
    await db.persistSaleAtomic(invoice, [])

    expect(transactionStatements()).toEqual(['BEGIN IMMEDIATE', 'COMMIT'])
    expect(writeCount('INSERT INTO sales')).toBe(1)
  })

  it('allows a retry of the same invoice after a failed commit', async () => {
    setTauriRuntime(true)
    const db = await importDb()
    let salesInserts = 0
    dbMocks.execute.mockImplementation((query: string) => {
      if (query.startsWith('INSERT INTO sales')) {
        salesInserts += 1
        if (salesInserts === 1) {
          return Promise.reject(new Error('database is locked'))
        }
      }
      return Promise.resolve({ rowsAffected: 1, lastInsertId: 1 })
    })
    const invoice = buildSale('sale-retry')

    await expect(db.persistSaleAtomic(invoice, [])).rejects.toThrow(
      'database is locked'
    )
    await expect(db.persistSaleAtomic(invoice, [])).resolves.toBeUndefined()

    expect(transactionStatements()).toEqual([
      'BEGIN IMMEDIATE',
      'ROLLBACK',
      'BEGIN IMMEDIATE',
      'COMMIT',
    ])
    expect(writeCount('INSERT INTO sales')).toBe(2)
  })

  it('keeps a concurrent read queued until the checkout commits', async () => {
    setTauriRuntime(true)
    const db = await importDb()

    let resolveInsert: (() => void) | undefined
    let markInsertStarted: (() => void) | undefined
    const insertStarted = new Promise<void>(resolve => {
      markInsertStarted = resolve
    })

    dbMocks.execute.mockImplementation((query: string) => {
      if (query.startsWith('INSERT INTO sales')) {
        markInsertStarted?.()
        return new Promise(resolve => {
          resolveInsert = () => resolve({ rowsAffected: 1, lastInsertId: 1 })
        })
      }
      return Promise.resolve({ rowsAffected: 1, lastInsertId: 1 })
    })

    const checkout = db.persistSaleAtomic(buildSale('sale-locked'), [])
    await insertStarted

    // A read issued while the transaction is open must wait for the COMMIT —
    // otherwise it would grab a second pooled connection mid-transaction.
    const read = db.fetchProducts()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(dbMocks.select).not.toHaveBeenCalled()

    resolveInsert?.()
    await checkout
    await read

    expect(dbMocks.select).toHaveBeenCalledTimes(1)
    expect(transactionStatements()).toEqual(['BEGIN IMMEDIATE', 'COMMIT'])
  })
})
