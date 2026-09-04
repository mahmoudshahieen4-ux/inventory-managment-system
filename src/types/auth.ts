/**
 * Core domain types for authentication and role-based access control (RBAC).
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

/**
 * Full account record including the password hash. Lives only inside the
 * auth store and persistence layer — never render `passwordHash` in the UI.
 */
export interface AuthAccount extends User {
  passwordHash: string
  createdAt: string
  updatedAt: string
}

/** Lightweight session persisted in localStorage between app launches. */
export interface AuthSession {
  userId: string
  loginAt: string
}

/** Lifecycle of the authentication flow. */
export type AuthStatus = 'IDLE' | 'AUTHENTICATING' | 'AUTHENTICATED'

/**
 * Machine-readable auth failure reasons. The UI maps each code to a
 * localized message via the `auth.errors.<code>` i18n keys.
 */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'WRONG_PASSWORD'
  | 'WEAK_PASSWORD'
  | 'SAME_PASSWORD'
  | 'FORBIDDEN'
  | 'DB_UNAVAILABLE'

/** Structured auth error carried in the auth store. */
export interface AuthError {
  code: AuthErrorCode
  /** Technical detail for logging — never shown to end users. */
  detail?: string
}
