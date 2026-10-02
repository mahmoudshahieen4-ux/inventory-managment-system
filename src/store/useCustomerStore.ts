/**
 * Customer Debt & Credit state (إدارة مديونيات العملاء).
 *
 * Persists customer profiles and their immutable ledger to SQLite in the
 * desktop runtime; in the browser / unit tests everything is mirrored in
 * memory so the stores keep working unchanged (same policy as the other
 * stores, see docs/developer/state-management.md).
 *
 * Debt sign convention: `currentBalance > 0` means the customer owes the shop.
 * `SALE_CREDIT` / `MANUAL_ADJUSTMENT` increase it, `PAYMENT` decreases it — the
 * ledger is append-only and always carries the previous/new balance snapshot.
 */
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { toast } from 'sonner'

import i18n from '@/i18n/config'
import { roundMoney } from '@/lib/money'
import {
  applyCustomerLedgerEntry,
  deleteCustomerRow,
  fetchCustomerLedger,
  fetchCustomers,
  initializeDatabase,
  isTauriRuntime,
  persistCustomer,
} from '@/services/db'
import type {
  Customer,
  CustomerInput,
  CustomerLedgerEntry,
  CustomerLedgerInput,
  CustomerLedgerType,
} from '@/types/customer'

/** In-memory seed used by the browser dev server / unit tests. */
export const initialCustomers: Customer[] = [
  {
    id: 'customer-001',
    name: 'أحمد المصري',
    phone: '0100 000 0001',
    address: 'القاهرة',
    currentBalance: 350,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'customer-002',
    name: 'محمود السيد',
    phone: '0100 000 0002',
    address: 'الجيزة',
    currentBalance: 0,
    createdAt: new Date().toISOString(),
  },
]

export interface CustomerState {
  customers: Customer[]
  /** Ledger history cache keyed by customer id (chronological, oldest first). */
  ledgerByCustomer: Record<string, CustomerLedgerEntry[]>
  /** True while the initial SQLite load runs. */
  isHydrating: boolean

  /** Creates a customer profile (id + createdAt generated). */
  addCustomer: (input: CustomerInput) => Customer
  /** Updates a customer's editable profile fields (never the balance). */
  updateCustomer: (id: string, updates: Partial<CustomerInput>) => void
  /** Removes a customer together with their ledger history. */
  deleteCustomer: (id: string) => void
  /**
   * Records a credit sale (بيع بالآجل): increases the customer's debt by
   * `debtAmount` and appends a `SALE_CREDIT` audit row. The balance update and
   * the ledger insert are ONE transaction. Returns the applied entry, or null
   * when the customer is unknown or the amount is not positive.
   */
  addCreditSale: (
    customerId: string,
    saleId: string,
    debtAmount: number,
    notes?: string
  ) => Promise<CustomerLedgerEntry | null>
  /**
   * Records a debt payment (سداد دُفعة): decreases the customer's debt by
   * `amount` and appends a `PAYMENT` audit row. Balance + ledger commit in ONE
   * transaction. Returns the applied entry, or null on invalid input.
   */
  recordDebtPayment: (
    customerId: string,
    amount: number,
    paymentMethod?: string,
    notes?: string
  ) => Promise<CustomerLedgerEntry | null>
  /** Fetches a customer's ledger chronologically and refreshes the cache. */
  getCustomerLedger: (customerId: string) => Promise<CustomerLedgerEntry[]>
  /** Synchronous read of the cached ledger (chronological). */
  selectLedger: (customerId: string) => CustomerLedgerEntry[]
  getCustomerById: (id: string) => Customer | undefined
  /** Sum of every customer's outstanding debt (إجمالي المديونية الحالية). */
  selectTotalOutstanding: () => number
  /** Loads stored customers from SQLite into the store. */
  hydrate: () => Promise<void>
}

/** Applies a movement to the in-memory customer + ledger cache. */
function commitEntry(
  state: CustomerState,
  entry: CustomerLedgerEntry
): Pick<CustomerState, 'customers' | 'ledgerByCustomer'> {
  const existing = (state.ledgerByCustomer[entry.customerId] ?? []).filter(
    item => item.id !== entry.id
  )
  return {
    customers: state.customers.map(customer =>
      customer.id === entry.customerId
        ? { ...customer, currentBalance: entry.newBalance }
        : customer
    ),
    ledgerByCustomer: {
      ...state.ledgerByCustomer,
      [entry.customerId]: [...existing, entry],
    },
  }
}

/** Fire-and-forget persistence helper: local state first, toast on DB failure. */
function persist(action: () => Promise<void>): void {
  if (!isTauriRuntime()) return
  action().catch(error => {
    toast.error(`${i18n.t('db.toast.saveFailed')}: ${String(error)}`)
  })
}

export const useCustomerStore = create<CustomerState>()(
  devtools(
    (set, get) => {
      /**
       * Shared mover for both credit sales and payments: validates input,
       * applies the movement atomically (desktop) or in memory (browser), then
       * mirrors the applied entry into the store.
       */
      const applyMovement = async (
        customerId: string,
        type: CustomerLedgerType,
        rawAmount: number,
        referenceId: string | null,
        notes?: string
      ): Promise<CustomerLedgerEntry | null> => {
        const customer = get().customers.find(item => item.id === customerId)
        if (!customer) {
          toast.error(i18n.t('customers.errors.notFound'))
          return null
        }
        const amount = roundMoney(Math.abs(rawAmount))
        if (!Number.isFinite(amount) || amount <= 0) return null

        const input: CustomerLedgerInput = {
          id: crypto.randomUUID(),
          customerId,
          type,
          amount,
          referenceId,
          notes: notes?.trim() ?? '',
          createdAt: new Date().toISOString(),
        }

        // Desktop: the DB is authoritative — balance + ledger in ONE
        // transaction — and returns the applied entry with its real balances.
        if (isTauriRuntime()) {
          try {
            const applied = await applyCustomerLedgerEntry(input)
            set(
              state => commitEntry(state, applied),
              undefined,
              `customers/${type}`
            )
            return applied
          } catch (error) {
            toast.error(`${i18n.t('db.toast.saveFailed')}: ${String(error)}`)
            return null
          }
        }

        // Browser / tests: mirror the exact same math in memory.
        const previous = roundMoney(customer.currentBalance)
        const delta = type === 'PAYMENT' ? -amount : amount
        const entry: CustomerLedgerEntry = {
          ...input,
          previousBalance: previous,
          newBalance: roundMoney(previous + delta),
        }
        set(state => commitEntry(state, entry), undefined, `customers/${type}`)
        return entry
      }

      return {
        customers: initialCustomers,
        ledgerByCustomer: {},
        isHydrating: false,

        addCustomer: input => {
          const name = input.name?.trim() ?? ''
          if (!name) {
            toast.error(i18n.t('customers.errors.nameRequired'))
            // Return a throwaway object so callers keep a Customer shape;
            // it is NOT inserted into state when the name is empty.
            return {
              id: crypto.randomUUID(),
              name: '',
              phone: '',
              address: '',
              currentBalance: 0,
              createdAt: new Date().toISOString(),
            }
          }
          const customer: Customer = {
            id: crypto.randomUUID(),
            name,
            phone: input.phone?.trim() ?? '',
            address: input.address?.trim() ?? '',
            currentBalance: 0,
            createdAt: new Date().toISOString(),
          }
          set(
            state => ({ customers: [...state.customers, customer] }),
            undefined,
            'customers/addCustomer'
          )
          persist(() => persistCustomer(customer))
          return customer
        },

        updateCustomer: (id, updates) => {
          const current = get().customers.find(item => item.id === id)
          if (!current) return
          const customer: Customer = {
            ...current,
            name: updates.name?.trim() || current.name,
            phone: updates.phone?.trim() ?? current.phone,
            address: updates.address?.trim() ?? current.address,
          }
          set(
            state => ({
              customers: state.customers.map(item =>
                item.id === id ? customer : item
              ),
            }),
            undefined,
            'customers/updateCustomer'
          )
          persist(() => persistCustomer(customer))
        },

        deleteCustomer: id => {
          set(
            state => ({
              customers: state.customers.filter(item => item.id !== id),
              ledgerByCustomer: Object.fromEntries(
                Object.entries(state.ledgerByCustomer).filter(
                  ([key]) => key !== id
                )
              ),
            }),
            undefined,
            'customers/deleteCustomer'
          )
          persist(() => deleteCustomerRow(id))
        },

        addCreditSale: (customerId, saleId, debtAmount, notes) =>
          applyMovement(customerId, 'SALE_CREDIT', debtAmount, saleId, notes),

        recordDebtPayment: (customerId, amount, paymentMethod, notes) =>
          applyMovement(
            customerId,
            'PAYMENT',
            amount,
            null,
            paymentMethod ? `[${paymentMethod}] ${notes ?? ''}`.trim() : notes
          ),

        getCustomerLedger: async customerId => {
          if (isTauriRuntime()) {
            try {
              const entries = await fetchCustomerLedger(customerId)
              set(
                state => ({
                  ledgerByCustomer: {
                    ...state.ledgerByCustomer,
                    [customerId]: entries,
                  },
                }),
                undefined,
                'customers/getCustomerLedger'
              )
              return entries
            } catch (error) {
              toast.error(`${i18n.t('db.toast.loadFailed')}: ${String(error)}`)
              throw error
            }
          }
          return get().selectLedger(customerId)
        },

        selectLedger: customerId =>
          [...(get().ledgerByCustomer[customerId] ?? [])].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt)
          ),

        getCustomerById: id => get().customers.find(item => item.id === id),

        selectTotalOutstanding: () =>
          roundMoney(
            get().customers.reduce(
              (sum, item) => sum + (Number(item.currentBalance) || 0),
              0
            )
          ),

        hydrate: async () => {
          if (!isTauriRuntime()) return
          set({ isHydrating: true }, undefined, 'customers/hydrateStart')
          try {
            await initializeDatabase()
            const stored = await fetchCustomers()
            if (stored.length > 0) {
              set({ customers: stored }, undefined, 'customers/hydrate')
            } else {
              // First launch: persist the seed customers so they survive restarts.
              for (const customer of get().customers) {
                await persistCustomer(customer)
              }
            }
          } catch (error) {
            toast.error(`${i18n.t('db.toast.loadFailed')}: ${String(error)}`)
            throw error
          } finally {
            set({ isHydrating: false }, undefined, 'customers/hydrateEnd')
          }
        },
      }
    },
    { name: 'customer-store' }
  )
)
