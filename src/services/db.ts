/**
 * SQLite persistence layer backed by `tauri-plugin-sql`.
 *
 * All functions are no-ops when not running inside the Tauri desktop runtime
 * (browser dev server / unit tests), so stores keep working unchanged.
 */
import Database from '@tauri-apps/plugin-sql'

import type { Product } from '@/types/inventory'
import type { Sale, SaleItem } from '@/types/sales'

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
          unit TEXT,
          units_per_carton INTEGER,
          updated_at TEXT NOT NULL
        )
      `)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS sales (
          id TEXT PRIMARY KEY,
          invoice_number TEXT NOT NULL,
          total_amount REAL NOT NULL,
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
          quantity INTEGER NOT NULL,
          unit_price REAL NOT NULL,
          total_price REAL NOT NULL
        )
      `)
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id)'
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
    'SELECT id, name, sku, quantity, min_threshold, purchase_price, selling_price, category, unit, units_per_carton, updated_at FROM products ORDER BY name'
  )
  return rows.map(toProduct)
}

export async function insertProduct(product: Product): Promise<void> {
  const db = await getDb()
  await db.execute(
    'INSERT INTO products (id, name, sku, quantity, min_threshold, purchase_price, selling_price, category, unit, units_per_carton, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
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
      new Date().toISOString(),
    ]
  )
}

export async function updateProductRow(product: Product): Promise<void> {
  const db = await getDb()
  await db.execute(
    'UPDATE products SET name = $1, sku = $2, quantity = $3, min_threshold = $4, purchase_price = $5, selling_price = $6, category = $7, unit = $8, units_per_carton = $9, updated_at = $10 WHERE id = $11',
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
      new Date().toISOString(),
      product.id,
    ]
  )
}

export async function deleteProductRow(id: string): Promise<void> {
  const db = await getDb()
  await db.execute('DELETE FROM products WHERE id = $1', [id])
}

/* ------------------------------------------------------------------ */
/* Sales persistence                                                   */
/* ------------------------------------------------------------------ */

interface SaleRow {
  id: string
  invoice_number: string
  total_amount: number
  cashier_name: string
  created_at: string
}

interface SaleItemRow {
  id: string
  sale_id: string
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  total_price: number
}

/** Inserts the invoice header and its item lines. */
export async function persistSale(sale: Sale): Promise<void> {
  const db = await getDb()
  await db.execute(
    'INSERT INTO sales (id, invoice_number, total_amount, cashier_name, created_at) VALUES ($1, $2, $3, $4, $5)',
    [sale.id, sale.invoiceNumber, sale.total, sale.cashierId, sale.createdAt]
  )
  for (const item of sale.items) {
    await db.execute(
      'INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        crypto.randomUUID(),
        sale.id,
        item.productId,
        item.name,
        item.quantity,
        item.unitPrice,
        item.lineTotal,
      ]
    )
  }
}

/** Loads every stored invoice (with item lines), newest first. */
export async function fetchSales(): Promise<Sale[]> {
  const db = await getDb()
  const saleRows = await db.select<SaleRow[]>(
    'SELECT id, invoice_number, total_amount, cashier_name, created_at FROM sales ORDER BY created_at DESC'
  )
  const itemRows = await db.select<SaleItemRow[]>(
    'SELECT id, sale_id, product_id, product_name, quantity, unit_price, total_price FROM sale_items'
  )

  const itemsBySale = new Map<string, SaleItem[]>()
  for (const row of itemRows) {
    const items = itemsBySale.get(row.sale_id) ?? []
    items.push({
      productId: row.product_id,
      sku: '',
      name: row.product_name,
      unitPrice: row.unit_price,
      quantity: row.quantity,
      lineTotal: row.total_price,
    })
    itemsBySale.set(row.sale_id, items)
  }

  return saleRows.map(row => ({
    id: row.id,
    invoiceNumber: row.invoice_number,
    items: itemsBySale.get(row.id) ?? [],
    subtotal: 0,
    tax: 0,
    total: row.total_amount,
    cashierId: row.cashier_name,
    createdAt: row.created_at,
  }))
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
