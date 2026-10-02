# Production Readiness

Checklist and rationale for shipping the desktop POS to end-user machines
(Windows-first, NSIS installer).

## Local Database Location

- The connection string is resolved **at runtime** to an absolute path inside the
  per-user app data directory (`src/services/db.ts`, `resolveDatabaseUrl()`):

  ```
  %APPDATA%\com.egyptpos.store\pos.db
  C:\Users\<user>\AppData\Roaming\com.egyptpos.store\pos.db
  ```

- `appDataDir()` + `join()` (`@tauri-apps/api/path`, granted by
  `core:path:default`) build the path. `tauri-plugin-sql` maps `sqlite:<path>`
  through `app_config_dir().push(<path>)`; because the value is **absolute** it
  replaces that base, so the database is pinned to the writable per-user
  location and can never land in `C:\Program Files`.
- `src-tauri/src/lib.rs` resolves and **creates** `app_data_dir()` during
  `setup()`, before any connection opens, so the very first write succeeds on a
  pristine machine.
- The SQL plugin is **not** preloaded (`tauri.conf.json` omits `plugins.sql`);
  the frontend opens the connection lazily through `Database.load()`. If the
  directory cannot be resolved, the code logs a warning and degrades to the
  relative `sqlite:pos.db` default (the Windows/macOS config dir) instead of
  crashing.
- **Do not** move the file: existing customer data would be orphaned.

## Accounts & Passwords

- Accounts live in the SQLite `auth_users` table (`username`, `role`
  CHECK ADMIN/CASHIER, `password_hash`) — see `src/services/db.ts`.
- Hashing: PBKDF2-SHA256, 100k iterations, per-hash random salt,
  constant-time comparison (`src/services/password-crypto.ts`). Format:
  `pbkdf2-sha256$<iterations>$<saltB64>$<hashB64>` (iterations can be raised
  without invalidating rows).
- First launch seeds hashed defaults (`admin/admin123`, `cashier/cashier123`
  — `DEFAULT_CREDENTIALS` in `useAuthStore`); corrupted/legacy hashes are
  re-seeded to defaults instead of locking the user out.
- Login verifies against the stored hash (`verifyPassword`) — no plaintext
  comparison anywhere. Session persists in localStorage only (no secrets).
- Password change UI: Preferences → Security → `ChangePasswordModal.tsx`
  (current + new + confirm; mismatches and weak passwords are rejected).
  Admins can reset cashier passwords inline.
- **Recommended before field rollout:** have the admin change both default
  passwords during installation handover.

## Windows Bundle (NSIS)

`src-tauri/tauri.conf.json`:

- `bundle.targets: ["nsis"]` → produces a single `setup.exe`.
- `identifier: "com.egyptpos.store"`, `publisher: "Egypt POS Store"`,
  Arabic descriptions, `category: "Business"`.
- `bundle.windows.webviewInstallMode: downloadBootstrapper (silent)` — the
  installer **automatically detects** a missing WebView2 runtime and downloads
  it from Microsoft during setup. If WebView2 is missing when the raw exe is
  run (no installer), the WebView2 layer itself shows a native error prompt —
  no white screen.
- **Signing**: `certificateThumbprint: null` → the binary is unsigned;
  Windows SmartScreen will warn on first run. Add a code-signing certificate
  and fill the thumbprint + `timestampUrl` before wide distribution.

## Capabilities (IPC Permissions)

`src-tauri/capabilities/default.json` (main window) grants:
`core:default` (plus an explicit `core:path:default`), window controls
(minimize/maximize/close/fullscreen/drag), `core:event:default`, `log:default`,
`process:default`, `os:default`, `updater:default`, and the SQL set:
`sql:default` + `sql:allow-load`, `sql:allow-select`, `sql:allow-execute`,
`sql:allow-close`. `desktop.json` adds `window-state:default` + updater.

> **Note on `sql:*` identifiers:** `tauri-plugin-sql` 2.x exposes only
> `allow-load`, `allow-select`, `allow-execute` and `allow-close`. Every
> INSERT / UPDATE / DELETE runs through the `execute` command, so there are **no**
> `sql:allow-insert` / `sql:allow-update` / `sql:allow-delete` permissions —
> listing them fails capability validation during the build. `sql:default`
> already bundles `allow-load`, `allow-select` and `allow-close`; the explicit
> entries are kept for readability.

Follow least-privilege: add new plugin permissions explicitly, never `**`.

## CSP & Cloud Licensing

`app.security.csp` — `connect-src` includes `tauri: ipc: http://ipc.localhost`
**and `https:`** so the Supabase subscription sync (cloud licensing) can reach
its endpoint from the webview. Business data never leaves the device; only the
license check goes out (Rust-side updater requests are not subject to CSP).

## Failure Handling

- Root: `<App />` is wrapped in `ErrorBoundary` (`variant="page"`),
  per-view sections use `variant="section"` so one broken screen (POS,
  Inventory…) cannot white-screen the app.
- Page crash screen is localized (ar/en/fr) with **reload**, **retry**, and
  **copy error details** (time, user agent, error + stack) for support.
- `main.tsx` installs global `error` / `unhandledrejection` listeners.
- `src/lib/logger.ts` forwards warn/error/info to the Tauri log plugin in the
  production desktop runtime (stdout), so field issues are diagnosable.
- Startup tasks are capped by `withTimeout` (`src/lib/timeout.ts`): license
  cloud sync 10 s, bootstrap hydration 20 s — a hung task can never keep the
  app stuck on the loading spinner.

## Build & Verify

```bash
pnpm run tauri:build     # dist + NSIS installer
# output: src-tauri/target/release/bundle/nsis/PosStoreApp_1.0.4_x64-setup.exe
```

Verify on a clean Windows VM: install (WebView2 auto-provisioning), first
launch seeds accounts, login, change password, kill/restart (session +
inventory data survive), airplane-mode launch (trial + local license state).
