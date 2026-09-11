/**
 * SQLite persistence layer backed by `tauri-plugin-sql`.
 *
 * All functions are no-ops when not running inside the Tauri desktop runtime
 * (browser dev server / unit tests), so stores keep working unchanged.
 */
import Database from '@tauri-apps/plugin-sql'

import type { AuthAccount } from '@/types/auth'
import type { Product, StockTransaction } from '@/types/inventory'
import type {
  AdvanceRecord,
  AttendanceRecord,
  OperatingExpenseRecord,
  SalaryPaymentRecord,
  Worker,
} from '@/types/payroll'
import type { CreditNote, Sale, SaleItem } from '@/types/sales'
import type {
  AnalyticsData,
  AnalyticsSummary,
  DeadStockItem,
  HighestMarginItem,
  ProductAnalyticsItem,
  TimeRange,
} from '@/types/analytics'

/** True only inside the Tauri desktop webview. */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

const DB_URL = 'sqlite:pos.db'

let dbPromise: Promise<Database> | null = null

/** Opens (once) the SQLite connection and ensures the schema exists. */
function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL).then(async db => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          sku TEXT NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 0,
          min_threshold INTEGER NOT NULL DEFAULT 0,
          purchase_price REAL NOT NULL DEFAULT 0,
          selling_price REAL NOT NULL DEFAULT 0,
          category TEXT NOT NULL DEFAULT '',
          barcode TEXT,
          unit TEXT,
          units_per_carton INTEGER,
          updated_at TEXT NOT NULL
        )
      `)
      // Stock movement audit log — records every "stock in" (purchase invoice /
      // shipment received) so inventory changes are traceable. Sale-driven
      // decrements are logged inside persistSaleAtomic on the same transaction.
      await db.execute(`CREATE TABLE IF NOT EXISTS stock_transactions (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id),
        type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        previous_quantity INTEGER NOT NULL,
        new_quantity INTEGER NOT NULL,
        cost_price REAL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`)
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_stock_transactions_product_id ON stock_transactions(product_id)'
      )
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_stock_transactions_created_at ON stock_transactions(created_at)'
      )
      await db.execute(`
        CREATE TABLE IF NOT EXISTS sales (
          id TEXT PRIMARY KEY,
          invoice_number TEXT NOT NULL,
          subtotal REAL NOT NULL DEFAULT 0,
          tax REAL NOT NULL DEFAULT 0,
          total_amount REAL NOT NULL,
          total_profit REAL NOT NULL DEFAULT 0,
          cashier_name TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS sale_items (
          id TEXT PRIMARY KEY,
          sale_id TEXT NOT NULL REFERENCES sales(id),
          product_id TEXT NOT NULL,
          product_name TEXT NOT NULL,
          sku TEXT NOT NULL DEFAULT '',
          quantity INTEGER NOT NULL,
          purchase_price REAL NOT NULL DEFAULT 0,
          unit_price REAL NOT NULL,
          total_price REAL NOT NULL,
          profit REAL NOT NULL DEFAULT 0
        )
      `)
      await db.execute(`CREATE TABLE IF NOT EXISTS daily_summaries (
        summary_date TEXT PRIMARY KEY,
        revenue REAL NOT NULL DEFAULT 0,
        profit REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )`)
      await db.execute(`CREATE TABLE IF NOT EXISTS credit_notes (
        id TEXT PRIMARY KEY,
        credit_note_number TEXT NOT NULL UNIQUE,
        original_invoice_number TEXT NOT NULL,
        original_sale_id TEXT NOT NULL REFERENCES sales(id),
        total_amount REAL NOT NULL,
        cashier_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`)
      await db.execute(`CREATE TABLE IF NOT EXISTS credit_note_items (
        id TEXT PRIMARY KEY,
        credit_note_id TEXT NOT NULL REFERENCES credit_notes(id),
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        sku TEXT NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL
      )`)
      // Workers Payroll & Attendance tables (see src/types/payroll.ts).
      await db.execute(`
        CREATE TABLE IF NOT EXISTS workers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          phone TEXT NOT NULL DEFAULT '',
          daily_rate REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          created_at TEXT NOT NULL
        )
      `)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS worker_attendance (
          id TEXT PRIMARY KEY,
          worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
          date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ABSENT',
          deduction_amount REAL NOT NULL DEFAULT 0,
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          UNIQUE (worker_id, date)
        )
      `)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS worker_advances (
          id TEXT PRIMARY KEY,
          worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
          amount REAL NOT NULL DEFAULT 0,
          date TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        )
      `)
      // Finalized monthly salary payouts (see SalaryPaymentRecord).
      // UNIQUE (worker_id, month_year) enforces one payout per worker/month,
      // mirroring the isSalaryPaid() lifecycle enforced in the payroll store.
      await db.execute(`
        CREATE TABLE IF NOT EXISTS salary_payments (
          id TEXT PRIMARY KEY,
          worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
          month_year TEXT NOT NULL,
          base_amount REAL NOT NULL,
          total_deductions REAL NOT NULL,
          total_advances REAL NOT NULL,
          net_amount REAL NOT NULL,
          paid_at TEXT NOT NULL,
          paid_by TEXT NOT NULL,
          UNIQUE (worker_id, month_year)
        )
      `)
      // Operating expense log — salary payouts are recorded here so that net
      // profits in reports reflect employee wages.
      await db.execute(`
        CREATE TABLE IF NOT EXISTS operating_expenses (
          id TEXT PRIMARY KEY,
          expense_date TEXT NOT NULL,
          category TEXT NOT NULL,
          description TEXT NOT NULL,
          amount REAL NOT NULL,
          created_at TEXT NOT NULL
        )
      `)
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id)'
      )
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)'
      )
      // Query-plan indexes: sales-history date scans, SKU/barcode lookups
      // from the POS search and scanner, and credit-note item joins.
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at)'
      )
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)'
      )
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_credit_notes_created_at ON credit_notes(created_at)'
      )
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_credit_note_items_note_id ON credit_note_items(credit_note_id)'
      )
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id)'
      )
      // Foreign-key / relation indexes for the payroll tables (cascaded deletes
      // and per-worker history lookups benefit from them).
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_worker_attendance_worker_id ON worker_attendance(worker_id)'
      )
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_worker_advances_worker_id ON worker_advances(worker_id)'
      )
      // Returns query a credit note by its originating invoice.
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_credit_notes_original_sale_id ON credit_notes(original_sale_id)'
      )
      await db.execute(`CREATE TABLE IF NOT EXISTS license (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        license_key TEXT,
        status TEXT NOT NULL DEFAULT 'UNREGISTERED',
        activation_date TEXT,
        expiration_date TEXT,
        is_trial INTEGER NOT NULL DEFAULT 0,
        first_run_date TEXT,
        trial_expiration_date TEXT,
        last_active_time TEXT
      )`)
      // Authentication accounts (see src/types/auth.ts). Passwords are stored
      // as PBKDF2-SHA256 hashes produced by src/services/password-crypto.ts.
      await db.execute(`
        CREATE TABLE IF NOT EXISTS auth_users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('ADMIN', 'CASHIER')),
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)
      // Lightweight migration for databases created before the unit column existed.
      await db
        .execute('ALTER TABLE products ADD COLUMN unit TEXT')
        .catch(() => {
          // Column already exists — nothing to do.
        })
      await db
        .execute('ALTER TABLE products ADD COLUMN units_per_carton INTEGER')
        .catch(() => {
          // Column already exists — nothing to do.
        })
      // Barcode support (barcode scanners, see src/hooks/useBarcodeScanner.ts).
      await db
        .execute('ALTER TABLE products ADD COLUMN barcode TEXT')
        .catch(() => {
          // Column already exists — nothing to do.
        })
      await db
        .execute(
          'ALTER TABLE sales ADD COLUMN total_profit REAL NOT NULL DEFAULT 0'
        )
        .catch(() => {
          // Column already exists — nothing to do.
        })
      await db
        .execute(
          'ALTER TABLE sale_items ADD COLUMN purchase_price REAL NOT NULL DEFAULT 0'
        )
        .catch(() => {
          // Column already exists — nothing to do.
        })
      await db
        .execute(
          'ALTER TABLE sale_items ADD COLUMN profit REAL NOT NULL DEFAULT 0'
        )
        .catch(() => {
          // Column already exists — nothing to do.
        })
      // Migration: add sku column to sale_items (added to track item SKU on receipts).
      await db
        .execute(
          "ALTER TABLE sale_items ADD COLUMN sku TEXT NOT NULL DEFAULT ''"
        )
        .catch(() => {
          // Column already exists — nothing to do.
        })
      // Migration: add subtotal and tax columns to sales (for accurate receipt reprints).
      await db
        .execute(
          'ALTER TABLE sales ADD COLUMN subtotal REAL NOT NULL DEFAULT 0'
        )
        .catch(() => {
          // Column already exists — nothing to do.
        })
      await db
        .execute('ALTER TABLE sales ADD COLUMN tax REAL NOT NULL DEFAULT 0')
        .catch(() => {
          // Column already exists — nothing to do.
        })
      // Migrations for trial-period columns added to the license table later.
      for (const column of [
        'first_run_date',
        'trial_expiration_date',
        'last_active_time',
      ]) {
        await db
          .execute(`ALTER TABLE license ADD COLUMN ${column} TEXT`)
          .catch(() => {
            // Column already exists — nothing to do.
          })
      }
      return db
    })
    // Allow a retry after a failed startup instead of caching a rejected promise.
    dbPromise.catch(() => {
      dbPromise = null
    })
  }
  return dbPromise
}

/** Ensures the connection and schema exist before any query runs. */
export async function initializeDatabase(): Promise<void> {
  await getDb()
}

/* ------------------------------------------------------------------ */
/* Row mappers (snake_case DB rows ↔ camelCase domain types)          */
/* ------------------------------------------------------------------ */

interface ProductRow {
  id: string
  name: string
  sku: string
  barcode: string | null
  quantity: number
  min_threshold: number
  purchase_price: number
  selling_price: number
  category: string
  unit: string | null
  units_per_carton: number | null
  updated_at: string
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode ?? undefined,
    quantity: row.quantity,
    minThreshold: row.min_threshold,
    purchasePrice: row.purchase_price,
    sellingPrice: row.selling_price,
    category: row.category,
    unit: row.unit ?? undefined,
    unitsPerCarton: row.units_per_carton ?? undefined,
  }
}

/* ------------------------------------------------------------------ */
/* Products CRUD                                                       */
/* ------------------------------------------------------------------ */

export async function fetchProducts(): Promise<Product[]> {
  const db = await getDb()
  const rows = await db.select<ProductRow[]>(
    'SELECT id, name, sku, barcode, quantity, min_threshold, purchase_price, selling_price, category, unit, units_per_carton, updated_at FROM products ORDER BY name'
  )
  return rows.map(toProduct)
}

/**
 * Looks up a single product by its scanned barcode, falling back to the human
 * readable SKU. Serves as a safety net for the POS scanner when the in-memory
 * store has not been hydrated yet (or went stale).
 */
export async function findProductByBarcode(
  barcode: string
): Promise<Product | null> {
  const db = await getDb()
  const rows = await db.select<ProductRow[]>(
    `SELECT id, name, sku, barcode, quantity, min_threshold, purchase_price,
            selling_price, category, unit, units_per_carton, updated_at
     FROM products
     WHERE barcode = $1 OR sku = $1
     LIMIT 1`,
    [barcode]
  )
  const row = rows[0]
  return row ? toProduct(row) : null
}

export async function insertProduct(product: Product): Promise<void> {
  const db = await getDb()
  await db.execute(
    'INSERT INTO products (id, name, sku, quantity, min_threshold, purchase_price, selling_price, category, unit, units_per_carton, barcode, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
    [
      product.id,
      product.name,
      product.sku,
      product.quantity,
      product.minThreshold,
      product.purchasePrice,
      product.sellingPrice,
      product.category,
      product.unit ?? null,
      product.unitsPerCarton ?? null,
      product.barcode ?? null,
      new Date().toISOString(),
    ]
  )
}

export async function updateProductRow(product: Product): Promise<void> {
  const db = await getDb()
  await db.execute(
    'UPDATE products SET name = $1, sku = $2, quantity = $3, min_threshold = $4, purchase_price = $5, selling_price = $6, category = $7, unit = $8, units_per_carton = $9, barcode = $10, updated_at = $11 WHERE id = $12',
    [
      product.name,
      product.sku,
      product.quantity,
      product.minThreshold,
      product.purchasePrice,
      product.sellingPrice,
      product.category,
      product.unit ?? null,
      product.unitsPerCarton ?? null,
      product.barcode ?? null,
      new Date().toISOString(),
      product.id,
    ]
  )
}

export async function deleteProductRow(id: string): Promise<void> {
  const db = await getDb()
  await db.execute('DELETE FROM products WHERE id = $1', [id])
}

/**
 * Atomically increases a product's on-hand quantity by `addedQuantity` and
 * appends a `stock_transactions` audit row, mirroring the SQL cited in the
 * spec:
 *
 *   UPDATE products SET quantity = quantity + $1 WHERE id = $2
 *
 * Reads the current quantity inside the same `BEGIN … COMMIT` so the logged
 * `previous_quantity`/`new_quantity` values are always consistent with the
 * row that was actually updated (no race with a concurrent checkout).
 *
 * `costPrice` is optional — when supplied it refreshes the product's purchase
 * price (a common need when a new invoice arrives at a revised rate); when
 * omitted the existing cost is left untouched via `COALESCE`.
 */
export async function addStockToProduct(
  productId: string,
  addedQuantity: number,
  costPrice?: number,
  userId = 'admin'
): Promise<void> {
  const now = new Date().toISOString()
  await withTransaction(async db => {
    const rows = await db.select<{ quantity: number }[]>(
      'SELECT quantity FROM products WHERE id = $1',
      [productId]
    )
    if (rows.length === 0) {
      throw new Error(`pos-stock: product not found (${productId})`)
    }
    const currentRow = rows[0]
    const previousQuantity = Number(currentRow?.quantity) || 0
    const newQuantity = previousQuantity + addedQuantity
    await db.execute(
      'UPDATE products SET quantity = quantity + $1, purchase_price = COALESCE($2, purchase_price), updated_at = $3 WHERE id = $4',
      [addedQuantity, costPrice ?? null, now, productId]
    )
    await db.execute(
      'INSERT INTO stock_transactions (id, product_id, type, quantity, previous_quantity, new_quantity, cost_price, user_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        crypto.randomUUID(),
        productId,
        'IN',
        addedQuantity,
        previousQuantity,
        newQuantity,
        costPrice ?? null,
        userId,
        now,
      ]
    )
  })
}

/**
 * Loads recorded stock movements, optionally scoped to a single product,
 * newest first — used by the audit/history view.
 */
export async function fetchStockTransactions(
  productId?: string
): Promise<StockTransaction[]> {
  if (!isTauriRuntime()) return []
  const db = await getDb()
  const rows = productId
    ? await db.select<StockTransactionRow[]>(
        'SELECT id, product_id, type, quantity, previous_quantity, new_quantity, cost_price, user_id, created_at FROM stock_transactions WHERE product_id = $1 ORDER BY created_at DESC',
        [productId]
      )
    : await db.select<StockTransactionRow[]>(
        'SELECT id, product_id, type, quantity, previous_quantity, new_quantity, cost_price, user_id, created_at FROM stock_transactions ORDER BY created_at DESC'
      )
  return rows.map(toStockTransaction)
}

/* ------------------------------------------------------------------ */
/* Sales persistence                                                   */
/* ------------------------------------------------------------------ */

interface SaleRow {
  id: string
  invoice_number: string
  subtotal: number
  tax: number
  total_amount: number
  total_profit: number
  cashier_name: string
  created_at: string
}

interface SaleItemRow {
  id: string
  sale_id: string
  product_id: string
  product_name: string
  sku: string
  quantity: number
  purchase_price: number
  unit_price: number
  total_price: number
  profit: number
}

/**
 * Runs `work` inside a single SQLite transaction (`BEGIN IMMEDIATE` /
 * `COMMIT`, with `ROLLBACK` on any failure) so multi-step writes either
 * fully apply or leave no trace — a crash mid-checkout can never persist a
 * half-written invoice.
 *
 * The plugin draws statements from a sqlx pool (up to 10 connections), and
 * `BEGIN`/`COMMIT` must land on the SAME connection as the statements between
 * them. Our awaits are sequential, but a concurrent caller (e.g. a hydrate
 * racing a checkout) could otherwise grab a second pooled connection
 * mid-transaction — so every transaction is chained onto one promise.
 */
let transactionChain: Promise<unknown> = Promise.resolve()

async function withTransaction<T>(
  work: (db: Database) => Promise<T>
): Promise<T> {
  const run = transactionChain.then(async () => {
    const db = await getDb()
    await db.execute('BEGIN IMMEDIATE')
    try {
      const result = await work(db)
      await db.execute('COMMIT')
      return result
    } catch (error) {
      // Never mask the original error if the rollback itself fails.
      await db.execute('ROLLBACK').catch(() => undefined)
      throw error
    }
  })
  // Keep the chain alive even when a transaction fails.
  transactionChain = run.catch(() => undefined)
  return run
}

/**
 * Inserts the invoice header and its item lines inside a single SQLite
 * transaction — a crash mid-write can never leave line items without their
 * invoice or an invoice without its lines.
 */
export async function persistSale(sale: Sale): Promise<void> {
  await withTransaction(async db => {
    await db.execute(
      'INSERT INTO sales (id, invoice_number, subtotal, tax, total_amount, total_profit, cashier_name, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        sale.id,
        sale.invoiceNumber,
        sale.subtotal,
        sale.tax,
        sale.total,
        sale.totalProfit ?? 0,
        sale.cashierId,
        sale.createdAt,
      ]
    )
    for (const item of sale.items) {
      await db.execute(
        'INSERT INTO sale_items (id, sale_id, product_id, product_name, sku, quantity, purchase_price, unit_price, total_price, profit) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [
          crypto.randomUUID(),
          sale.id,
          item.productId,
          item.name,
          item.sku ?? '',
          item.quantity,
          item.purchasePrice ?? 0,
          item.unitPrice,
          item.lineTotal,
          item.profit ?? 0,
        ]
      )
    }
  })
}

/** Absolute post-sale quantity for one product (already clamped >= 0). */
export interface StockUpdate {
  productId: string
  newQuantity: number
}

/* ------------------------------------------------------------------ */
/* Stock transactions (audit log for non-sale stock movements)        */
/* ------------------------------------------------------------------ */

interface StockTransactionRow {
  id: string
  product_id: string
  type: string
  quantity: number
  previous_quantity: number
  new_quantity: number
  cost_price: number | null
  user_id: string
  created_at: string
}

function toStockTransaction(row: StockTransactionRow): StockTransaction {
  return {
    id: row.id,
    productId: row.product_id,
    type: (row.type as StockTransaction['type']) ?? 'IN',
    quantity: row.quantity,
    previousQuantity: row.previous_quantity,
    newQuantity: row.new_quantity,
    costPrice: row.cost_price ?? undefined,
    userId: row.user_id,
    createdAt: row.created_at,
  }
}

/**
 * Atomically records a sale AND applies the inventory decrement: invoice
 * header + line items + stock updates commit together or not at all, so a
 * crash between "save invoice" and "decrement stock" can never desynchronize
 * inventory from sales history.
 */
export async function persistSaleAtomic(
  sale: Sale,
  stockUpdates: StockUpdate[]
): Promise<void> {
  await withTransaction(async db => {
    await db.execute(
      'INSERT INTO sales (id, invoice_number, subtotal, tax, total_amount, total_profit, cashier_name, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        sale.id,
        sale.invoiceNumber,
        sale.subtotal,
        sale.tax,
        sale.total,
        sale.totalProfit ?? 0,
        sale.cashierId,
        sale.createdAt,
      ]
    )
    for (const item of sale.items) {
      await db.execute(
        'INSERT INTO sale_items (id, sale_id, product_id, product_name, sku, quantity, purchase_price, unit_price, total_price, profit) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [
          crypto.randomUUID(),
          sale.id,
          item.productId,
          item.name,
          item.sku ?? '',
          item.quantity,
          item.purchasePrice ?? 0,
          item.unitPrice,
          item.lineTotal,
          item.profit ?? 0,
        ]
      )
    }
    for (const update of stockUpdates) {
      await db.execute('UPDATE products SET quantity = $1 WHERE id = $2', [
        update.newQuantity,
        update.productId,
      ])
    }
  })
}

/** Loads every stored invoice (with item lines), newest first. */
export async function fetchSales(): Promise<Sale[]> {
  const db = await getDb()
  const saleRows = await db.select<SaleRow[]>(
    'SELECT id, invoice_number, subtotal, tax, total_amount, total_profit, cashier_name, created_at FROM sales ORDER BY created_at DESC'
  )
  if (saleRows.length === 0) return []

  // Scope the item fetch to only the loaded sales — avoids loading millions
  // of rows when the DB has years of history.
  const saleIds = saleRows.map(r => `'${r.id}'`).join(',')
  const itemRows = await db.select<SaleItemRow[]>(
    `SELECT id, sale_id, product_id, product_name, sku, quantity, purchase_price, unit_price, total_price, profit FROM sale_items WHERE sale_id IN (${saleIds})`
  )

  const itemsBySale = new Map<string, SaleItem[]>()
  for (const row of itemRows) {
    const items = itemsBySale.get(row.sale_id) ?? []
    items.push({
      productId: row.product_id,
      sku: row.sku ?? '',
      name: row.product_name,
      purchasePrice: row.purchase_price,
      unitPrice: row.unit_price,
      quantity: row.quantity,
      lineTotal: row.total_price,
      profit: row.profit,
    })
    itemsBySale.set(row.sale_id, items)
  }

  return saleRows.map(row => ({
    id: row.id,
    invoiceNumber: row.invoice_number,
    items: itemsBySale.get(row.id) ?? [],
    subtotal: row.subtotal ?? 0,
    tax: row.tax ?? 0,
    total: row.total_amount,
    totalProfit: row.total_profit,
    cashierId: row.cashier_name,
    createdAt: row.created_at,
  }))
}

/**
 * Returns the next safe invoice sequence number by reading MAX from the DB.
 * Avoids collisions when old sales are pruned (cleanupOldSalesData) which
 * would otherwise lower the in-memory sales.length counter.
 */
export async function getNextInvoiceSequence(): Promise<number> {
  const db = await getDb()
  const rows = await db.select<{ max_num: string | null }[]>(
    `SELECT MAX(CAST(REPLACE(invoice_number, 'INV-', '') AS INTEGER)) AS max_num FROM sales WHERE invoice_number LIKE 'INV-%'`
  )
  return (Number(rows[0]?.max_num) || 0) + 1
}

/**
 * Returns the next safe credit-note sequence number by reading MAX from the DB.
 */
export async function getNextCreditNoteSequence(): Promise<number> {
  const db = await getDb()
  const year = new Date().getFullYear()
  const rows = await db.select<{ max_num: string | null }[]>(
    `SELECT MAX(CAST(REPLACE(credit_note_number, 'CN-${year}-', '') AS INTEGER)) AS max_num FROM credit_notes WHERE credit_note_number LIKE 'CN-${year}-%'`
  )
  return (Number(rows[0]?.max_num) || 0) + 1
}

/** Inserts a credit note and its item lines in one transaction. */
export async function persistCreditNote(note: CreditNote): Promise<void> {
  await withTransaction(async db => {
    await db.execute(
      'INSERT INTO credit_notes (id, credit_note_number, original_invoice_number, original_sale_id, total_amount, cashier_name, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        note.id,
        note.creditNoteNumber,
        note.originalInvoiceNumber,
        note.originalSaleId,
        note.total,
        note.cashierId,
        note.createdAt,
      ]
    )
    for (const item of note.items) {
      await db.execute(
        'INSERT INTO credit_note_items (id, credit_note_id, product_id, product_name, quantity, sku, unit_price, total_price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [
          crypto.randomUUID(),
          note.id,
          item.productId,
          item.name,
          item.quantity,
          item.sku,
          item.unitPrice,
          item.lineTotal,
        ]
      )
    }
  })
}

export async function fetchCreditNotes(): Promise<CreditNote[]> {
  const db = await getDb()
  const rows = await db.select<
    {
      id: string
      credit_note_number: string
      original_invoice_number: string
      original_sale_id: string
      total_amount: number
      cashier_name: string
      created_at: string
    }[]
  >(
    'SELECT id, credit_note_number, original_invoice_number, original_sale_id, total_amount, cashier_name, created_at FROM credit_notes ORDER BY created_at DESC'
  )
  const items = await db.select<
    {
      credit_note_id: string
      product_id: string
      product_name: string
      quantity: number
      sku: string
      unit_price: number
      total_price: number
    }[]
  >(
    'SELECT credit_note_id, product_id, product_name, quantity, sku, unit_price, total_price FROM credit_note_items'
  )
  return rows.map(row => ({
    id: row.id,
    creditNoteNumber: row.credit_note_number,
    originalInvoiceNumber: row.original_invoice_number,
    originalSaleId: row.original_sale_id,
    total: row.total_amount,
    cashierId: row.cashier_name,
    createdAt: row.created_at,
    items: items
      .filter(item => item.credit_note_id === row.id)
      .map(item => ({
        productId: item.product_id,
        name: item.product_name,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        lineTotal: item.total_price,
      })),
  }))
}

/** Removes sales, line items, and daily summaries outside the six-month window. */
export async function cleanupOldSalesData(): Promise<void> {
  const db = await getDb()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 180)
  const cutoffIso = cutoff.toISOString()
  await db.execute(
    'DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE created_at < $1)',
    [cutoffIso]
  )
  await db.execute('DELETE FROM sales WHERE created_at < $1', [cutoffIso])
  await db.execute('DELETE FROM daily_summaries WHERE summary_date < $1', [
    cutoffIso.slice(0, 10),
  ])
}

/* ------------------------------------------------------------------ */
/* License persistence (single-row table)                              */
/* ------------------------------------------------------------------ */

import type { LicenseRecord, LicenseStatus } from '@/types/license'

interface LicenseRow {
  license_key: string | null
  status: string
  activation_date: string | null
  expiration_date: string | null
  is_trial: number
  first_run_date: string | null
  trial_expiration_date: string | null
  last_active_time: string | null
}

function toLicenseRecord(row: LicenseRow): LicenseRecord {
  const status: LicenseStatus =
    row.status === 'ACTIVE' ||
    row.status === 'TRIAL' ||
    row.status === 'EXPIRED'
      ? row.status
      : 'UNREGISTERED'
  return {
    licenseKey: row.license_key,
    status,
    activationDate: row.activation_date,
    expirationDate: row.expiration_date,
    isTrial: row.is_trial === 1,
    firstRunDate: row.first_run_date,
    trialExpirationDate: row.trial_expiration_date,
    lastActiveTime: row.last_active_time,
  }
}

/** Loads the stored license record, or null when the app is not activated yet. */
export async function fetchLicenseRow(): Promise<LicenseRecord | null> {
  const db = await getDb()
  const rows = await db.select<LicenseRow[]>(
    'SELECT license_key, status, activation_date, expiration_date, is_trial, first_run_date, trial_expiration_date, last_active_time FROM license WHERE id = 1'
  )
  const row = rows.at(0)
  return row ? toLicenseRecord(row) : null
}

/** Inserts or updates the (single) license record. */
export async function persistLicense(record: LicenseRecord): Promise<void> {
  const db = await getDb()
  await db.execute(
    'INSERT OR REPLACE INTO license (id, license_key, status, activation_date, expiration_date, is_trial, first_run_date, trial_expiration_date, last_active_time) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)',
    [
      record.licenseKey,
      record.status,
      record.activationDate,
      record.expirationDate,
      record.isTrial ? 1 : 0,
      record.firstRunDate,
      record.trialExpirationDate,
      record.lastActiveTime,
    ]
  )
}
/* ------------------------------------------------------------------ */
/* Workers Payroll & Attendance persistence                             */
/* ------------------------------------------------------------------ */

interface WorkerRow {
  id: string
  name: string
  phone: string
  daily_rate: number
  status: string
  created_at: string
}

interface AttendanceRow {
  id: string
  worker_id: string
  date: string
  status: string
  deduction_amount: number
  notes: string
  created_at: string
}

interface AdvanceRow {
  id: string
  worker_id: string
  amount: number
  date: string
  notes: string
  created_at: string
}

function toWorker(row: WorkerRow): Worker {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    dailyRate: row.daily_rate,
    status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    createdAt: row.created_at,
  }
}

function toAttendance(row: AttendanceRow): AttendanceRecord {
  return {
    id: row.id,
    workerId: row.worker_id,
    date: row.date,
    status:
      row.status === 'PRESENT' || row.status === 'HALF_DAY'
        ? row.status
        : 'ABSENT',
    deductionAmount: row.deduction_amount,
    notes: row.notes,
    createdAt: row.created_at,
  }
}

function toAdvance(row: AdvanceRow): AdvanceRecord {
  return {
    id: row.id,
    workerId: row.worker_id,
    amount: row.amount,
    date: row.date,
    notes: row.notes,
    createdAt: row.created_at,
  }
}

/** Loads every payroll record (workers, attendance and advances). */
export async function fetchWorkersData(): Promise<{
  workers: Worker[]
  attendance: AttendanceRecord[]
  advances: AdvanceRecord[]
}> {
  const db = await getDb()
  const [workerRows, attendanceRows, advanceRows] = await Promise.all([
    db.select<WorkerRow[]>(
      'SELECT id, name, phone, daily_rate, status, created_at FROM workers ORDER BY name'
    ),
    db.select<AttendanceRow[]>(
      'SELECT id, worker_id, date, status, deduction_amount, notes, created_at FROM worker_attendance ORDER BY date'
    ),
    db.select<AdvanceRow[]>(
      'SELECT id, worker_id, amount, date, notes, created_at FROM worker_advances ORDER BY date'
    ),
  ])
  return {
    workers: workerRows.map(toWorker),
    attendance: attendanceRows.map(toAttendance),
    advances: advanceRows.map(toAdvance),
  }
}

/** Inserts a worker, or replaces it when the id already exists (add/edit). */
export async function persistWorker(worker: Worker): Promise<void> {
  const db = await getDb()
  await db.execute(
    'INSERT OR REPLACE INTO workers (id, name, phone, daily_rate, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [
      worker.id,
      worker.name,
      worker.phone,
      worker.dailyRate,
      worker.status,
      worker.createdAt,
    ]
  )
}

/** Removes a worker and cascades to their attendance/advance/salary rows. */
export async function deleteWorkerRow(id: string): Promise<void> {
  const db = await getDb()
  await db.execute('DELETE FROM workers WHERE id = $1', [id])
}

/**
 * Upserts one daily attendance record. The `UNIQUE (worker_id, date)`
 * constraint guarantees one row per worker/day, so re-saving a day simply
 * updates the existing row (status, deduction and notes).
 */
export async function persistAttendance(
  record: AttendanceRecord
): Promise<void> {
  const db = await getDb()
  await db.execute(
    `INSERT INTO worker_attendance (id, worker_id, date, status, deduction_amount, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (worker_id, date) DO UPDATE SET
       status = excluded.status,
       deduction_amount = excluded.deduction_amount,
       notes = excluded.notes`,
    [
      record.id,
      record.workerId,
      record.date,
      record.status,
      record.deductionAmount,
      record.notes,
      record.createdAt,
    ]
  )
}

/** Inserts a new cash advance record for a worker. */
export async function persistAdvance(record: AdvanceRecord): Promise<void> {
  const db = await getDb()
  await db.execute(
    'INSERT INTO worker_advances (id, worker_id, amount, date, notes, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [
      record.id,
      record.workerId,
      record.amount,
      record.date,
      record.notes,
      record.createdAt,
    ]
  )
}

interface SalaryPaymentRow {
  id: string
  worker_id: string
  month_year: string
  base_amount: number
  total_deductions: number
  total_advances: number
  net_amount: number
  paid_at: string
  paid_by: string
}

function toSalaryPayment(row: SalaryPaymentRow): SalaryPaymentRecord {
  return {
    id: row.id,
    workerId: row.worker_id,
    monthYear: row.month_year,
    baseAmount: row.base_amount,
    totalDeductions: row.total_deductions,
    totalAdvances: row.total_advances,
    netAmount: row.net_amount,
    paidAt: row.paid_at,
    paidBy: row.paid_by,
  }
}

/** Loads every finalized salary payout (restores PAID months after restart). */
export async function fetchSalaryPayments(): Promise<SalaryPaymentRecord[]> {
  const db = await getDb()
  const rows = await db.select<SalaryPaymentRow[]>(
    'SELECT id, worker_id, month_year, base_amount, total_deductions, total_advances, net_amount, paid_at, paid_by FROM salary_payments ORDER BY paid_at DESC'
  )
  return rows.map(toSalaryPayment)
}

/**
 * Inserts a finalized monthly salary payout. `INSERT OR REPLACE` keeps the
 * function idempotent; the UNIQUE (worker_id, month_year) constraint is the
 * database-level guard against paying the same month twice.
 */
export async function persistSalaryPayment(
  payment: SalaryPaymentRecord
): Promise<void> {
  const db = await getDb()
  await db.execute(
    `INSERT OR REPLACE INTO salary_payments
       (id, worker_id, month_year, base_amount, total_deductions,
        total_advances, net_amount, paid_at, paid_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      payment.id,
      payment.workerId,
      payment.monthYear,
      payment.baseAmount,
      payment.totalDeductions,
      payment.totalAdvances,
      payment.netAmount,
      payment.paidAt,
      payment.paidBy,
    ]
  )
}

/** Logs an operating expense (e.g. a salary payout) for profit reporting. */
export async function persistOperatingExpense(
  expense: OperatingExpenseRecord
): Promise<void> {
  const db = await getDb()
  await db.execute(
    'INSERT INTO operating_expenses (id, expense_date, category, description, amount, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [
      expense.id,
      expense.expenseDate,
      expense.category,
      expense.description,
      expense.amount,
      expense.createdAt,
    ]
  )
}

/* ------------------------------------------------------------------ */
/* Auth accounts persistence                                           */
/* ------------------------------------------------------------------ */

interface AuthUserRow {
  id: string
  username: string
  display_name: string
  role: string
  password_hash: string
  created_at: string
  updated_at: string
}

function toAuthAccount(row: AuthUserRow): AuthAccount {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role === 'ADMIN' ? 'ADMIN' : 'CASHIER',
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Loads every auth account (hashes included — store layer only). */
export async function fetchAuthUsers(): Promise<AuthAccount[]> {
  const db = await getDb()
  const rows = await db.select<AuthUserRow[]>(
    'SELECT id, username, display_name, role, password_hash, created_at, updated_at FROM auth_users ORDER BY role, username'
  )
  return rows.map(toAuthAccount)
}

/** Inserts a new auth account. */
export async function insertAuthUser(account: AuthAccount): Promise<void> {
  const db = await getDb()
  await db.execute(
    'INSERT INTO auth_users (id, username, display_name, role, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [
      account.id,
      account.username,
      account.displayName,
      account.role,
      account.passwordHash,
      account.createdAt,
      account.updatedAt,
    ]
  )
}

/** Replaces the stored password hash for an account. */
export async function updateAuthUserPassword(
  id: string,
  passwordHash: string
): Promise<void> {
  const db = await getDb()
  await db.execute(
    'UPDATE auth_users SET password_hash = $1, updated_at = $2 WHERE id = $3',
    [passwordHash, new Date().toISOString(), id]
  )
}

/* ------------------------------------------------------------------ */
/* Analytics — product performance & dead-stock reports                */
/* ------------------------------------------------------------------ */

/** Maps a TimeRange to the number of days used in the SQL date filter. */
function rangeToDays(range: TimeRange): number {
  switch (range) {
    case '1_MONTH':
      return 30
    case '3_MONTHS':
      return 90
    case '6_MONTHS':
      return 180
  }
}

/** Returns the ISO timestamp for `days` ago (used as the WHERE filter). */
function cutoffIso(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

/**
 * يجلب بيانات تحليلات المنتجات المجمعة من جدول المبيعات خلال فترة زمنية محددة.
 *
 * يعرض لكل منتج: الكمية المباعة، الإجمالي، الأرباح، وهامش الربح.
 * يُرجع بيانات فارغة عند عدم التشغيل داخل بيئة تاوري (وضع المتصفح).
 */
export async function fetchProductAnalytics(
  range: TimeRange
): Promise<ProductAnalyticsItem[]> {
  if (!isTauriRuntime()) return []
  const db = await getDb()
  const cutoff = cutoffIso(rangeToDays(range))
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT
       si.product_id AS productId,
       si.product_name AS productName,
       SUM(si.quantity) AS totalQuantitySold,
       SUM(si.total_price) AS totalRevenue,
       SUM(si.profit) AS totalProfit,
       ROUND(
         (SUM(si.profit) / NULLIF(SUM(si.total_price), 0)) * 100,
         1
       ) AS profitMargin
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.created_at >= $1
     GROUP BY si.product_id, si.product_name
     ORDER BY totalProfit DESC`,
    [cutoff]
  )
  return rows.map(row => ({
    productId: String(row.productId),
    productName: String(row.productName),
    totalQuantitySold: Number(row.totalQuantitySold) || 0,
    totalRevenue: Number(row.totalRevenue) || 0,
    totalProfit: Number(row.totalProfit) || 0,
    profitMargin: Number(row.profitMargin) || 0,
  }))
}

/**
 * يجلب المنتجات الراكدة وبطيئة الحركة مع رأس المال المجمّد.
 *
 * يعرض المنتجات التي لم تُباع أو بيعت بكميات قليلة جداً خلال الفترة،
 * مع حساب رأس المال المجمّد (الكمية × سعر الشراء) لمساعدة المدير
 * في اتخاذ قرار تصفية المخزون.
 */
export async function fetchDeadStockAnalytics(
  range: TimeRange
): Promise<DeadStockItem[]> {
  if (!isTauriRuntime()) return []
  const db = await getDb()
  const cutoff = cutoffIso(rangeToDays(range))
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT
       p.id AS productId,
       p.name AS productName,
       p.sku AS sku,
       p.category AS category,
       p.quantity AS quantity,
       p.purchase_price AS purchasePrice,
       ROUND(p.quantity * p.purchase_price, 2) AS tiedUpCapital,
       COALESCE(sales_agg.total_sold, 0) AS quantitySold
     FROM products p
     LEFT JOIN (
       SELECT si.product_id, SUM(si.quantity) AS total_sold
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE s.created_at >= $1
       GROUP BY si.product_id
     ) sales_agg ON sales_agg.product_id = p.id
     WHERE COALESCE(sales_agg.total_sold, 0) < 3
     ORDER BY tiedUpCapital DESC`,
    [cutoff]
  )
  return rows.map(row => ({
    productId: String(row.productId),
    productName: String(row.productName),
    sku: String(row.sku),
    category: String(row.category),
    quantity: Number(row.quantity) || 0,
    purchasePrice: Number(row.purchasePrice) || 0,
    tiedUpCapital: Number(row.tiedUpCapital) || 0,
    quantitySold: Number(row.quantitySold) || 0,
  }))
}

/**
 * يجلب المنتجات مرتبة حسب أعلى هامش ربح بالنسبة المئوية.
 *
 * يحسب الهامش: ((سعر البيع - سعر الشراء) / سعر البيع) × 100
 */
export async function fetchHighestMarginProducts(): Promise<
  HighestMarginItem[]
> {
  if (!isTauriRuntime()) return []
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT
       p.id AS productId,
       p.name AS productName,
       p.sku AS sku,
       p.category AS category,
       p.purchase_price AS purchasePrice,
       p.selling_price AS sellingPrice,
       ROUND(
         ((p.selling_price - p.purchase_price) / NULLIF(p.selling_price, 0)) * 100,
         1
       ) AS profitMarginPercent
     FROM products p
     WHERE p.selling_price > 0
     ORDER BY profitMarginPercent DESC
     LIMIT 20`
  )
  return rows.map(row => ({
    productId: String(row.productId),
    productName: String(row.productName),
    sku: String(row.sku),
    category: String(row.category),
    purchasePrice: Number(row.purchasePrice) || 0,
    sellingPrice: Number(row.sellingPrice) || 0,
    profitMarginPercent: Number(row.profitMarginPercent) || 0,
  }))
}

/**
 * يجلب ملخص المؤشرات الرئيسية (KPIs) للوحة التحليلات.
 *
 * يشمل: إجمالي القطع المباعة، الإيرادات، الأرباح، وقيمة الرواكد.
 */
export async function fetchAnalyticsSummary(
  range: TimeRange
): Promise<AnalyticsSummary> {
  if (!isTauriRuntime()) {
    return {
      totalUnitsSold: 0,
      totalRevenue: 0,
      totalProfit: 0,
      deadStockValue: 0,
    }
  }
  const db = await getDb()
  const cutoff = cutoffIso(rangeToDays(range))

  const salesRow = await db.select<Record<string, unknown>[]>(
    `SELECT
       COALESCE(SUM(si.quantity), 0) AS totalUnitsSold,
       COALESCE(SUM(si.total_price), 0) AS totalRevenue,
       COALESCE(SUM(si.profit), 0) AS totalProfit
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.created_at >= $1`,
    [cutoff]
  )

  const deadStockRow = await db.select<Record<string, unknown>[]>(
    `SELECT COALESCE(SUM(p.quantity * p.purchase_price), 0) AS deadStockValue
     FROM products p
     LEFT JOIN (
       SELECT si.product_id, SUM(si.quantity) AS total_sold
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE s.created_at >= $1
       GROUP BY si.product_id
     ) sales_agg ON sales_agg.product_id = p.id
     WHERE COALESCE(sales_agg.total_sold, 0) < 3`,
    [cutoff]
  )

  return {
    totalUnitsSold: Number(salesRow[0]?.totalUnitsSold) || 0,
    totalRevenue: Number(salesRow[0]?.totalRevenue) || 0,
    totalProfit: Number(salesRow[0]?.totalProfit) || 0,
    deadStockValue: Number(deadStockRow[0]?.deadStockValue) || 0,
  }
}

/**
 * يجلب جميع بيانات التحليلات في استدعاء واحد متوازي.
 *
 * يُستخدم من قبل لوحة التحميل لتحميل كل البيانات دفعة واحدة
 * مع إمكانية التخزين المؤقت عبر TanStack Query.
 */
export async function fetchFullAnalytics(
  range: TimeRange
): Promise<AnalyticsData> {
  const [summary, productPerformance, deadStock, highestMargins] =
    await Promise.all([
      fetchAnalyticsSummary(range),
      fetchProductAnalytics(range),
      fetchDeadStockAnalytics(range),
      fetchHighestMarginProducts(),
    ])

  return {
    summary,
    productPerformance,
    deadStock,
    highestMargins,
  }
}
