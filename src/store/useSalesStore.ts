import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { toast } from 'sonner'

import i18n from '@/i18n/config'
import { roundMoney } from '@/lib/money'
import {
  fetchCreditNotes,
  fetchSales,
  getNextCreditNoteSequence,
  getNextInvoiceSequence,
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
  /** True while a checkout is being committed — blocks double submission. */
  isSubmitting: boolean
  /** Next invoice sequence number — seeded from DB MAX on hydrate to avoid collisions. */
  _nextInvoiceSeq: number
  /** Next credit-note sequence number — seeded from DB MAX on hydrate. */
  _nextCreditNoteSeq: number
  /**
   * Atomic checkout: records the sale and applies the inventory stock
   * decrements inside one SQLite transaction. Persistence is awaited and the
   * sale is only added to the in-memory list after the commit succeeds, so a
   * failed write leaves no phantom invoice; stock deltas are applied by the
   * caller via `useInventoryStore.applyStockDeltas`. Returns `null` when the
   * write failed (the error toast is raised here) or when another checkout is
   * already in flight.
   */
  submitSale: (
    sale: Omit<Sale, 'id' | 'createdAt' | 'invoiceNumber'>,
    stockUpdates: StockUpdate[]
  ) => Promise<Sale | null>
  /** Retrieves a stored invoice by id, for re-printing from sales history. */
  getSaleById: (id: string) => Sale | undefined
  /** Loads stored invoices from SQLite into the store. */
  hydrate: () => Promise<void>
  creditNotes: CreditNote[]
  createCreditNote: (
    sale: Sale,
    items: ReturnItem[],
    cashierId: string,
    stockUpdates?: StockUpdate[]
  ) => CreditNote
  returnedQuantity: (saleId: string, productId: string) => number
}

export const useSalesStore = create<SalesState>()(
  devtools(
    (set, get) => ({
      sales: [],
      creditNotes: [],
      isSubmitting: false,
      _nextInvoiceSeq: 1,
      _nextCreditNoteSeq: 1,

      getSaleById: id => get().sales.find(sale => sale.id === id),

      submitSale: async (sale, stockUpdates) => {
        // Double-click / repeated F2 guard: one checkout at a time.
        if (get().isSubmitting) return null

        // Use the DB-seeded sequence counter — safe after pruning/cleanup.
        const seq = get()._nextInvoiceSeq
        const record: Sale = {
          ...sale,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          invoiceNumber: `INV-${String(seq).padStart(4, '0')}`,
        }

        set({ isSubmitting: true }, undefined, 'sales/submitStart')
        try {
          // Invoice + item lines + stock decrement commit in ONE transaction.
          if (isTauriRuntime()) {
            await persistSaleAtomic(record, stockUpdates)
          }
          // Only after a successful commit: publish the invoice and advance
          // the sequence, so a failed write can never show a phantom sale.
          set(
            state => ({
              sales: [record, ...state.sales],
              _nextInvoiceSeq: state._nextInvoiceSeq + 1,
            }),
            undefined,
            'sales/submitSale'
          )
          return record
        } catch (error) {
          // Gentle failure: the cart is kept intact so the cashier can retry.
          toast.error(`${i18n.t('db.toast.saveFailed')}: ${String(error)}`)
          return null
        } finally {
          set({ isSubmitting: false }, undefined, 'sales/submitEnd')
        }
      },

      returnedQuantity: (saleId, productId) =>
        get()
          .creditNotes.filter(note => note.originalSaleId === saleId)
          .flatMap(note => note.items)
          .filter(item => item.productId === productId)
          .reduce((total, item) => total + item.quantity, 0),

      createCreditNote: (sale, items, cashierId, stockUpdates = []) => {
        const seq = get()._nextCreditNoteSeq
        const record: CreditNote = {
          id: crypto.randomUUID(),
          creditNoteNumber: `CN-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`,
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
          state => ({
            creditNotes: [record, ...state.creditNotes],
            _nextCreditNoteSeq: state._nextCreditNoteSeq + 1,
          }),
          undefined,
          'sales/createCreditNote'
        )
        if (isTauriRuntime()) {
          // Credit note + items + stock restock commit in ONE transaction;
          // a failure here cannot leave inventory out of sync with the note.
          persistCreditNote(record, stockUpdates).catch(error => {
            toast.error(`${i18n.t('db.toast.saveFailed')}: ${String(error)}`)
          })
        }
        return record
      },

      hydrate: async () => {
        if (!isTauriRuntime()) return
        try {
          await initializeDatabase()
          const [stored, storedCreditNotes, nextInvoiceSeq, nextCreditNoteSeq] =
            await Promise.all([
              fetchSales(),
              fetchCreditNotes(),
              getNextInvoiceSequence(),
              getNextCreditNoteSequence(),
            ])
          set(
            {
              creditNotes: storedCreditNotes,
              _nextInvoiceSeq: nextInvoiceSeq,
              _nextCreditNoteSeq: nextCreditNoteSeq,
            },
            undefined,
            'sales/hydrateMeta'
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
