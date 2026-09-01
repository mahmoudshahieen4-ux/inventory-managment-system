import { describe, it, expect, beforeEach } from 'vitest'

import { useAuthStore } from './useAuthStore'

describe('AuthStore', () => {
  beforeEach(() => {
    // Reset store state before each test (defaults to ADMIN)
    useAuthStore.setState({ role: 'ADMIN' })
  })

  it('defaults to the ADMIN role', () => {
    expect(useAuthStore.getState().role).toBe('ADMIN')
  })

  it('sets a role explicitly', () => {
    useAuthStore.getState().setRole('CASHIER')
    expect(useAuthStore.getState().role).toBe('CASHIER')

    useAuthStore.getState().setRole('ADMIN')
    expect(useAuthStore.getState().role).toBe('ADMIN')
  })

  it('toggles between ADMIN and CASHIER', () => {
    useAuthStore.getState().toggleRole()
    expect(useAuthStore.getState().role).toBe('CASHIER')

    useAuthStore.getState().toggleRole()
    expect(useAuthStore.getState().role).toBe('ADMIN')
  })
})
