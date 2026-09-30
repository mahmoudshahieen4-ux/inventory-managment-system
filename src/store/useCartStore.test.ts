import { beforeEach, describe, expect, it } from 'vitest'

import type { Product } from '@/types/inventory'
import { useInventoryStore } from '@/store/useInventoryStore'
import {
  roundMoney,
  selectCartSubtotal,
  selectCartTax,
  selectCartTotal,
  TAX_RATE,
  useCartStore,
} from './useCartStore'

const product: Product = {
  id: 'prod-1',
  name: 'Dark Chocolate Bar',
  sku: 'SNK-004',
  quantity: 3,
  minThreshold: 5,
  purchasePrice: 0.8,
  sellingPrice: 2.49,
  category: 'Snacks',
  cartonQuantity: 0,
  boxQuantity: 3,
  boxesPerCarton: 12,
  cartonSellingPrice: 29.88,
  boxSellingPrice: 2.49,
  cartonPurchasePrice: 9.6,
  boxPurchasePrice: 0.8,
}

const outOfStockProduct: Product = {
  ...product,
  id: 'prod-2',
  sku: 'COF-001',
  quantity: 0,
  boxQuantity: 0,
}

describe('useCartStore', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] })
    useInventoryStore.setState({ products: [product] })
  })

  it('adds a product as a new cart line', () => {
    useCartStore.getState().addToCart(product)

    expect(useCartStore.getState().items).toEqual([
      {
        productId: 'prod-1',
        sku: 'SNK-004',
        name: 'Dark Chocolate Bar',
        purchasePrice: 0.8,
        unitPrice: 2.49,
        quantity: 1,
        unit: 'box',
      },
    ])
  })

  it('increments the quantity when the product is already in the cart', () => {
    const { addToCart } = useCartStore.getState()
    addToCart(product)
    addToCart(product)

    expect(useCartStore.getState().items.at(0)?.quantity).toBe(2)
  })

  it('never adds more than the available stock', () => {
    const { addToCart } = useCartStore.getState()
    for (let i = 0; i < 5; i++) addToCart(product)

    expect(useCartStore.getState().items.at(0)?.quantity).toBe(3)
  })

  it('defaults to boxes and changes price when switched to cartons', () => {
    const stockedProduct = {
      ...product,
      cartonQuantity: 2,
      cartonSellingPrice: 25,
      cartonPurchasePrice: 10,
    }
    useInventoryStore.setState({ products: [stockedProduct] })
    useCartStore.getState().addToCart(stockedProduct)
    expect(useCartStore.getState().items[0]?.unit).toBe('box')

    useCartStore.getState().setSaleUnit(product.id, 'carton')

    expect(useCartStore.getState().items[0]).toMatchObject({
      unit: 'carton',
      unitPrice: 25,
      purchasePrice: 10,
    })
  })

  it('ignores out-of-stock products', () => {
    useCartStore.getState().addToCart(outOfStockProduct)

    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('removes a line with removeFromCart', () => {
    useCartStore.getState().addToCart(product)
    useCartStore.getState().removeFromCart('prod-1')

    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('updateQuantity clamps to >= 0 and removes the line at 0', () => {
    useCartStore.getState().addToCart(product)

    useCartStore.getState().updateQuantity('prod-1', 2)
    expect(useCartStore.getState().items.at(0)?.quantity).toBe(2)

    // Negative quantities clamp to 0, which removes the line
    useCartStore.getState().updateQuantity('prod-1', -5)
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('updateQuantity ignores unknown products', () => {
    useCartStore.getState().updateQuantity('missing', 2)

    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('clearCart empties the cart', () => {
    useCartStore.getState().addToCart(product)
    useCartStore.getState().clearCart()

    expect(useCartStore.getState().items).toHaveLength(0)
  })

  describe('selectors', () => {
    it('computes subtotal, tax and total with rounded money math', () => {
      useCartStore.setState({
        items: [
          {
            productId: 'prod-1',
            sku: 'SNK-004',
            name: 'Dark Chocolate Bar',
            unitPrice: 2.49,
            quantity: 2,
          },
        ],
      })
      const state = useCartStore.getState()
      const expectedTax = roundMoney(4.98 * TAX_RATE)

      expect(selectCartSubtotal(state)).toBe(4.98)
      expect(selectCartTax(state)).toBe(expectedTax)
      expect(selectCartTotal(state)).toBe(roundMoney(4.98 + expectedTax))
    })

    it('returns zero for an empty cart', () => {
      const state = useCartStore.getState()

      expect(selectCartSubtotal(state)).toBe(0)
      expect(selectCartTax(state)).toBe(0)
      expect(selectCartTotal(state)).toBe(0)
    })
  })
})
