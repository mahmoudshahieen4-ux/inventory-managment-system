export type LicenseTokenStatus = 'ACTIVE' | 'BLOCKED'

export interface LicenseTokenClaims {
  version: 1
  issuer: 'hyper-market'
  machineId: string
  status: LicenseTokenStatus
  /** Unix timestamp in seconds; the instant at which the license expires. */
  exp: number
  jti: string
}

export interface SignedLicenseVerification {
  valid: boolean
  expiresAt?: string
  error?: string
  /** Claims are returned only after signature and claim validation. */
  claims?: LicenseTokenClaims
}

const TOKEN_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/
const MACHINE_ID_PATTERN = /^[0-9A-F]{8}$/

function decodeBase64Url(value: string): Uint8Array | null {
  if (!TOKEN_SEGMENT_PATTERN.test(value)) return null
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return Uint8Array.from(atob(padded), character => character.charCodeAt(0))
  } catch {
    return null
  }
}

function decodePublicKey(value: string): Uint8Array | null {
  try {
    const base64 = value.trim().replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return Uint8Array.from(atob(padded), character => character.charCodeAt(0))
  } catch {
    return null
  }
}

function isLicenseTokenClaims(value: unknown): value is LicenseTokenClaims {
  if (typeof value !== 'object' || value === null) return false
  const claims = value as Partial<LicenseTokenClaims>
  return (
    claims.version === 1 &&
    claims.issuer === 'hyper-market' &&
    typeof claims.machineId === 'string' &&
    MACHINE_ID_PATTERN.test(claims.machineId) &&
    (claims.status === 'ACTIVE' || claims.status === 'BLOCKED') &&
    Number.isSafeInteger(claims.exp) &&
    typeof claims.exp === 'number' &&
    claims.exp > 0 &&
    Number.isFinite(new Date(claims.exp * 1000).getTime()) &&
    typeof claims.jti === 'string' &&
    claims.jti.length > 0 &&
    claims.jti.length <= 128
  )
}

/** Verifies base64url(payload).base64url(signature) with the embedded public key. */
export async function verifySignedLicense(
  machineId: string,
  signedToken: string,
  now: Date = new Date()
): Promise<SignedLicenseVerification> {
  const token = signedToken.trim()
  if (token.length > 4096) return { valid: false, error: 'FORMAT' }
  const segments = token.split('.')
  if (
    segments.length !== 2 ||
    !segments.every(segment => TOKEN_SEGMENT_PATTERN.test(segment))
  ) {
    return { valid: false, error: 'FORMAT' }
  }

  const publicKeyValue = import.meta.env.VITE_LICENSE_PUBLIC_KEY?.trim() ?? ''
  const publicKeyBytes = decodePublicKey(publicKeyValue)
  const publicKeyFormat: KeyFormat | null =
    publicKeyBytes?.length === 32
      ? 'raw'
      : publicKeyBytes?.length === 44
        ? 'spki'
        : null
  const payloadBytes = decodeBase64Url(segments[0] ?? '')
  const signatureBytes = decodeBase64Url(segments[1] ?? '')
  if (!payloadBytes || !signatureBytes || signatureBytes.length !== 64) {
    return { valid: false, error: 'FORMAT' }
  }
  if (!publicKeyBytes || !publicKeyFormat) {
    return { valid: false, error: 'PUBLIC_KEY_UNAVAILABLE' }
  }

  const normalizedMachineId = machineId.replace(/[-\s]/g, '').toUpperCase()
  if (!MACHINE_ID_PATTERN.test(normalizedMachineId)) {
    return { valid: false, error: 'FORMAT' }
  }
  if (!globalThis.crypto?.subtle) {
    return { valid: false, error: 'CRYPTO_UNAVAILABLE' }
  }

  let publicKey: CryptoKey
  try {
    publicKey = await crypto.subtle.importKey(
      publicKeyFormat,
      publicKeyBytes,
      { name: 'Ed25519' },
      false,
      ['verify']
    )
  } catch {
    return { valid: false, error: 'CRYPTO_UNAVAILABLE' }
  }

  let signatureIsValid: boolean
  try {
    signatureIsValid = await crypto.subtle.verify(
      { name: 'Ed25519' },
      publicKey,
      signatureBytes,
      payloadBytes
    )
  } catch {
    return { valid: false, error: 'CRYPTO_UNAVAILABLE' }
  }
  if (!signatureIsValid) return { valid: false, error: 'SIGNATURE' }

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(payloadBytes))
  } catch {
    return { valid: false, error: 'FORMAT' }
  }
  if (!isLicenseTokenClaims(parsed)) return { valid: false, error: 'FORMAT' }

  const claims: LicenseTokenClaims = parsed
  const expiresAt = new Date(claims.exp * 1000).toISOString()
  const verifiedToken = { claims, expiresAt }
  if (claims.machineId !== normalizedMachineId) {
    return { valid: false, error: 'MACHINE_MISMATCH', ...verifiedToken }
  }
  if (claims.status === 'BLOCKED') {
    return { valid: false, error: 'BLOCKED', ...verifiedToken }
  }
  if (claims.exp * 1000 <= now.getTime()) {
    return { valid: false, error: 'EXPIRED', ...verifiedToken }
  }
  return { valid: true, ...verifiedToken }
}
