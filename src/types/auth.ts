/**
 * Core domain types for role-based access control (RBAC).
 */

/** The roles available in the system. */
export type UserRole = 'ADMIN' | 'CASHIER'

/** A user account that can authenticate into the POS system. */
export interface User {
  id: string
  username: string
  displayName: string
  role: UserRole
}
