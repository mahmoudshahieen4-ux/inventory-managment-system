import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { toast } from 'sonner'

import i18n from '@/i18n/config'
import {
  addStockToProduct,
  deleteProductRow,
  fetchProducts,
  initializeDatabase,
  insertProduct,
  isTauriRuntime,
  updateProductRow,
} from '@/services/db'
import { useAuthStore } from '@/store/useAuthStore'
import type { StockUpdate } from '@/services/db'
import type { NewProduct, Product } from '@/types/inventory'

/**
 * Seed data used to initialize the inventory store.
 *
 * Includes products for every stock status:
 * - OUT_OF_STOCK: quantity is 0
 * - LOW_STOCK: quantity is between 1 and minThreshold (inclusive)
 * - IN_STOCK: quantity is above minThreshold
 */
export const initialProducts: Product[] = [
  // OUT_OF_STOCK
  {
    id: 'prod-001',
    name: 'Espresso Beans 1kg',
    sku: 'COF-001',
    barcode: '6291041500213',
    quantity: 0,
    minThreshold: 10,
    purchasePrice: 12.5,
    sellingPrice: 24.99,
    category: 'Coffee',
    unit: 'كرتونة',
    unitsPerCarton: 12,
  },
  // LOW_STOCK (below threshold)
  {
    id: 'prod-002',
    name: 'Whole Milk 1L',
    sku: 'DAI-002',
    barcode: '6291051500210',
    quantity: 5,
    minThreshold: 10,
    purchasePrice: 1.2,
    sellingPrice: 3.49,
    category: 'Dairy',
    unit: 'علبة',
  },
  // LOW_STOCK (exactly at threshold)
  {
    id: 'prod-003',
    name: 'Butter Croissant',
    sku: 'BAK-003',
    barcode: '6291061500217',
    quantity: 8,
    minThreshold: 8,
    purchasePrice: 0.9,
    sellingPrice: 2.99,
    category: 'Bakery',
    unit: 'علبة',
  },
  // IN_STOCK
  {
    id: 'prod-004',
    name: 'Dark Chocolate Bar',
    sku: 'SNK-004',
    barcode: '6291071500214',
    quantity: 50,
    minThreshold: 15,
    purchasePrice: 0.8,
    sellingPrice: 2.49,
    category: 'Snacks',
    unit: 'علبة',
  },
  // IN_STOCK
  {
    id: 'prod-005',
    name: 'Bottled Water 500ml',
    sku: 'BEV-005',
    barcode: '6291081500211',
    quantity: 120,
    minThreshold: 24,
    purchasePrice: 0.35,
    sellingPrice: 1.49,
    category: 'Beverages',
    unit: 'علبة',
  },
]

interface InventoryState {
  products: Product[]
  addProduct: (product: NewProduct) => Product
  updateProduct: (id: string, updates: Partial<NewProduct>) => void
  /**
   * Increases a product's on-hand quantity by `addedQuantity` (e.g. a received
   * shipment / purchase invoice) and optionally updates its purchase cost.
   *
   * New total = current stock + added quantity. The UI state is updated
   * optimistically (immediate feedback) while the change is persisted to SQLite
   * through `addStockToProduct`, which also writes an audit row inside the same
   * transaction. Admin-only entry point — call after RBAC gating.
   */
  addStock: (
    productId: string,
    addedQuantity: number,
    costPrice?: number
  ) => void
  /**
   * Applies post-checkout quantity changes to the UI state only — the
   * authoritative write already happened inside the atomic sale transaction,
   * so no per-product persistence runs here.
   */
  applyStockDeltas: (updates: StockUpdate[]) => void
  deleteProduct: (id: string) => void
  /** Loads stored products from SQLite; seeds the database on first launch. */
  hydrate: () => Promise<void>
}

/** Fire-and-forget persistence helper: local state first, toast on DB failure. */
function persist(action: () => Promise<void>): void {
  if (!isTauriRuntime()) return
  action().catch(error => {
    toast.error(`${i18n.t('db.toast.saveFailed')}: ${String(error)}`)
  })
}

/** Minimal merged-shape accepted by the coercion helper (id may be injected). */
interface ProductCoerceInput {
  id?: string
  name?: string
  sku?: string
  barcode?: string
  quantity?: number | string
  minThreshold?: number | string
  purchasePrice?: number | string
  sellingPrice?: number | string
  category?: string
  unit?: string
  unitsPerCarton?: number | string
}

/**
 * Coerces numeric and optional fields so string inputs never leak into state
 * or SQL, and guarantees a stable `id` (kept when editing, generated when
 * creating).
 */
function coerceProduct(product: ProductCoerceInput): Product {
  return {
    id: product.id ?? createProductId(),
    name: product.name ?? '',
    sku: product.sku?.trim() || createProductSku(),
    barcode: product.barcode?.trim() || undefined,
    quantity: Number(product.quantity) || 0,
    minThreshold: Number(product.minThreshold) || 0,
    purchasePrice: Number(product.purchasePrice) || 0,
    sellingPrice: Number(product.sellingPrice) || 0,
    category: product.category ?? '',
    unit: product.unit?.trim() || undefined,
    unitsPerCarton:
      product.unit === 'كرتونة' && Number(product.unitsPerCarton) > 0
        ? Number(product.unitsPerCarton)
        : undefined,
  }
}

export const useInventoryStore = create<InventoryState>()(
  devtools(
    (set, get) => ({
      products: initialProducts,

      addProduct: product => {
        const newProduct: Product = coerceProduct(product)
        set(
          state => ({ products: [...state.products, newProduct] }),
          undefined,
          'inventory/addProduct'
        )
        persist(() => insertProduct(newProduct))
        return newProduct
      },

      updateProduct: (id, updates) => {
        const current = get().products.find(product => product.id === id)
        const base = current ?? get().products[0]
        if (!base) return
        const merged = coerceProduct({ ...base, ...updates })
        set(
          state => ({
            products: state.products.map(product =>
              product.id === id ? merged : product
            ),
          }),
          undefined,
          'inventory/updateProduct'
        )
        if (current) {
          persist(() => updateProductRow(merged))
        }
      },

      addStock: (productId, addedQuantity, costPrice) => {
        set(
          state => ({
            products: state.products.map(product =>
              product.id === productId
                ? {
                    ...product,
                    quantity: product.quantity + addedQuantity,
                    // Refresh purchase cost only when a new one is supplied.
                    ...(costPrice !== undefined
                      ? { purchasePrice: costPrice }
                      : {}),
                  }
                : product
            ),
          }),
          undefined,
          'inventory/addStock'
        )
        persist(() =>
          addStockToProduct(
            productId,
            addedQuantity,
            costPrice,
            useAuthStore.getState().currentUser?.username ?? 'admin'
          )
        )
      },

      applyStockDeltas: updates => {
        if (updates.length === 0) return
        set(
          state => ({
            products: state.products.map(product => {
              const update = updates.find(
                entry => entry.productId === product.id
              )
              return update
                ? { ...product, quantity: update.newQuantity }
                : product
            }),
          }),
          undefined,
          'inventory/applyStockDeltas'
        )
      },

      deleteProduct: id => {
        set(
          state => ({
            products: state.products.filter(product => product.id !== id),
          }),
          undefined,
          'inventory/deleteProduct'
        )
        persist(() => deleteProductRow(id))
      },

      hydrate: async () => {
        if (!isTauriRuntime()) return
        try {
          await initializeDatabase()
          const stored = await fetchProducts()
          if (stored.length > 0) {
            set({ products: stored }, undefined, 'inventory/hydrate')
          } else {
            // First launch: persist the seed data so it survives restarts.
            for (const product of get().products) {
              await insertProduct(product)
            }
          }
        } catch (error) {
          toast.error(`${i18n.t('db.toast.loadFailed')}: ${String(error)}`)
          throw error
        }
      },
    }),
    { name: 'inventory-store' }
  )
)

/** Generates a unique id for newly added products. */
function createProductId(): string {
  return crypto.randomUUID()
}

/** Generates a readable SKU when the user leaves the product code empty. */
function createProductSku(): string {
  return `PRD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}
