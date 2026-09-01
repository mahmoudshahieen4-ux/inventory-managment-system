import { describe, expect, it } from 'vitest'

import {
  deleteProductRow,
  fetchProducts,
  fetchSales,
  insertProduct,
  isTauriRuntime,
  persistSale,
  updateProductRow,
} from './db'

describe('db service', () => {
  it('reports the current runtime (false in unit tests / browser)', () => {
    // jsdom has no __TAURI_INTERNALS__, so the desktop runtime is not detected.
    expect(isTauriRuntime()).toBe(false)
  })

  it('rejects database operations outside the Tauri runtime', async () => {
    // The plugin has no Tauri IPC bridge in jsdom, so every call must fail
    // loudly instead of silently succeeding — stores catch and toast these.
    const product = {
      id: 'x',
      name: 'Test',
      sku: 'TST-001',
      quantity: 1,
      minThreshold: 1,
      purchasePrice: 1,
      sellingPrice: 2,
      category: 'Test',
    }
    await expect(fetchProducts()).rejects.toThrow()
    await expect(fetchSales()).rejects.toThrow()
    await expect(insertProduct(product)).rejects.toThrow()
    await expect(updateProductRow(product)).rejects.toThrow()
    await expect(deleteProductRow('x')).rejects.toThrow()
    await expect(persistSale({ id: 'x' } as never)).rejects.toThrow()
  })
})
