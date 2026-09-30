import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  verifySignedLicense,
  type LicenseTokenClaims,
} from './licenseVerification'

const MACHINE_ID = 'AABBCCDD'
let testKeyPair: CryptoKeyPair
let publicKeyBase64: string
let publicKeySpkiBase64: string

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function signTestClaims(claims: LicenseTokenClaims): Promise<string> {
  const payload = new TextEncoder().encode(JSON.stringify(claims))
  const signature = await crypto.subtle.sign(
    { name: 'Ed25519' },
    testKeyPair.privateKey,
    payload
  )
  return `${toBase64Url(payload)}.${toBase64Url(new Uint8Array(signature))}`
}

function claims(
  overrides: Partial<LicenseTokenClaims> = {}
): LicenseTokenClaims {
  return {
    version: 1,
    issuer: 'hyper-market',
    machineId: MACHINE_ID,
    status: 'ACTIVE',
    exp: Math.floor(Date.now() / 1000) + 86_400,
    jti: crypto.randomUUID(),
    ...overrides,
  }
}

describe('verifySignedLicense', () => {
  beforeAll(async () => {
    testKeyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair
    publicKeyBase64 = toBase64(
      new Uint8Array(
        await crypto.subtle.exportKey('raw', testKeyPair.publicKey)
      )
    )
    publicKeySpkiBase64 = toBase64(
      new Uint8Array(
        await crypto.subtle.exportKey('spki', testKeyPair.publicKey)
      )
    )
  })

  beforeEach(() => {
    vi.stubEnv('VITE_LICENSE_PUBLIC_KEY', publicKeyBase64)
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('accepts a valid signature bound to this machine', async () => {
    const token = await signTestClaims(claims())
    const result = await verifySignedLicense(MACHINE_ID, token)

    expect(result.valid).toBe(true)
    expect(result.claims?.machineId).toBe(MACHINE_ID)
    expect(result.expiresAt).toBeTruthy()
  })

  it('accepts an Ed25519 SubjectPublicKeyInfo public key', async () => {
    vi.stubEnv('VITE_LICENSE_PUBLIC_KEY', publicKeySpkiBase64)
    const token = await signTestClaims(claims())

    expect((await verifySignedLicense(MACHINE_ID, token)).valid).toBe(true)
  })

  it('rejects a changed payload or signature', async () => {
    const token = await signTestClaims(claims())
    const [payload, signature] = token.split('.')
    const changedToken = `${payload?.slice(0, -1)}${payload?.endsWith('A') ? 'B' : 'A'}.${signature}`

    expect((await verifySignedLicense(MACHINE_ID, changedToken)).error).toBe(
      'SIGNATURE'
    )
  })

  it('rejects a valid token issued for a different machine', async () => {
    const token = await signTestClaims(claims())

    expect((await verifySignedLicense('FFFFFFFF', token)).error).toBe(
      'MACHINE_MISMATCH'
    )
  })

  it('rejects expired and blocked signed licenses', async () => {
    const expired = await signTestClaims(
      claims({ exp: Math.floor(Date.now() / 1000) - 1 })
    )
    const blocked = await signTestClaims(claims({ status: 'BLOCKED' }))

    expect((await verifySignedLicense(MACHINE_ID, expired)).error).toBe(
      'EXPIRED'
    )
    expect((await verifySignedLicense(MACHINE_ID, blocked)).error).toBe(
      'BLOCKED'
    )
  })

  it('fails closed when the public key is not configured', async () => {
    const token = await signTestClaims(claims())
    vi.stubEnv('VITE_LICENSE_PUBLIC_KEY', '')

    expect((await verifySignedLicense(MACHINE_ID, token)).error).toBe(
      'PUBLIC_KEY_UNAVAILABLE'
    )
  })
})
