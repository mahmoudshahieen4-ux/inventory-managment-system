import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import i18n from '@/i18n/config'
import {
  fetchAuthUsers,
  insertAuthUser,
  isTauriRuntime,
  updateAuthUserPassword,
} from '@/services/db'
import {
  hashPassword,
  isPasswordValid,
  verifyPassword,
} from '@/services/password-crypto'
import type {
  AuthAccount,
  AuthError,
  AuthSession,
  AuthStatus,
  User,
  UserRole,
} from '@/types/auth'

/** localStorage key holding the persisted session between launches. */
const SESSION_STORAGE_KEY = 'pos.auth.session.v1'

/** Default credentials seeded on first launch (always stored hashed). */
export const DEFAULT_CREDENTIALS: Record<
  UserRole,
  { username: string; password: string }
> = {
  ADMIN: { username: 'admin', password: 'admin123' },
  CASHIER: { username: 'cashier', password: 'cashier123' },
}

function toPublicUser(account: AuthAccount): User {
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
  }
}

function persistSession(session: AuthSession): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Storage unavailable (e.g. private mode) — the session simply won't persist.
  }
}

function readStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AuthSession>
    if (
      typeof parsed.userId === 'string' &&
      typeof parsed.loginAt === 'string'
    ) {
      return { userId: parsed.userId, loginAt: parsed.loginAt }
    }
    return null
  } catch {
    return null
  }
}

function clearStoredSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // Ignore storage failures on logout.
  }
}

/**
 * Stable account ids for the default accounts. Deterministic ids keep the
 * persisted session valid across restarts in browser dev mode, where accounts
 * are re-created in memory on every launch (desktop reads ids from SQLite).
 */
function createAccountId(role: UserRole): string {
  return role === 'ADMIN' ? 'user-admin' : 'user-cashier'
}

function roleDisplayName(role: UserRole): string {
  return i18n.t(role === 'ADMIN' ? 'auth.role.admin' : 'auth.role.cashier')
}

/** Builds the default admin + cashier accounts with freshly hashed passwords. */
async function createDefaultAccounts(): Promise<AuthAccount[]> {
  const now = new Date().toISOString()
  const roles: UserRole[] = ['ADMIN', 'CASHIER']
  return Promise.all(
    roles.map(async role => {
      const credentials = DEFAULT_CREDENTIALS[role]
      const passwordHash = await hashPassword(credentials.password)
      return {
        id: createAccountId(role),
        username: credentials.username,
        displayName: roleDisplayName(role),
        role,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      } satisfies AuthAccount
    })
  )
}

interface AuthState {
  /** Internal accounts including password hashes (never rendered in the UI). */
  accounts: AuthAccount[]
  /** Public view of all accounts — safe for UI consumption. */
  users: User[]
  /** Currently signed-in user, or null when signed out. */
  currentUser: User | null
  status: AuthStatus
  error: AuthError | null
  /** True while the startup session restore is running. */
  isInitializing: boolean

  /**
   * Loads accounts from SQLite (or in-memory defaults in the browser dev
   * server / tests) and restores the persisted session if it is still valid.
   */
  hydrate: () => Promise<void>
  /** Verifies credentials and starts a session. Returns true on success. */
  login: (username: string, password: string) => Promise<boolean>
  /** Ends the session and returns to the login screen. */
  logout: () => void
  clearError: () => void
  /** Changes the signed-in user's password after verifying the current one. */
  changeOwnPassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<boolean>
  /** ADMIN only: sets a new password for another account (e.g. a cashier). */
  changeUserPassword: (
    targetUserId: string,
    newPassword: string
  ) => Promise<boolean>
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set, get) => {
      /**
       * Shared password-change flow. When `currentPassword` is provided the
       * caller must know the existing password (self-service change); when it
       * is omitted the caller must already be an ADMIN (enforced by the
       * calling action).
       */
      const applyPasswordChange = async (
        targetUserId: string,
        currentPassword: string | undefined,
        newPassword: string
      ): Promise<boolean> => {
        const account = get().accounts.find(
          candidate => candidate.id === targetUserId
        )
        if (!account) {
          set(
            { error: { code: 'FORBIDDEN' } },
            undefined,
            'auth/changePassword-missing'
          )
          return false
        }

        if (currentPassword !== undefined) {
          try {
            const currentOk = await verifyPassword(
              currentPassword,
              account.passwordHash
            )
            if (!currentOk) {
              set(
                { error: { code: 'WRONG_PASSWORD' } },
                undefined,
                'auth/changePassword-wrong'
              )
              return false
            }
          } catch (error) {
            set(
              { error: { code: 'DB_UNAVAILABLE', detail: String(error) } },
              undefined,
              'auth/changePassword-error'
            )
            return false
          }
        }

        if (!isPasswordValid(newPassword)) {
          set(
            { error: { code: 'WEAK_PASSWORD' } },
            undefined,
            'auth/changePassword-weak'
          )
          return false
        }
        if (newPassword === currentPassword) {
          set(
            { error: { code: 'SAME_PASSWORD' } },
            undefined,
            'auth/changePassword-same'
          )
          return false
        }

        try {
          const passwordHash = await hashPassword(newPassword)
          const updatedAt = new Date().toISOString()
          if (isTauriRuntime()) {
            await updateAuthUserPassword(account.id, passwordHash)
          }
          set(
            state => ({
              accounts: state.accounts.map(candidate =>
                candidate.id === account.id
                  ? { ...candidate, passwordHash, updatedAt }
                  : candidate
              ),
              error: null,
            }),
            undefined,
            'auth/changePassword-success'
          )
          return true
        } catch (error) {
          set(
            { error: { code: 'DB_UNAVAILABLE', detail: String(error) } },
            undefined,
            'auth/changePassword-error'
          )
          return false
        }
      }

      return {
        accounts: [],
        users: [],
        currentUser: null,
        status: 'IDLE',
        error: null,
        isInitializing: false,

        hydrate: async () => {
          set({ isInitializing: true }, undefined, 'auth/hydrate-start')
          try {
            let accounts: AuthAccount[]
            if (isTauriRuntime()) {
              accounts = await fetchAuthUsers()
              if (accounts.length === 0) {
                // First launch on desktop: seed the default accounts.
                accounts = await createDefaultAccounts()
                for (const account of accounts) {
                  await insertAuthUser(account)
                }
              }
            } else {
              // Browser dev server / tests: keep defaults in memory only.
              accounts = await createDefaultAccounts()
            }

            const session = readStoredSession()
            const restoredAccount = session
              ? accounts.find(account => account.id === session.userId)
              : undefined

            set(
              {
                accounts,
                users: accounts.map(toPublicUser),
                currentUser: restoredAccount
                  ? toPublicUser(restoredAccount)
                  : null,
                status: restoredAccount ? 'AUTHENTICATED' : 'IDLE',
                error: null,
                isInitializing: false,
              },
              undefined,
              'auth/hydrate'
            )
          } catch (error) {
            set(
              {
                isInitializing: false,
                error: { code: 'DB_UNAVAILABLE', detail: String(error) },
              },
              undefined,
              'auth/hydrate-error'
            )
          }
        },

        login: async (username, password) => {
          set(
            { status: 'AUTHENTICATING', error: null },
            undefined,
            'auth/login-start'
          )
          const normalized = username.trim().toLowerCase()
          const account = get().accounts.find(
            candidate => candidate.username.toLowerCase() === normalized
          )
          if (!account) {
            set(
              { status: 'IDLE', error: { code: 'INVALID_CREDENTIALS' } },
              undefined,
              'auth/login-failed'
            )
            return false
          }

          try {
            const isValid = await verifyPassword(password, account.passwordHash)
            if (!isValid) {
              set(
                { status: 'IDLE', error: { code: 'INVALID_CREDENTIALS' } },
                undefined,
                'auth/login-failed'
              )
              return false
            }

            const user = toPublicUser(account)
            persistSession({
              userId: user.id,
              loginAt: new Date().toISOString(),
            })
            set(
              { status: 'AUTHENTICATED', currentUser: user, error: null },
              undefined,
              'auth/login-success'
            )
            return true
          } catch (error) {
            set(
              {
                status: 'IDLE',
                error: { code: 'DB_UNAVAILABLE', detail: String(error) },
              },
              undefined,
              'auth/login-error'
            )
            return false
          }
        },

        logout: () => {
          clearStoredSession()
          set(
            { currentUser: null, status: 'IDLE', error: null },
            undefined,
            'auth/logout'
          )
        },

        clearError: () => set({ error: null }, undefined, 'auth/clearError'),

        changeOwnPassword: (currentPassword, newPassword) => {
          const current = get().currentUser
          if (!current) {
            set(
              { error: { code: 'FORBIDDEN' } },
              undefined,
              'auth/changePassword-forbidden'
            )
            return Promise.resolve(false)
          }
          return applyPasswordChange(current.id, currentPassword, newPassword)
        },

        changeUserPassword: (targetUserId, newPassword) => {
          const current = get().currentUser
          if (!current || current.role !== 'ADMIN') {
            set(
              { error: { code: 'FORBIDDEN' } },
              undefined,
              'auth/changePassword-forbidden'
            )
            return Promise.resolve(false)
          }
          return applyPasswordChange(targetUserId, undefined, newPassword)
        },
      }
    },
    { name: 'auth-store' }
  )
)
