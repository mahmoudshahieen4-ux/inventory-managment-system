# Cloud Licensing (Supabase)

Hybrid offline-first subscription licensing: the cloud (Supabase) is the
source of truth for **subscription status only**; everything else — products,
sales, inventory, payroll, and the working license state — lives in the local
SQLite database (`sqlite:pos.db`).

## Data Isolation Rules (CRITICAL)

| Data                                | Storage                                                |
| ----------------------------------- | ------------------------------------------------------ |
| Products, sales, inventory, payroll | Local SQLite (`pos.db`) — never leaves the device      |
| Subscription status / expiry        | Supabase `subscriptions` table (read-only for clients) |
| License record (local mirror)       | SQLite `license` table (single row)                    |

Never send business data to Supabase, and never let the client write to the
`subscriptions` table.

## Architecture

```
 App boot (desktop)
 └─ useLicenseGuard (useEffect)
    └─ useLicenseStore.initialize(machineId)
       ├─ load local license row (SQLite)
       ├─ syncSubscriptionWithCloud(machineId)      ← src/services/licenseSync.ts
       │   ├─ SELECT … FROM subscriptions WHERE machine_id = …
       │   ├─ compare UTC expires_at vs UTC now     (resolveLocalStatus)
       │   └─ saveLicense(merged)                   ← localLicenseRepository
       │       (offline → catch → local state kept, no crash)
       └─ runExpirationCheck()  (hourly re-check + clock pulse)

 Connectivity restored
 └─ App.tsx useEffect ('online' listener)
    └─ useLicenseStore.syncWithCloud()
```

### Status mapping

| Cloud `status`                | Local `LicenseStatus`           | UI                               |
| ----------------------------- | ------------------------------- | -------------------------------- |
| `ACTIVE` + `expires_at` > now | `ACTIVE` (expiry = cloud value) | Normal app; banner when ≤ 3 days |
| `ACTIVE` + `expires_at` ≤ now | `EXPIRED`                       | Lock modal (renewal)             |
| `EXPIRED`                     | `EXPIRED`                       | Lock modal (renewal)             |
| `BLOCKED`                     | `EXPIRED`                       | Lock modal (renewal)             |
| no row / offline / error      | local state unchanged           | Trial / previous state           |

### Offline fallback

`syncSubscriptionWithCloud` **never throws**. Every failure path returns a
`LicenseSyncOutcome` (`OFFLINE`, `SKIPPED`, `NO_SUBSCRIPTION`, `ERROR`) and
the local record is kept. A lost connection can therefore never lock a paying
customer out of already-granted access.

### Anti-tampering (clock rollback)

Every cloud write (and every expiration check) pulses `last_active_time` in
the local SQLite license row. `runExpirationCheck` locks the app (`EXPIRED`,
`clockRollbackDetected = true`) when the current clock is older than the last
pulsed timestamp — so setting the Windows clock backwards cannot extend a
subscription. The UTC-vs-UTC expiry comparison also neutralizes timezone
games.

### Grace-period warning

The store derives `daysRemaining` and `graceWarning` (ACTIVE license with ≤ 3
days left, see `EXPIRING_SOON_DAYS`). `GracePeriodBanner` renders an amber
warning with a **Renew Now** button while `graceWarning` is true.

## Files

| File                                                | Purpose                                        |
| --------------------------------------------------- | ---------------------------------------------- |
| `supabase/migrations/0001_create_subscriptions.sql` | Table + RLS read-only policy                   |
| `src/services/supabase.ts`                          | Lazy client (`persistSession: false`)          |
| `src/services/localLicenseRepository.ts`            | `getLicense()` / `saveLicense()` adapters      |
| `src/services/licenseSync.ts`                       | `syncSubscriptionWithCloud()` + status mapping |
| `src/store/useLicenseStore.ts`                      | `initialize(machineId?)`, `syncWithCloud()`    |
| `src/components/auth/GracePeriodBanner.tsx`         | ≤ 3-days renewal warning                       |
| `src/components/auth/useLicenseGuard.ts`            | Boot sync + hourly expiration checks           |

## Setup

1. Create a Supabase project and run the migration
   (`supabase/migrations/0001_create_subscriptions.sql`) via the SQL editor or
   `supabase db push`.
2. Put the project URL and anon key in `.env` (see `.env.example`):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Without them the app runs
   fully offline (sync outcome `SKIPPED`).
3. Vendor-side, insert one row per machine after purchase:
   `machine_id` = the client's hardware fingerprint (shown on the lock
   screen / stored in `license`), `status`, `expires_at`.

## Security notes

- RLS: the only policy is `SELECT` for `anon` — the embedded anon key can
  read subscription rows but can never insert/update/delete, so a client
  cannot alter its own expiry.
- The anon key ships in the binary and cannot be bound to one machine at the
  DB level; treat its data as public (fingerprint hash, name, dates only).
- Business data never touches the cloud, so a leaked anon key exposes no POS
  data.

## Testing

`src/services/licenseSync.test.ts` mocks `./supabase` and `@/services/db` to
cover every sync outcome plus the pure helpers (`resolveLocalStatus`,
`mergeCloudSubscription`). `GracePeriodBanner.test.tsx` follows the
`TrialBanner` test pattern. In the browser dev server / unit tests the sync
is a no-op (`isSupabaseConfigured()` / `isTauriRuntime()` guards).
