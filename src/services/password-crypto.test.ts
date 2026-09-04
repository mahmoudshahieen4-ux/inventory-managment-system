import { describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'

import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  isPasswordValid,
  verifyPassword,
} from './password-crypto'

// jsdom's crypto implementation lacks crypto.subtle; swap in Node's WebCrypto.
vi.stubGlobal('crypto', webcrypto)

describe('password-crypto', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('s3cret-pass')

    expect(hash).toMatch(
      /^pbkdf2-sha256\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/
    )
    expect(await verifyPassword('s3cret-pass', hash)).toBe(true)
    expect(await verifyPassword('wrong-pass', hash)).toBe(false)
  })

  it('generates a unique salt for every hash', async () => {
    const [first, second] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ])

    expect(first).not.toBe(second)
    expect(await verifyPassword('same-password', first)).toBe(true)
    expect(await verifyPassword('same-password', second)).toBe(true)
  })

  it('returns false for malformed stored hashes', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('x', 'md5$1$abc$def')).toBe(false)
  })

  it('validates the minimum password length', () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThan(0)
    expect(isPasswordValid('abcd')).toBe(true)
    expect(isPasswordValid('abc')).toBe(false)
    expect(isPasswordValid('   abcd   ')).toBe(true)
  })
})
