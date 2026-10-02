import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { toast } from 'sonner'

import i18n from '@/i18n/config'
import {
  DEFAULT_PRODUCT_UNIT,
  normalizeProductUnit,
  resolveUnitsPerCarton,
} from '@/lib/product-unit'
import {
  addStockToProduct,
  addShipmentToInventory,
  deleteProductRow,
  fetchExpiringProductBatches,
  fetchProducts,
  initializeDatabase,
  insertProduct,
  isTauriRuntime,
  updateProductRow,
} from '@/services/db'
import { deductBoxStock, getTotalBoxStock } from '@/lib/dual-unit-stock'
import { planFefoDeductions } from '@/lib/fefo'
import { useAuthStore } from '@/store/useAuthStore'
import type { ShipmentLineInput, StockUpdate } from '@/services/db'
import type { NewProduct, Product, ProductBatch } from '@/types/inventory'

/**
 * Seed data used to initialize the inventory store.
 *
 * Includes products for every stock status:
 * - OUT_OF_STOCK: quantity is 0
 * - LOW_STOCK: quantity is between 1 and minThreshold (inclusive)
 * - IN_STOCK: quantity is above minThreshold
 */
const seedProducts: ProductCoerceInput[] = [
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
    cartonPurchasePrice: 12.5,
    cartonSellingPrice: 24.99,
    boxPurchasePrice: 12.5 / 12,
    boxSellingPrice: 24.99 / 12,
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

export const initialProducts: Product[] = seedProducts.map(coerceProduct)

interface InventoryState {
  products: Product[]
  productBatches: ProductBatch[]
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
  /** Calculates a box sale, unpacking the minimum cartons without mutating state. */
  deductBoxStock: (
    productId: string,
    requestedBoxes: number
  ) => StockUpdate | null
  deductStock: (
    productId: string,
    quantity: number,
    unit?: 'carton' | 'box'
  ) => StockUpdate | null
  /** Commits all shipment lines atomically, then mirrors the returned products. */
  addShipment: (lines: ShipmentLineInput[]) => Promise<void>
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
  cartonQuantity?: number | string
  boxQuantity?: number | string
  boxesPerCarton?: number | string
  cartonSellingPrice?: number | string
  boxSellingPrice?: number | string
  cartonPurchasePrice?: number | string
  boxPurchasePrice?: number | string
}

/**
 * Coerces numeric and optional fields so string inputs never leak into state
 * or SQL, and guarantees a stable `id` (kept when editing, generated when
 * creating).
 */
function coerceProduct(product: ProductCoerceInput): Product {
  const boxesPerCarton = Math.max(
    1,
    Number(product.boxesPerCarton ?? product.unitsPerCarton) || 12
  )
  const cartonQuantity = Math.max(0, Number(product.cartonQuantity) || 0)
  const boxQuantity = Math.max(
    0,
    product.boxQuantity === undefined
      ? Number(product.quantity) || 0
      : Number(product.boxQuantity) || 0
  )
  const boxSellingPrice =
    Number(product.boxSellingPrice ?? product.sellingPrice) || 0
  const boxPurchasePrice =
    Number(product.boxPurchasePrice ?? product.purchasePrice) || 0
  return {
    id: product.id ?? createProductId(),
    name: product.name ?? '',
    sku: product.sku?.trim() || createProductSku(),
    barcode: product.barcode?.trim() || undefined,
    quantity: getTotalBoxStock({ cartonQuantity, boxQuantity, boxesPerCarton }),
    minThreshold: Number(product.minThreshold) || 0,
    purchasePrice: boxPurchasePrice,
    sellingPrice: boxSellingPrice,
    category: product.category ?? '',
    // Every product has a unit: blank/legacy values fall back to "قطعة" so the
    // UI and SQLite never hold an "unspecified" unit.
    unit: normalizeProductUnit(product.unit) || DEFAULT_PRODUCT_UNIT,
    unitsPerCarton: resolveUnitsPerCarton({
      unit: product.unit,
      unitsPerCarton: boxesPerCarton,
    }),
    cartonQuantity,
    boxQuantity,
    boxesPerCarton,
    cartonSellingPrice:
      product.cartonSellingPrice === undefined
        ? boxSellingPrice * boxesPerCarton
        : Number(product.cartonSellingPrice) || 0,
    boxSellingPrice,
    cartonPurchasePrice:
      product.cartonPurchasePrice === undefined
        ? Number(product.purchasePrice) || 0
        : Number(product.cartonPurchasePrice) || 0,
    boxPurchasePrice,
  }
}

export const useInventoryStore = create<InventoryState>()(
  devtools(
    (set, get) => ({
      products: initialProducts,
      productBatches: [],

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
        const normalizedUpdates: Partial<NewProduct> = { ...updates }
        if (
          updates.quantity !== undefined &&
          updates.cartonQuantity === undefined &&
          updates.boxQuantity === undefined
        ) {
          normalizedUpdates.cartonQuantity = 0
          normalizedUpdates.boxQuantity = updates.quantity
        }
        if (
          updates.purchasePrice !== undefined &&
          updates.boxPurchasePrice === undefined
        ) {
          normalizedUpdates.boxPurchasePrice = updates.purchasePrice
        }
        if (
          updates.sellingPrice !== undefined &&
          updates.boxSellingPrice === undefined
        ) {
          normalizedUpdates.boxSellingPrice = updates.sellingPrice
          normalizedUpdates.cartonSellingPrice =
            updates.sellingPrice * base.boxesPerCarton
        }
        const merged = coerceProduct({ ...base, ...normalizedUpdates })
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
        if (!Number.isInteger(addedQuantity) || addedQuantity <= 0) return
        set(
          state => ({
            products: state.products.map(product =>
              product.id === productId
                ? {
                    ...product,
                    quantity: product.quantity + addedQuantity,
                    boxQuantity: product.boxQuantity + addedQuantity,
                    // Refresh purchase cost only when a new one is supplied.
                    ...(costPrice !== undefined
                      ? {
                          purchasePrice: costPrice,
                          boxPurchasePrice: costPrice,
                        }
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

      deductBoxStock: (productId, requestedBoxes) => {
        const product = get().products.find(item => item.id === productId)
        if (!product) return null
        const result = deductBoxStock(product, requestedBoxes)
        if (!result) return null
        return {
          productId,
          cartonQuantity: result.cartonQuantity,
          boxQuantity: result.boxQuantity,
          newQuantity: getTotalBoxStock({ ...product, ...result }),
        }
      },

      deductStock: (productId, quantity, unit = 'box') => {
        const product = get().products.find(item => item.id === productId)
        if (!product || !Number.isInteger(quantity) || quantity <= 0)
          return null
        let result: StockUpdate | null
        const deductedBoxes =
          unit === 'carton' ? quantity * product.boxesPerCarton : quantity
        if (unit === 'carton') {
          if (quantity > product.cartonQuantity) return null
          const cartonQuantity = product.cartonQuantity - quantity
          result = {
            productId,
            cartonQuantity,
            boxQuantity: product.boxQuantity,
            newQuantity:
              cartonQuantity * product.boxesPerCarton + product.boxQuantity,
          }
        } else {
          result = get().deductBoxStock(productId, quantity)
        }
        if (!result) return null
        const plan = planFefoDeductions(
          get().productBatches.filter(batch => batch.productId === productId),
          deductedBoxes
        )
        return { ...result, batchDeductions: plan.deductions }
      },

      addShipment: async lines => {
        if (lines.length === 0) return
        for (const line of lines) {
          if (
            !Number.isInteger(line.quantity) ||
            line.quantity <= 0 ||
            (line.unit !== 'carton' && line.unit !== 'box') ||
            (line.purchasePrice !== undefined &&
              (!Number.isFinite(line.purchasePrice) || line.purchasePrice < 0))
          ) {
            throw new Error('pos-stock: invalid shipment line')
          }
          if (!get().products.some(product => product.id === line.productId)) {
            throw new Error(`pos-stock: product not found (${line.productId})`)
          }
        }
        const userId = useAuthStore.getState().currentUser?.username ?? 'admin'
        if (isTauriRuntime()) {
          const updatedProducts = await addShipmentToInventory(lines, userId)
          const productBatches = await fetchExpiringProductBatches()
          set(
            { products: updatedProducts, productBatches },
            undefined,
            'inventory/addShipment'
          )
          return
        }

        set(
          state => ({
            productBatches: [
              ...state.productBatches,
              ...lines
                .filter(line => line.expiryDate)
                .map(line => {
                  const product = state.products.find(
                    entry => entry.id === line.productId
                  )
                  return {
                    id: crypto.randomUUID(),
                    productId: line.productId,
                    batchNumber: line.batchNumber,
                    quantity:
                      line.quantity *
                      (line.unit === 'carton'
                        ? (product?.boxesPerCarton ?? 1)
                        : 1),
                    purchasePrice: line.purchasePrice,
                    expiryDate: line.expiryDate,
                    createdAt: new Date().toISOString(),
                  }
                }),
            ],
            products: state.products.map(product => {
              const matchingLines = lines.filter(
                line => line.productId === product.id
              )
              if (matchingLines.length === 0) return product
              const cartonQuantity = matchingLines.reduce(
                (quantity, line) =>
                  quantity + (line.unit === 'carton' ? line.quantity : 0),
                product.cartonQuantity
              )
              const boxQuantity = matchingLines.reduce(
                (quantity, line) =>
                  quantity + (line.unit === 'box' ? line.quantity : 0),
                product.boxQuantity
              )
              const latestCostLine = [...matchingLines]
                .reverse()
                .find(line => line.purchasePrice !== undefined)
              const latestCartonCost = [...matchingLines]
                .reverse()
                .find(
                  line =>
                    line.unit === 'carton' && line.purchasePrice !== undefined
                )?.purchasePrice
              const latestBoxCost = [...matchingLines]
                .reverse()
                .find(
                  line =>
                    line.unit === 'box' && line.purchasePrice !== undefined
                )?.purchasePrice
              const legacyPurchasePrice = latestCostLine?.purchasePrice
              const boxPurchasePrice =
                latestBoxCost ??
                (latestCostLine?.unit === 'carton'
                  ? (legacyPurchasePrice ?? 0) / product.boxesPerCarton
                  : product.boxPurchasePrice)
              return {
                ...product,
                cartonQuantity,
                boxQuantity,
                quantity: getTotalBoxStock({
                  cartonQuantity,
                  boxQuantity,
                  boxesPerCarton: product.boxesPerCarton,
                }),
                ...(legacyPurchasePrice !== undefined
                  ? {
                      boxPurchasePrice,
                      purchasePrice: boxPurchasePrice,
                      cartonPurchasePrice:
                        latestCartonCost ?? product.cartonPurchasePrice,
                    }
                  : {}),
              }
            }),
          }),
          undefined,
          'inventory/addShipment'
        )
      },

      applyStockDeltas: updates => {
        if (updates.length === 0) return
        set(
          state => ({
            productBatches: state.productBatches.map(batch => {
              const update = updates.find(
                entry => entry.productId === batch.productId
              )
              const deduction = update?.batchDeductions?.find(
                entry => entry.batchId === batch.id
              )
              return deduction
                ? {
                    ...batch,
                    quantity: Math.max(0, batch.quantity - deduction.quantity),
                  }
                : batch
            }),
            products: state.products.map(product => {
              const update = updates.find(
                entry => entry.productId === product.id
              )
              return update
                ? {
                    ...product,
                    quantity: update.newQuantity,
                    ...(update.cartonQuantity !== undefined
                      ? { cartonQuantity: update.cartonQuantity }
                      : {}),
                    ...(update.boxQuantity !== undefined
                      ? { boxQuantity: update.boxQuantity }
                      : {}),
                  }
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
          const [stored, productBatches] = await Promise.all([
            fetchProducts(),
            fetchExpiringProductBatches(),
          ])
          set({ productBatches }, undefined, 'inventory/hydrateBatches')
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
