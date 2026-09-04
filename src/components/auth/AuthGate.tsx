import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useAuthStore } from '@/store/useAuthStore'
import { LoginPage } from './LoginPage'

/** Ensures the session restore effect only runs once per app launch. */
let hasStartedHydration = false

interface AuthGateProps {
  children: ReactNode
}

/**
 * Authentication boundary for the whole app. Restores the persisted session
 * on mount, shows the login page while signed out, and renders children once
 * a user is authenticated.
 */
export function AuthGate({ children }: AuthGateProps) {
  const { t } = useTranslation()
  const isInitializing = useAuthStore(state => state.isInitializing)
  const currentUser = useAuthStore(state => state.currentUser)

  useEffect(() => {
    if (hasStartedHydration) return
    hasStartedHydration = true
    void useAuthStore.getState().hydrate()
  }, [])

  if (isInitializing) {
    return (
      <div className="flex h-full min-h-screen flex-col items-center justify-center gap-2">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {t('auth.loadingSession')}
        </p>
      </div>
    )
  }

  if (!currentUser) {
    return <LoginPage />
  }

  return <>{children}</>
}
