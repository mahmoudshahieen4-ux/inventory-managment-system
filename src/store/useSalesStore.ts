import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { toast } from 'sonner'

import i18n from '@/i18n/config'
import { roundMoney } from '@/lib/money'
import {
  fetchCreditNotes,
  fetchSales,
  initializeDatabase,
  isTauriRuntime,
  persistCreditNote,
  persistSaleAtomic,
} from '@/services/db'
import type { StockUpdate } from '@/services/db'
import type { CreditNote, ReturnItem, Sale } from '@/types/sales'

export interface SalesState {
  /** Completed sales, newest first. */
  sales: Sale[]
  /**
   * Atomic checkout: records the sale and applies the inventory stock
   * decrements inside one SQLite transaction. The in-memory sales list is
   * updated immediately; stock deltas are applied by the caller via
   * `useInventoryStore.applyStockDeltas` (already persisted atomically).
   */
  addSaleAtomic: (
    sale: Omit<Sale, 'id' | 'createdAt' | 'invoiceNumber'>,
    stockUpdates: StockUpdate[]
  ) => Sale
  /** Retrieves a stored invoice by id, for re-printing from sales history. */
  getSaleById: (id: string) => Sale | undefined
  /** Loads stored invoices from SQLite into the store. */
  hydrate: () => Promise<void>
  creditNotes: CreditNote[]
  createCreditNote: (
    sale: Sale,
    items: ReturnItem[],
    cashierId: string
  ) => CreditNote
  returnedQuantity: (saleId: string, productId: string) => number
}

export const useSalesStore = create<SalesState>()(
  devtools(
    (set, get) => ({
      sales: [],
      creditNotes: [],

      getSaleById: id => get().sales.find(sale => sale.id === id),

      addSaleAtomic: (sale, stockUpdates) => {
        const record: Sale = {
          ...sale,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          invoiceNumber: `INV-${String(get().sales.length + 1).padStart(4, '0')}`,
        }
        set(
          state => ({ sales: [record, ...state.sales] }),
          undefined,
          'sales/addSaleAtomic'
        )
        // Invoice + item lines + stock decrement commit in ONE transaction.
        if (isTauriRuntime()) {
          persistSaleAtomic(record, stockUpdates).catch(error => {
            toast.error(`${i18n.t('db.toast.saveFailed')}: ${String(error)}`)
          })
        }
        return record
      },

      returnedQuantity: (saleId, productId) =>
        get()
          .creditNotes.filter(note => note.originalSaleId === saleId)
          .flatMap(note => note.items)
          .filter(item => item.productId === productId)
          .reduce((total, item) => total + item.quantity, 0),

      createCreditNote: (sale, items, cashierId) => {
        const record: CreditNote = {
          id: crypto.randomUUID(),
          creditNoteNumber: `CN-${new Date().getFullYear()}-${String(get().creditNotes.length + 1).padStart(4, '0')}`,
          originalInvoiceNumber: sale.invoiceNumber,
          originalSaleId: sale.id,
          items,
          total: roundMoney(
            items.reduce((sum, item) => sum + item.lineTotal, 0)
          ),
          cashierId,
          createdAt: new Date().toISOString(),
        }
        set(
          state => ({ creditNotes: [record, ...state.creditNotes] }),
          undefined,
          'sales/createCreditNote'
        )
        if (isTauriRuntime()) {
          persistCreditNote(record).catch(error => {
            toast.error(`${i18n.t('db.toast.saveFailed')}: ${String(error)}`)
          })
        }
        return record
      },

      hydrate: async () => {
        if (!isTauriRuntime()) return
        try {
          await initializeDatabase()
          const stored = await fetchSales()
          const storedCreditNotes = await fetchCreditNotes()
          set(
            { creditNotes: storedCreditNotes },
            undefined,
            'sales/hydrateCreditNotes'
          )
          if (stored.length > 0) {
            set({ sales: stored }, undefined, 'sales/hydrate')
          }
        } catch (error) {
          toast.error(`${i18n.t('db.toast.loadFailed')}: ${String(error)}`)
          throw error
        }
      },
    }),
    { name: 'sales-store' }
  )
)
