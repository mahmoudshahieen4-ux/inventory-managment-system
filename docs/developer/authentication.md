# Authentication & Role Management

How the POS authenticates users and enforces role-based access control
(RBAC). Key files:

- `src/store/useAuthStore.ts` — auth state, session persistence
- `src/services/password-crypto.ts` — PBKDF2-SHA256 hashing
- `src/services/db.ts` — `auth_users` SQLite table
- `src/lib/permissions.ts` — `canAccessView(role, view)`
- `src/components/auth/LoginPage.tsx` + `AuthGate.tsx` — sign-in UI + gate

## Mental Model

```
App start → AuthGate → hydrate() ──┬─ restored session → app UI
                                   ├─ no session → LoginPage → login() → app UI
                                   └─ DB error → error alert on LoginPage
```

## Accounts & Storage

- Accounts live in the `auth_users` SQLite table (`id`, `username` UNIQUE,
  `display_name`, `role`, `password_hash`, timestamps).
- Passwords are never stored in plain text: `hashPassword()` produces
  `pbkdf2-sha256$<iterations>$<saltB64>$<hashB64>` with a random 16-byte salt
  and 100,000 PBKDF2-SHA256 iterations (Web Crypto API).
- First launch seeds two accounts: `admin/admin123` and `cashier/cashier123`
  (see `DEFAULT_CREDENTIALS`). Change them from Preferences → Security.
- In the browser dev server / tests there is no SQLite, so the same defaults
  are kept in memory with stable ids (`user-admin`, `user-cashier`).

## Sessions

`login()` writes `{ userId, loginAt }` to localStorage under
`pos.auth.session.v1`. On the next launch `hydrate()` re-reads it and restores
the session if the user still exists. `logout()` clears it.

## Roles & Route Protection

- `UserRole = 'ADMIN' | 'CASHIER'`.
- `canAccessView()` in `src/lib/permissions.ts` is the single source of truth:
  ADMIN → `inventory | pos | payroll`; CASHIER → `pos` only.
- Enforcement layers (defense in depth):
  1. `ViewSwitcher` hides tabs the role cannot open.
  2. `MainWindowContent` redirects an unauthorized `activeView` back to POS.
  3. Feature components gate admin-only actions (e.g. `InventoryTable` edit
     buttons) by checking `useAuthStore(state => state.currentUser?.role)`.

## Changing Passwords

- `changeOwnPassword(current, next)` verifies the current password first.
- `changeUserPassword(userId, next)` is ADMIN-only and does not require the
  old password (admin reset). Both persist to SQLite and update the store.
- UI lives in Preferences → Security (`SecurityPane.tsx`); a logout button is
  also available there and in the title bar (`UserSessionBadge`).

## Error Handling

Actions set a structured `AuthError { code }` in the store; the UI maps codes
to localized messages via the `auth.errors.<code>` i18n keys (all three
locales). Login failures always report the generic `INVALID_CREDENTIALS` so
they do not leak whether the username or password was wrong.

## Testing

- Store tests seed real PBKDF2 hashes; `globalThis.crypto` is stubbed with
  Node's `webcrypto` because jsdom lacks `crypto.subtle`.
- Component tests render `LoginPage`/`AuthGate` with the store pre-seeded via
  `useAuthStore.setState({ ... })` (disable `hydrate` when a full app render
  would otherwise recreate the default accounts).
