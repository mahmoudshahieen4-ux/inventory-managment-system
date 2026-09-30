import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MACHINE_ID_PATTERN = /^(?:[0-9A-F]{8}|[0-9A-F]{16})$/

let privateKeyPromise: Promise<CryptoKey> | undefined

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0))
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function getSigningKey(): Promise<CryptoKey> {
  if (!privateKeyPromise) {
    const encodedKey = Deno.env.get('LICENSE_SIGNING_PRIVATE_KEY') ?? ''
    if (!encodedKey) throw new Error('Signing key is not configured')
    privateKeyPromise = crypto.subtle.importKey(
      'pkcs8',
      decodeBase64(encodedKey),
      { name: 'Ed25519' },
      false,
      ['sign']
    )
  }
  return privateKeyPromise
}

interface GenerateLicenseRequest {
  machine_id: string
  expires_at: string
  status?: 'ACTIVE' | 'BLOCKED'
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Server configuration unavailable' }, 500)
    }

    const accessToken = request.headers
      .get('Authorization')
      ?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!accessToken) return jsonResponse({ error: 'Unauthorized' }, 401)

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: authData, error: authError } =
      await authClient.auth.getUser(accessToken)
    if (
      authError ||
      !authData.user ||
      authData.user.app_metadata?.license_admin !== true
    ) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }

    const body = (await request.json()) as Partial<GenerateLicenseRequest>
    if (
      typeof body.machine_id !== 'string' ||
      typeof body.expires_at !== 'string'
    ) {
      return jsonResponse(
        { error: 'machine_id and expires_at are required' },
        400
      )
    }

    const normalizedId = body.machine_id.replace(/[-\s]/g, '').toUpperCase()
    if (!MACHINE_ID_PATTERN.test(normalizedId)) {
      return jsonResponse({ error: 'Invalid machine_id' }, 400)
    }

    const expiryMilliseconds = Date.parse(body.expires_at)
    if (
      !Number.isFinite(expiryMilliseconds) ||
      new Date(expiryMilliseconds).toISOString() !== body.expires_at ||
      expiryMilliseconds <= Date.now()
    ) {
      return jsonResponse(
        { error: 'expires_at must be a future UTC ISO date' },
        400
      )
    }
    const exp = Math.floor(expiryMilliseconds / 1000)
    const expiresAt = new Date(exp * 1000).toISOString()

    const status = body.status ?? 'ACTIVE'
    if (status !== 'ACTIVE' && status !== 'BLOCKED') {
      return jsonResponse({ error: 'Invalid license status' }, 400)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: quotaAvailable, error: quotaError } = await adminClient.rpc(
      'reserve_license_issue',
      {
        p_issuer_user_id: authData.user.id,
        p_machine_id: normalizedId.slice(0, 8),
      }
    )
    if (quotaError) {
      console.error('License issuance quota check failed', quotaError.message)
      return jsonResponse(
        { error: 'Could not authorize license issuance' },
        500
      )
    }
    if (quotaAvailable !== true) {
      return jsonResponse(
        { error: 'License issuance rate limit exceeded' },
        429
      )
    }

    const claims = {
      version: 1,
      issuer: 'hyper-market',
      machineId: normalizedId.slice(0, 8),
      status,
      exp,
      jti: crypto.randomUUID(),
    } as const
    const payload = new TextEncoder().encode(JSON.stringify(claims))
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        await getSigningKey(),
        payload
      )
    )
    const token = `${encodeBase64Url(payload)}.${encodeBase64Url(signature)}`

    const { error: writeError } = await adminClient
      .from('subscriptions')
      .upsert(
        {
          machine_id: claims.machineId,
          status: claims.status,
          expires_at: expiresAt,
          license_token: token,
        },
        { onConflict: 'machine_id' }
      )
    if (writeError) {
      console.error('License subscription write failed', writeError.message)
      return jsonResponse({ error: 'Could not save license' }, 500)
    }

    console.info('License issued', {
      issuerUserId: authData.user.id,
      machineId: claims.machineId,
      expiresAt,
      status: claims.status,
    })
    return jsonResponse({
      token,
      machine_id: claims.machineId,
      expires_at: expiresAt,
      status: claims.status,
    })
  } catch (error) {
    console.error('License issuance failed', error)
    return jsonResponse({ error: 'License issuance failed' }, 500)
  }
})
