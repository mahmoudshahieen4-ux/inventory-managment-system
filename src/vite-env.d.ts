/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Ed25519 raw public key (base64) used to verify signed licenses. */
  readonly VITE_LICENSE_PUBLIC_KEY?: string
  /** Supabase project URL — cloud licensing backend (optional). */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase public anon key — read-only access to `subscriptions`. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
