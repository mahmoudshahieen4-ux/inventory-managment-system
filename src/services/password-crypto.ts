/**
 * Password hashing backed by the Web Crypto API (PBKDF2-SHA256).
 *
 * Hashes are stored in SQLite as
 * `pbkdf2-sha256$<iterations>$<saltB64>$<hashB64>` so the iteration count can
 * be raised later without invalidating existing rows. A unique random salt is
 * generated per hash to prevent rainbow-table reuse. Works identically in the
 * Tauri webview and the browser dev server; tests stub `globalThis.crypto`
 * with Node's WebCrypto implementation.
 */

const PBKDF2_ITERATIONS = 100_000
const SALT_LENGTH_BYTES = 16
const HASH_LENGTH_BYTES = 32
const HASH_ALGORITHM_PREFIX = 'pbkdf2-sha256'

/** Minimum accepted length for new passwords. */
export const MIN_PASSWORD_LENGTH = 4

/** Resolves the WebCrypto SubtleCrypto API or throws a descriptive error. */
function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error(
      'Web Crypto API (crypto.subtle) is not available in this runtime'
    )
  }
  return subtle
}

function toBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = ''
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function createRandomSalt(): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(SALT_LENGTH_BYTES)
  const bytes = new Uint8Array(buffer)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

/** Derives the raw PBKDF2-SHA256 hash bytes for a password/salt pair. */
async function deriveHashBytes(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<Uint8Array<ArrayBuffer>> {
  const subtle = getSubtleCrypto()
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    keyMaterial,
    HASH_LENGTH_BYTES * 8
  )
  return new Uint8Array(bits)
}

/** Length-independent byte comparison to avoid leaking equality timing. */
function constantTimeEquals(
  a: Uint8Array<ArrayBuffer>,
  b: Uint8Array<ArrayBuffer>
): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0)
  }
  return difference === 0
}

/** Hashes a plaintext password into a storable `pbkdf2-sha256$…` string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = createRandomSalt()
  const hashBytes = await deriveHashBytes(password, salt, PBKDF2_ITERATIONS)
  return `${HASH_ALGORITHM_PREFIX}$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hashBytes)}`
}

/** Verifies a plaintext password against a stored hash string. */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [prefix, iterationsRaw, saltBase64, hashBase64] = storedHash.split('$')
  const iterations = Number(iterationsRaw)
  if (
    prefix !== HASH_ALGORITHM_PREFIX ||
    !saltBase64 ||
    !hashBase64 ||
    !Number.isInteger(iterations) ||
    iterations <= 0
  ) {
    return false
  }

  const salt = fromBase64(saltBase64)
  const expected = fromBase64(hashBase64)
  const actual = await deriveHashBytes(password, salt, iterations)
  return constantTimeEquals(actual, expected)
}

/** Returns true when the password satisfies the minimum policy. */
export function isPasswordValid(password: string): boolean {
  return password.trim().length >= MIN_PASSWORD_LENGTH
}
