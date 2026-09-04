import { describe, expect, it } from 'vitest'

import {
  deleteProductRow,
  deleteWorkerRow,
  fetchProducts,
  fetchSalaryPayments,
  fetchSales,
  fetchWorkersData,
  insertProduct,
  isTauriRuntime,
  persistAdvance,
  persistAttendance,
  persistOperatingExpense,
  persistSale,
  persistSalaryPayment,
  persistWorker,
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

    // Workers Payroll & Attendance functions fail the same way outside Tauri.
    await expect(fetchWorkersData()).rejects.toThrow()
    await expect(persistWorker({ id: 'x' } as never)).rejects.toThrow()
    await expect(persistAttendance({ id: 'x' } as never)).rejects.toThrow()
    await expect(persistAdvance({ id: 'x' } as never)).rejects.toThrow()
    await expect(deleteWorkerRow('x')).rejects.toThrow()

    // Salary disbursement & operating-expense functions behave the same.
    await expect(fetchSalaryPayments()).rejects.toThrow()
    await expect(persistSalaryPayment({ id: 'x' } as never)).rejects.toThrow()
    await expect(
      persistOperatingExpense({ id: 'x' } as never)
    ).rejects.toThrow()
  })
})
