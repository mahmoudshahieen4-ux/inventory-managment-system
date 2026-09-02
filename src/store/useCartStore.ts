import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { Product } from '@/types/inventory'
import type { CartItem } from '@/types/sales'

/** Sales tax rate applied to every checkout. Set to 0.05 for 5%, or 0 to disable tax. */
export const TAX_RATE = 0.05

/** Round to two decimal places to avoid floating-point drift. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export interface CartState {
  items: CartItem[]
  addToCart: (product: Product) => void
  removeFromCart: (productId: string) => void
  /** Sets a new quantity, clamped to >= 0; a quantity of 0 removes the line. */
  updateQuantity: (productId: string, newQty: number) => void
  clearCart: () => void
}

export const useCartStore = create<CartState>()(
  devtools(
    set => ({
      items: [],

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

            const clamped = Math.max(0, newQty)
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
