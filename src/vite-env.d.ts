/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Supabase project URL — cloud licensing backend (optional). */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase public anon key — read-only access to `subscriptions`. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
