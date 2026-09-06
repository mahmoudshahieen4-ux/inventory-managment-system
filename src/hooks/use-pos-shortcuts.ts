import { useEffect } from 'react'

import { useCartStore } from '@/store/useCartStore'
import { getPosActions } from '@/components/pos/pos-actions'

interface PosShortcutHandlers {
  /** F1 — start a new sale: clear the cart and reset the catalog search. */
  onNewSale: () => void
  /** ESC — clear the current cart without starting a fresh sale. */
  onClearCart: () => void
  /** F12 — print the currently open receipt (no-op when none is open). */
  onPrintReceipt: () => void
}

/**
 * Keyboard-driven POS flow for fast cashier operation:
 * - `F1`  → new sale (clears cart + search)
 * - `F2`  → cash payment (delegates to the registered `CartSummary` checkout)
 * - `F12` → print the open receipt
 * - `ESC` → clear cart
 *
 * Uses `getState()` inside the handler so listeners attach once; F-keys and
 * ESC are swallowed only when a POS action actually runs, never in text
 * inputs' normal typing flow.
 */
export function usePosShortcuts({
  onNewSale,
  onClearCart,
  onPrintReceipt,
}: PosShortcutHandlers): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Never hijack keys while modifier combos are in use (accessibility).
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key) {
        case 'F1': {
          e.preventDefault()
          onNewSale()
          break
        }
        case 'F2': {
          // CartSummary registers its checkout handler; a no-op when the cart
          // is empty or the POS cart is not mounted.
          if (useCartStore.getState().items.length === 0) return
          e.preventDefault()
          getPosActions()?.checkout()
          break
        }
        case 'F12': {
          e.preventDefault()
          onPrintReceipt()
          break
        }
        case 'Escape': {
          // Let open dialogs (receipt/renewal) own ESC first, and never fire
          // while the operator is typing in a text field.
          if (document.querySelector('[role="dialog"][data-state="open"]')) {
            return
          }
          const target = e.target
          if (
            target instanceof HTMLElement &&
            (target.tagName === 'INPUT' ||
              target.tagName === 'TEXTAREA' ||
              target.isContentEditable)
          ) {
            return
          }
          if (useCartStore.getState().items.length === 0) return
          e.preventDefault()
          onClearCart()
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onNewSale, onClearCart, onPrintReceipt])
}
