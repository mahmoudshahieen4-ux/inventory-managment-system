import { render, screen } from '@/test/test-utils'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore } from '@/store/useAuthStore'
import App from './App'

// Tauri bindings are mocked globally in src/test/setup.ts

describe('App', () => {
  beforeEach(() => {
    // The app sits behind the AuthGate; seed an authenticated admin so the
    // main window layout renders instead of the login page. The store's
    // hydrate() is disabled because it would recreate the in-memory default
    // accounts and drop the seeded session in the test environment.
    useAuthStore.setState({
      currentUser: {
        id: 'user-admin',
        username: 'admin',
        displayName: 'Admin',
        role: 'ADMIN',
      },
      isInitializing: false,
      hydrate: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('renders main window layout', () => {
    render(<App />)
    // "Inventory" appears in both the view switcher and the inventory view title
    expect(screen.getAllByText('Inventory').length).toBeGreaterThan(0)
    expect(screen.getByText('POS')).toBeInTheDocument()
  })

  it('renders title bar with traffic light buttons', () => {
    render(<App />)
    // Find specifically the window control buttons in the title bar
    const titleBarButtons = screen
      .getAllByRole('button')
      .filter(
        button =>
          button.getAttribute('aria-label')?.includes('window') ||
          button.className.includes('window-control')
      )
    // Should have at least the window control buttons
    expect(titleBarButtons.length).toBeGreaterThan(0)
  })
})
