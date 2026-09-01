import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { UserRole } from '@/types/auth'

interface AuthState {
  /** Currently active user role. Defaults to ADMIN for testing. */
  role: UserRole
  setRole: (role: UserRole) => void
  toggleRole: () => void
}

export const useAuthStore = create<AuthState>()(
  devtools(
    set => ({
      role: 'ADMIN',

      setRole: role => set({ role }, undefined, 'auth/setRole'),

      toggleRole: () =>
        set(
          state => ({ role: state.role === 'ADMIN' ? 'CASHIER' : 'ADMIN' }),
          undefined,
          'auth/toggleRole'
        ),
    }),
    { name: 'auth-store' }
  )
)
