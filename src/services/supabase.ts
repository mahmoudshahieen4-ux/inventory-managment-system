/**
 * Supabase client — cloud licensing backend.
 *
 * Supabase is used ONLY for subscription validation (the `subscriptions`
 * table). All business data (products, sales, inventory, payroll) stays
 * exclusively in the local SQLite database (`sqlite:pos.db`) and is never
 * sent to the cloud. See docs/developer/cloud-licensing.md.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/** True when the Supabase env vars are set (cloud sync available). */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

let client: SupabaseClient | null = null

/**
 * Shared Supabase client, created lazily so a missing configuration (browser
 * dev server / unit tests) never crashes the app at import time. Callers
 * must check `isSupabaseConfigured()` before using the client.
 *
 * Persistent auth sessions are disabled on purpose: the app only talks to
 * the Data API (PostgREST) with the public anon key. There is no user login
 * and nothing session-related must be persisted to disk.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    if (!isSupabaseConfigured()) {
      throw new Error(
        '[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'
      )
    }
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }
  return client
}
