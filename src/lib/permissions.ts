import type { AppView } from '@/store/ui-store'
import type { UserRole } from '@/types/auth'

/**
 * Views each role is allowed to open.
 * Cashiers are limited to the POS screen (sales + invoices); every other
 * view (inventory, payroll) is admin-only.
 */
const ROLE_ALLOWED_VIEWS: Record<UserRole, readonly AppView[]> = {
  ADMIN: ['inventory', 'pos', 'payroll'],
  CASHIER: ['pos'],
}

/** True when `role` may open `view` (used by the view gate and tab switcher). */
export function canAccessView(role: UserRole, view: AppView): boolean {
  return ROLE_ALLOWED_VIEWS[role].includes(view)
}
