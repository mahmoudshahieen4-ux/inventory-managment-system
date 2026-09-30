# Cloud Licensing (Supabase)

Hybrid offline-first licensing. The desktop client verifies Ed25519-signed
license tokens locally, so an issued token continues to work offline until its
signed expiry. Supabase distributes signed tokens and stores their latest
status. Products, sales, inventory, and payroll remain only in local SQLite.

## Data Isolation Rules (CRITICAL)

| Data                                | Storage                                                |
| ----------------------------------- | ------------------------------------------------------ |
| Products, sales, inventory, payroll | Local SQLite (`pos.db`) — never leaves the device      |
| Signed token / latest subscription  | Supabase `subscriptions` table (read-only for clients) |
| License record (verified mirror)    | SQLite `license` table (single row)                    |

Never send business data to Supabase, never let the client write to the
`subscriptions` table, and never ship signing code or private key material in
the desktop application.

## Architecture

```
 Trusted operator tool
 └─ Supabase Edge Function: generate-license
    ├─ authenticate Supabase user; require app_metadata.license_admin = true
    ├─ validate machine ID + expiry
    ├─ sign claims with LICENSE_SIGNING_PRIVATE_KEY (server secret only)
    └─ upsert { machine_id, license_token, status, expires_at }

 Client app
 ├─ VITE_LICENSE_PUBLIC_KEY (public Ed25519 key embedded at build time)
 ├─ offline activation → verify signature + issuer + expiry + machine_id
 └─ cloud sync → fetch license_token → same verification → save local mirror

 Connectivity restored
 └─ App.tsx useEffect ('online' listener)
    └─ useLicenseStore.syncWithCloud()
```

Tokens use `base64url(JSON claims).base64url(Ed25519 signature)`. The signed
claims are `{ version, issuer, machineId, status, exp, jti }`; the signature is
over the exact decoded JSON bytes. Both offline activation and cloud sync call
`verifyLicenseToken`. Unsigned database `status` and `expires_at` fields never
grant access.

### Status mapping

| Verified signed claim                 | Local `LicenseStatus`         | UI                               |
| ------------------------------------- | ----------------------------- | -------------------------------- |
| `ACTIVE` and `exp` > now              | `ACTIVE`                      | Normal app; banner when ≤ 3 days |
| `ACTIVE` and `exp` ≤ now              | `EXPIRED`                     | Lock modal (renewal)             |
| `BLOCKED`                             | `EXPIRED`                     | Lock modal (renewal)             |
| bad signature / wrong machine / token | Not applied; local state kept | Fail closed for new activation   |
| no row / offline                      | Verified local state kept     | Offline operation                |

### Offline fallback

`syncSubscriptionWithCloud` keeps the last verified local token when the
network is unavailable. On every desktop startup, an existing paid local
record is reverified against the build's public key and current machine ID
before it is trusted. Legacy checksum keys and invalid cloud rows are not
accepted.

The boot sync is additionally wrapped in
`withTimeout(…, CLOUD_SYNC_TIMEOUT_MS)` (10 s — `src/lib/timeout.ts`): a fetch
that never settles (supabase-js sets no network timeout) resolves to the
`OFFLINE` outcome instead of stalling `initialize()` and leaving the app stuck
on the "loading database" spinner forever. `useLicenseGuard` is also
failure-proof: a rejected hardware-fingerprint call logs a warning and
initializes from the local record (machineId `undefined` → cloud sync skipped),
and the whole boot IIFE has a `.catch()` so no rejection is ever swallowed.

### Anti-tampering (clock rollback)

Every cloud write (and every expiration check) pulses `last_active_time` in
the local SQLite license row. `runExpirationCheck` locks the app (`EXPIRED`,
`clockRollbackDetected = true`) when the current clock is older than the last
pulsed timestamp — so setting the Windows clock backwards cannot extend a
subscription. The UTC-vs-UTC expiry comparison also neutralizes timezone
games.

### Expiring-soon warning

The store derives `daysRemaining`, `isExpiringSoon` and the legacy alias
`graceWarning` (ACTIVE subscription with ≤ 3 days left, see
`EXPIRING_SOON_DAYS`). `SubscriptionBanner` renders an amber **non-blocking**
warning with a **Renew Now / Contact Support** button that opens a renewal
dialog (Machine ID, expiry date, days left, WhatsApp/phone contacts) while
`isExpiringSoon` is true. The app stays fully functional until the status
flips to `EXPIRED` / `BLOCKED`, which is when the `LicenseLockModal` takes over.

## Files

| File                                                 | Purpose                                          |
| ---------------------------------------------------- | ------------------------------------------------ |
| `supabase/functions/generate-license/index.ts`       | Protected server-side Ed25519 token issuer       |
| `supabase/migrations/0001_create_subscriptions.sql`  | Subscription table + read-only client policy     |
| `supabase/migrations/0002_signed_license_tokens.sql` | Signed token column                              |
| `src/services/licenseVerification.ts`                | Client-only public-key verification              |
| `src/services/licenseSync.ts`                        | Verifies cloud token before applying cloud state |
| `src/services/localLicenseRepository.ts`             | Local SQLite license adapters                    |
| `src/store/useLicenseStore.ts`                       | Activation, boot verification, and expiry state  |
| `src/components/license/SubscriptionBanner.tsx`      | Renewal warning                                  |
| `src/components/auth/useLicenseGuard.ts`             | Boot sync + hourly expiration checks             |

## Setup

1. Create an Ed25519 keypair in a trusted provisioning environment. Export the
   public key as base64 (32-byte raw or DER SubjectPublicKeyInfo) for
   `VITE_LICENSE_PUBLIC_KEY`; export the private key as base64-encoded PKCS#8
   DER without PEM armor for the Supabase secret `LICENSE_SIGNING_PRIVATE_KEY`.
   Never commit the private key or put it in a `VITE_*` variable.
2. Authenticate and link the Supabase CLI to the intended project:
   `npx supabase login`, then `npx supabase link --project-ref <project-ref>`.
3. Add `LICENSE_SIGNING_PRIVATE_KEY` through the Supabase secrets manager. Do
   not pass or store the private key in source files, build variables, or shell
   history.
4. Run both migrations with `npx supabase db push`, then deploy with
   `npx supabase functions deploy generate-license`.
5. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
   `VITE_LICENSE_PUBLIC_KEY` in the client build environment. The public key is
   intentionally visible in the app. If it is absent or malformed, paid
   license verification fails closed.
6. Grant `app_metadata.license_admin = true` only to trusted Supabase Auth
   operator accounts using a trusted admin process. The desktop application
   contains no license generator or developer password.
7. Call `generate-license` from a trusted operator tool with a Supabase bearer
   token and `{ "machine_id": "<customer id>", "expires_at": "<UTC ISO timestamp>" }`.
   An optional `status` may be `ACTIVE` or `BLOCKED`. The function allows only
   ten requests per operator per minute, signs the claims, upserts the cloud
   row, and returns the signed token. Send that token to the customer for
   offline activation.
8. Reissue existing subscriptions through the Edge Function. Old checksum
   keys are intentionally rejected; old local paid records are locked until a
   valid signed token is installed.

## Security notes

- The Edge Function authenticates the Supabase user and checks the
  server-managed `app_metadata.license_admin` claim before using the service
  role. The service-role key and Ed25519 private key exist only in Edge
  Function secrets.
- The anon key and signed tokens are public. A token is not a secret; its
  integrity and machine binding come from Ed25519 verification. Never treat
  the machine ID as an authentication secret.
- Offline clients cannot learn about a newly blocked token until they sync,
  and an already issued offline token remains usable until expiry. Keep offline
  terms bounded if revocation latency matters.
- Any client-side licensing check can be patched by a determined device
  owner. The signature prevents forging vendor-issued tokens, but does not
  provide DRM against a modified client binary.
- Business data never touches the cloud.

## Testing

`src/services/license-verification.test.ts` verifies signatures, machine
binding, expiry, and blocked tokens. `src/services/licenseSync.test.ts` ensures
unsigned cloud fields and invalid tokens cannot authorize a subscription.
The generator Edge Function must be deployed and tested separately in a
Supabase staging project; its private key must never appear in client tests.
