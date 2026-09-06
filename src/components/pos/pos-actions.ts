/**
 * Registry for POS actions that live inside child components but must be
 * reachable from global keyboard shortcuts mounted on `POSScreen`.
 * `CartSummary` registers its checkout handler on mount; the shortcut hook
 * invokes it. Kept module-level and typed instead of lifting checkout state.
 */
export interface PosActions {
  /** Runs the cash checkout flow (validation, store updates, receipt). */
  checkout: () => void
}

let posActions: PosActions | null = null

/** Registers the current POS action handlers (called by `CartSummary`). */
export function registerPosActions(actions: PosActions): void {
  posActions = actions
}

/** Returns the registered actions, or null when the cart is not mounted. */
export function getPosActions(): PosActions | null {
  return posActions
}

/** Clears the registration on unmount to avoid stale closures. */
export function unregisterPosActions(): void {
  posActions = null
}
