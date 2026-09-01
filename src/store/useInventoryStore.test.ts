import { describe, it, expect, beforeEach } from 'vitest'
import { initialProducts, useInventoryStore } from './useInventoryStore'
import { getStockStatus } from '@/lib/stock-status'
import type { NewProduct } from '@/types/inventory'

const sampleProduct: NewProduct = {
  name: 'Paper Towels',
  sku: 'HOM-006',
  quantity: 30,
  minThreshold: 10,
  purchasePrice: 3.0,
  sellingPrice: 6.99,
  category: 'Home',
}

describe('InventoryStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useInventoryStore.setState({ products: [...initialProducts] })
  })

  it('is seeded with products covering every stock status', () => {
    const { products } = useInventoryStore.getState()
    expect(products.length).toBeGreaterThan(0)

    const statuses = products.map(product =>
      getStockStatus(product.quantity, product.minThreshold)
    )
    expect(statuses).toContain('OUT_OF_STOCK')
    expect(statuses).toContain('LOW_STOCK')
    expect(statuses).toContain('IN_STOCK')
  })

  it('adds a new product and generates a unique id', () => {
    const created = useInventoryStore.getState().addProduct(sampleProduct)
    const { products } = useInventoryStore.getState()

    expect(products).toHaveLength(initialProducts.length + 1)
    expect(created.id).toBeTruthy()
    expect(products.at(-1)).toMatchObject(sampleProduct)
    expect(products.at(-1)?.id).toBe(created.id)
  })

  it('edits an existing product without replacing untouched fields', () => {
    const first = useInventoryStore.getState().products[0]
    if (!first) throw new Error('Expected seeded products')

    useInventoryStore
      .getState()
      .updateProduct(first.id, { sellingPrice: 19.99, quantity: 2 })

    const updated = useInventoryStore
      .getState()
      .products.find(product => product.id === first.id)

    expect(updated).toMatchObject({
      id: first.id,
      sellingPrice: 19.99,
      quantity: 2,
      sku: first.sku,
    })
  })

  it('leaves other products untouched when editing one', () => {
    const before = useInventoryStore.getState().products
    const first = before[0]
    if (!first) throw new Error('Expected seeded products')

    useInventoryStore.getState().updateProduct(first.id, { name: 'Changed' })
    const after = useInventoryStore.getState().products

    expect(after[0]).toMatchObject({ ...first, name: 'Changed' })
    expect(after.slice(1)).toEqual(before.slice(1))
  })

  it('deletes a product by id', () => {
    const first = useInventoryStore.getState().products[0]
    if (!first) throw new Error('Expected seeded products')

    useInventoryStore.getState().deleteProduct(first.id)

    const { products } = useInventoryStore.getState()
    expect(products).toHaveLength(initialProducts.length - 1)
    expect(products.find(product => product.id === first.id)).toBeUndefined()
  })
})
