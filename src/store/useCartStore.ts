import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import { roundMoney } from '@/lib/money'
import { useInventoryStore } from '@/store/useInventoryStore'
import type { Product } from '@/types/inventory'
import type { CartItem } from '@/types/sales'

/** Sales tax rate applied to every checkout. Set to 0.05 for 5%, or 0 to disable tax. */
export const TAX_RATE = 0.05

/** Canonical two-decimal rounding lives in `lib/money.ts`; re-exported for the cart selectors. */
export { roundMoney }

export interface CartState {
  items: CartItem[]
  addToCart: (product: Product) => void
  removeFromCart: (productId: string) => void
  /** Sets a new quantity, clamped to >= 0; a quantity of 0 removes the line. */
  updateQuantity: (productId: string, newQty: number) => void
  clearCart: () => void
}

/** localStorage key holding the unsaved cart between launches. */
const CART_STORAGE_KEY = 'pos.cart.v1'

/**
 * Restores the unsaved cart after a restart/update. Corrupt or malformed
 * payloads are discarded (fail-open to an empty cart) instead of crashing.
 */
function readStoredCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is CartItem =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.productId === 'string' &&
        typeof item.name === 'string' &&
        typeof item.unitPrice === 'number' &&
        typeof item.quantity === 'number' &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0
    )
  } catch {
    return []
  }
}

/** Best-effort write of the current cart; storage failures never break the POS. */
function persistCart(items: CartItem[]): void {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Storage unavailable (e.g. private mode) — the cart simply won't persist.
  }
}

export const useCartStore = create<CartState>()(
  devtools(
    set => ({
      items: readStoredCart(),

      addToCart: product =>
        set(
          state => {
            const existing = state.items.find(
              item => item.productId === product.id
            )
            const currentQty = existing?.quantity ?? 0
            // Never exceed the available stock. No-op when at the ceiling or out of stock.
            const nextQty = Math.min(currentQty + 1, product.quantity)
            if (nextQty <= currentQty) return state

            if (existing) {
              return {
                items: state.items.map(item =>
                  item.productId === product.id
                    ? { ...item, quantity: nextQty }
                    : item
                ),
              }
            }

            return {
              items: [
                ...state.items,
                {
                  productId: product.id,
                  sku: product.sku,
                  name: product.name,
                  purchasePrice: product.purchasePrice,
                  unitPrice: product.sellingPrice,
                  quantity: nextQty,
                },
              ],
            }
          },
          undefined,
          'cart/addToCart'
        ),

      removeFromCart: productId =>
        set(
          state => ({
            items: state.items.filter(item => item.productId !== productId),
          }),
          undefined,
          'cart/removeFromCart'
        ),

      updateQuantity: (productId, newQty) =>
        set(
          state => {
            const item = state.items.find(
              entry => entry.productId === productId
            )
            if (!item) return state

            // Enforce stock ceiling from the inventory store so manual
            // quantity inputs can never oversell beyond available stock.
            const stock =
              useInventoryStore
                .getState()
                .products.find(p => p.id === productId)?.quantity ?? Infinity

            const clamped = Math.min(Math.max(0, newQty), stock)
            if (clamped === 0) {
              return {
                items: state.items.filter(
                  entry => entry.productId !== productId
                ),
              }
            }

            return {
              items: state.items.map(entry =>
                entry.productId === productId
                  ? { ...entry, quantity: clamped }
                  : entry
              ),
            }
          },
          undefined,
          'cart/updateQuantity'
        ),

      clearCart: () => set({ items: [] }, undefined, 'cart/clearCart'),
    }),
    { name: 'cart-store' }
  )
)

/**
 * Offline-first cart recovery: every cart mutation is mirrored to localStorage
 * (one subscription covers all actions), so a crash, forced update or restart
 * never drops an unsaved sale. Cleared carts persist as an empty cart too.
 */
useCartStore.subscribe(state => {
  persistCart(state.items)
})

/** Subtotal, equal to the sum of unit price x quantity. */
export const selectCartSubtotal = (state: CartState): number =>
  roundMoney(
    state.items.reduce(
      (total, item) => total + item.unitPrice * item.quantity,
      0
    )
  )

/** Tax computed from the subtotal at TAX_RATE. */
export const selectCartTax = (state: CartState): number =>
  roundMoney(selectCartSubtotal(state) * TAX_RATE)

/** Grand total including tax. */
export const selectCartTotal = (state: CartState): number =>
  roundMoney(selectCartSubtotal(state) + selectCartTax(state))
