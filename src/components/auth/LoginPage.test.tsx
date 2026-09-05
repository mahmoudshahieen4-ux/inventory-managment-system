import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { webcrypto } from 'node:crypto'

import { hashPassword } from '@/services/password-crypto'
import { render, screen, waitFor } from '@/test/test-utils'
import { useAuthStore } from '@/store/useAuthStore'
import { LoginPage } from './LoginPage'

// jsdom's crypto implementation lacks crypto.subtle; swap in Node's WebCrypto
// so the real PBKDF2 hashing runs during tests.
vi.stubGlobal('crypto', webcrypto)

const NOW = '2026-01-01T00:00:00.000Z'

async function seedAccounts(): Promise<void> {
  const [adminHash, cashierHash] = await Promise.all([
    hashPassword('admin123'),
    hashPassword('cashier123'),
  ])
  useAuthStore.setState({
    accounts: [
      {
        id: 'admin-id',
        username: 'admin',
        displayName: 'Admin',
        role: 'ADMIN',
        passwordHash: adminHash,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'cashier-id',
        username: 'cashier',
        displayName: 'Cashier',
        role: 'CASHIER',
        passwordHash: cashierHash,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    users: [
      {
        id: 'admin-id',
        username: 'admin',
        displayName: 'Admin',
        role: 'ADMIN',
      },
      {
        id: 'cashier-id',
        username: 'cashier',
        displayName: 'Cashier',
        role: 'CASHIER',
      },
    ],
    currentUser: null,
    status: 'IDLE',
    error: null,
    isInitializing: false,
  })
}

describe('LoginPage', () => {
  beforeEach(async () => {
    localStorage.clear()
    await seedAccounts()
  })

  it('renders the account type and password fields', () => {
    render(<LoginPage />)

    // The username is derived from the selected role — there is no
    // username input on the form anymore.
    expect(screen.getByLabelText(/account type/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toHaveValue('')
  })

  it('signs in as cashier when the account type changes', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.click(screen.getByLabelText(/account type/i))
    await user.click(await screen.findByRole('option', { name: /cashier/i }))

    await user.type(screen.getByLabelText(/^password$/i), 'cashier123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(useAuthStore.getState().currentUser?.username).toBe('cashier')
    })
  })

  it('toggles password visibility', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    const passwordInput = screen.getByLabelText(/^password$/i)
    await user.type(passwordInput, 'admin123')
    expect(passwordInput).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: /show password/i }))
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: /hide password/i }))
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute(
      'type',
      'password'
    )
  })

  it('shows an error message for wrong credentials', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText(/^password$/i), 'wrong-pass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect username or password'
    )
  })

  it('signs in with valid credentials', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText(/^password$/i), 'admin123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(useAuthStore.getState().currentUser?.username).toBe('admin')
    })
    expect(useAuthStore.getState().status).toBe('AUTHENTICATED')
  })
})
