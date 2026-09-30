import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { toast } from 'sonner'

import i18n from '@/i18n/config'
import {
  deleteHeldInvoiceRow,
  fetchHeldInvoices,
  insertHeldInvoice,
  isTauriRuntime,
} from '@/services/db'
import {
  selectCartSubtotal,
  selectCartTotal,
  useCartStore,
} from '@/store/useCartStore'
import { useAuthStore } from '@/store/useAuthStore'
import type { CartItem } from '@/types/sales'

export interface HeldInvoice {
  id: string
  customerName?: string
  notes?: string
  items: CartItem[]
  subtotal: number
  totalAmount: number
  createdAt: string
  cashierId?: string
}

interface HeldInvoicesState {
  heldInvoices: HeldInvoice[]
  activeHeldInvoiceId: string | null
  holdCurrentCart: (customerName?: string, notes?: string) => Promise<boolean>
  resumeHeldInvoice: (heldInvoiceId: string) => Promise<boolean>
  deleteHeldInvoice: (heldInvoiceId: string) => Promise<void>
  completeHeldInvoice: (heldInvoiceId?: string) => void
  clearActiveHeldInvoice: () => void
  hydrateHeldInvoices: () => Promise<void>
}

const ACTIVE_HELD_ID_KEY = 'pos.active-held-invoice.v1'

function readActiveHeldId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_HELD_ID_KEY)
  } catch {
    return null
  }
}

function persistActiveHeldId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_HELD_ID_KEY, id)
    else localStorage.removeItem(ACTIVE_HELD_ID_KEY)
  } catch {
    // The active cart itself is persisted independently by useCartStore.
  }
}

export const useHeldInvoicesStore = create<HeldInvoicesState>()(
  devtools(
    (set, get) => ({
      heldInvoices: [],
      activeHeldInvoiceId: readActiveHeldId(),

      holdCurrentCart: async (customerName, notes) => {
        const cart = useCartStore.getState()
        if (cart.items.length === 0) return false
        const invoice: HeldInvoice = {
          id: crypto.randomUUID(),
          customerName: customerName?.trim() || undefined,
          notes: notes?.trim() || undefined,
          items: cart.items.map(item => ({ ...item })),
          subtotal: selectCartSubtotal(cart),
          totalAmount: selectCartTotal(cart),
          createdAt: new Date().toISOString(),
          cashierId: useAuthStore.getState().currentUser?.username,
        }

        try {
          if (isTauriRuntime()) await insertHeldInvoice(invoice)
          set(
            state => ({ heldInvoices: [invoice, ...state.heldInvoices] }),
            undefined,
            'heldInvoices/holdCurrentCart'
          )
          persistActiveHeldId(null)
          set({ activeHeldInvoiceId: null })
          cart.clearCart()
          return true
        } catch (error) {
          toast.error(`${i18n.t('db.toast.saveFailed')}: ${String(error)}`)
          return false
        }
      },

      resumeHeldInvoice: async heldInvoiceId => {
        if (useCartStore.getState().items.length > 0) return false
        const invoice = get().heldInvoices.find(
          item => item.id === heldInvoiceId
        )
        if (!invoice) return false
        try {
          if (isTauriRuntime()) await deleteHeldInvoiceRow(heldInvoiceId)
          useCartStore.setState(
            { items: invoice.items },
            false,
            'cart/resumeHeldInvoice'
          )
          set(
            state => ({
              heldInvoices: state.heldInvoices.filter(
                item => item.id !== heldInvoiceId
              ),
              activeHeldInvoiceId: heldInvoiceId,
            }),
            undefined,
            'heldInvoices/resumeHeldInvoice'
          )
          persistActiveHeldId(heldInvoiceId)
          return true
        } catch (error) {
          toast.error(`${i18n.t('db.toast.saveFailed')}: ${String(error)}`)
          return false
        }
      },

      deleteHeldInvoice: async heldInvoiceId => {
        try {
          if (isTauriRuntime()) await deleteHeldInvoiceRow(heldInvoiceId)
          const deletingActive = get().activeHeldInvoiceId === heldInvoiceId
          set(
            state => ({
              heldInvoices: state.heldInvoices.filter(
                item => item.id !== heldInvoiceId
              ),
              ...(state.activeHeldInvoiceId === heldInvoiceId
                ? { activeHeldInvoiceId: null }
                : {}),
            }),
            undefined,
            'heldInvoices/deleteHeldInvoice'
          )
          if (deletingActive) persistActiveHeldId(null)
        } catch (error) {
          toast.error(`${i18n.t('db.toast.saveFailed')}: ${String(error)}`)
        }
      },

      completeHeldInvoice: heldInvoiceId => {
        const id = heldInvoiceId ?? get().activeHeldInvoiceId
        if (!id) return
        set({ activeHeldInvoiceId: null }, undefined, 'heldInvoices/complete')
        persistActiveHeldId(null)
      },

      clearActiveHeldInvoice: () => {
        set(
          { activeHeldInvoiceId: null },
          undefined,
          'heldInvoices/clearActive'
        )
        persistActiveHeldId(null)
      },

      hydrateHeldInvoices: async () => {
        if (!isTauriRuntime()) return
        try {
          const heldInvoices = await fetchHeldInvoices()
          set({ heldInvoices }, undefined, 'heldInvoices/hydrate')
        } catch (error) {
          toast.error(`${i18n.t('db.toast.loadFailed')}: ${String(error)}`)
          throw error
        }
      },
    }),
    { name: 'held-invoices-store' }
  )
)
