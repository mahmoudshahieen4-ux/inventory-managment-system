import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'

import { hashPassword } from '@/services/password-crypto'
import type { AuthAccount } from '@/types/auth'
import { DEFAULT_CREDENTIALS, useAuthStore } from './useAuthStore'

// jsdom's crypto implementation lacks crypto.subtle; swap in Node's WebCrypto
// so the real PBKDF2 hashing runs during tests.
vi.stubGlobal('crypto', webcrypto)

const NOW = '2026-01-01T00:00:00.000Z'

async function buildAccount(
  overrides: Partial<AuthAccount> & { password: string }
): Promise<AuthAccount> {
  const { password, ...rest } = overrides
  return {
    id: rest.id ?? 'account-1',
    username: rest.username ?? 'admin',
    displayName: rest.displayName ?? 'Admin',
    role: rest.role ?? 'ADMIN',
    passwordHash: await hashPassword(password),
    createdAt: NOW,
    updatedAt: NOW,
  }
}

async function seedAccounts(accounts: AuthAccount[]): Promise<void> {
  useAuthStore.setState({
    accounts,
    users: accounts.map(account => ({
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      role: account.role,
    })),
    currentUser: null,
    status: 'IDLE',
    error: null,
    isInitializing: false,
  })
}

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({
      accounts: [],
      users: [],
      currentUser: null,
      status: 'IDLE',
      error: null,
      isInitializing: false,
    })
  })

  it('logs in with valid credentials and persists the session', async () => {
    await seedAccounts([await buildAccount({ password: 'admin123' })])

    const ok = await useAuthStore.getState().login('admin', 'admin123')

    expect(ok).toBe(true)
    const state = useAuthStore.getState()
    expect(state.status).toBe('AUTHENTICATED')
    expect(state.currentUser?.username).toBe('admin')
    expect(state.currentUser).not.toHaveProperty('passwordHash')
    expect(state.error).toBeNull()
    const session = JSON.parse(
      localStorage.getItem('pos.auth.session.v1') ?? 'null'
    )
    expect(session?.userId).toBe(state.currentUser?.id)
  })

  it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
    await seedAccounts([await buildAccount({ password: 'admin123' })])

    const ok = await useAuthStore.getState().login('admin', 'wrong')

    expect(ok).toBe(false)
    expect(useAuthStore.getState().status).toBe('IDLE')
    expect(useAuthStore.getState().error?.code).toBe('INVALID_CREDENTIALS')
  })

  it('rejects an unknown username with INVALID_CREDENTIALS', async () => {
    await seedAccounts([await buildAccount({ password: 'admin123' })])

    const ok = await useAuthStore.getState().login('ghost', 'admin123')

    expect(ok).toBe(false)
    expect(useAuthStore.getState().error?.code).toBe('INVALID_CREDENTIALS')
  })

  it('matches usernames case-insensitively and trims whitespace', async () => {
    await seedAccounts([await buildAccount({ password: 'admin123' })])

    const ok = await useAuthStore.getState().login('  ADMIN ', 'admin123')

    expect(ok).toBe(true)
  })

  it('clears the session on logout', async () => {
    await seedAccounts([await buildAccount({ password: 'admin123' })])
    await useAuthStore.getState().login('admin', 'admin123')

    useAuthStore.getState().logout()

    expect(useAuthStore.getState().currentUser).toBeNull()
    expect(useAuthStore.getState().status).toBe('IDLE')
    expect(localStorage.getItem('pos.auth.session.v1')).toBeNull()
  })

  it('changes own password only after verifying the current one', async () => {
    await seedAccounts([await buildAccount({ password: 'admin123' })])
    await useAuthStore.getState().login('admin', 'admin123')

    const wrong = await useAuthStore
      .getState()
      .changeOwnPassword('nope', 'newpass')
    expect(wrong).toBe(false)
    expect(useAuthStore.getState().error?.code).toBe('WRONG_PASSWORD')

    const ok = await useAuthStore
      .getState()
      .changeOwnPassword('admin123', 'newpass')
    expect(ok).toBe(true)

    await useAuthStore.getState().logout()
    const reLogin = await useAuthStore.getState().login('admin', 'newpass')
    expect(reLogin).toBe(true)
  })

  it('rejects weak or identical new passwords', async () => {
    await seedAccounts([await buildAccount({ password: 'admin123' })])
    await useAuthStore.getState().login('admin', 'admin123')

    const weak = await useAuthStore
      .getState()
      .changeOwnPassword('admin123', 'ab')
    expect(weak).toBe(false)
    expect(useAuthStore.getState().error?.code).toBe('WEAK_PASSWORD')

    const same = await useAuthStore
      .getState()
      .changeOwnPassword('admin123', 'admin123')
    expect(same).toBe(false)
    expect(useAuthStore.getState().error?.code).toBe('SAME_PASSWORD')
  })

  it('lets an ADMIN reset another password but blocks CASHIER', async () => {
    const admin = await buildAccount({ id: 'admin-id', password: 'admin123' })
    const cashier = await buildAccount({
      id: 'cashier-id',
      username: 'cashier',
      displayName: 'Cashier',
      role: 'CASHIER',
      password: 'cashier123',
    })
    await seedAccounts([admin, cashier])

    useAuthStore.setState({
      currentUser: {
        id: 'cashier-id',
        username: 'cashier',
        displayName: 'Cashier',
        role: 'CASHIER',
      },
    })
    const forbidden = await useAuthStore
      .getState()
      .changeUserPassword('admin-id', 'hacked1')
    expect(forbidden).toBe(false)
    expect(useAuthStore.getState().error?.code).toBe('FORBIDDEN')

    useAuthStore.setState({
      currentUser: {
        id: 'admin-id',
        username: 'admin',
        displayName: 'Admin',
        role: 'ADMIN',
      },
    })
    const ok = await useAuthStore
      .getState()
      .changeUserPassword('cashier-id', 'newpass')
    expect(ok).toBe(true)

    await useAuthStore.getState().logout()
    const reLogin = await useAuthStore.getState().login('cashier', 'newpass')
    expect(reLogin).toBe(true)
  })

  it('seeds default accounts and restores a saved session on hydrate', async () => {
    await useAuthStore.getState().hydrate()
    const seeded = useAuthStore.getState().accounts
    expect(seeded).toHaveLength(2)
    expect(useAuthStore.getState().currentUser).toBeNull()

    const admin = seeded.find(account => account.role === 'ADMIN')
    localStorage.setItem(
      'pos.auth.session.v1',
      JSON.stringify({ userId: admin?.id, loginAt: NOW })
    )
    await useAuthStore.getState().hydrate()

    expect(useAuthStore.getState().currentUser?.role).toBe('ADMIN')
    expect(useAuthStore.getState().status).toBe('AUTHENTICATED')
  })

  it('seeds the expected default usernames', async () => {
    await useAuthStore.getState().hydrate()

    const usernames = useAuthStore
      .getState()
      .users.map(user => user.username)
      .sort()
    expect(usernames).toEqual([
      DEFAULT_CREDENTIALS.ADMIN.username,
      DEFAULT_CREDENTIALS.CASHIER.username,
    ])
  })
})
