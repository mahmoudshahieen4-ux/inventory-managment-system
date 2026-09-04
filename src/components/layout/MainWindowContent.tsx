import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { canAccessView } from '@/lib/permissions'
import {
  AuthGate,
  LicenseLockModal,
  TrialBanner,
  useLicenseGuard,
} from '@/components/auth'
import { InventoryView } from '@/components/inventory'
import { PayrollView } from '@/components/payroll'
import { POSScreen } from '@/components/pos'
import { useAppBootstrap } from '@/services/bootstrap'
import { useAuthStore } from '@/store/useAuthStore'
import { useLicenseStore } from '@/store/useLicenseStore'
import { useUIStore } from '@/store/ui-store'
import { ViewSwitcher } from './ViewSwitcher'

interface MainWindowContentProps {
  children?: React.ReactNode
  className?: string
}

export function MainWindowContent({
  children,
  className,
}: MainWindowContentProps) {
  const { t } = useTranslation()
  const activeView = useUIStore(state => state.activeView)
  const isDbInitializing = useUIStore(state => state.isDbInitializing)
  const currentUser = useAuthStore(state => state.currentUser)
  const licenseInitialized = useLicenseStore(state => state.initialized)
  const licenseStatus = useLicenseStore(state => state.status)

  // Load persisted SQLite data into the stores on startup (desktop only).
  useAppBootstrap()
  // License initialization + hourly expiration checks (desktop only).
  useLicenseGuard()

  // RBAC gate: cashiers may only open the POS view. If the active view is
  // not allowed (e.g. after logging in with a restricted account), fall back
  // to POS immediately and correct the stored view.
  const canAccessActiveView = currentUser
    ? canAccessView(currentUser.role, activeView)
    : false

  useEffect(() => {
    if (currentUser && !canAccessActiveView) {
      useUIStore.getState().setActiveView('pos')
    }
  }, [currentUser, canAccessActiveView])

  const isLicensed = licenseStatus === 'ACTIVE' || licenseStatus === 'TRIAL'
  const isTrial = licenseStatus === 'TRIAL'

  return (
    <div
      className={cn(
        'flex h-full min-h-screen w-full flex-1 flex-col overflow-x-hidden bg-background p-4',
        className
      )}
    >
      {children || (
        <AuthGate>
          <div className="border-b px-3 py-2 sm:px-4">
            <ViewSwitcher />
          </div>
          <div className="min-h-0 flex-1">
            {isDbInitializing || !licenseInitialized ? (
              <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
                <Loader2 className="size-6 animate-spin" />
                <p className="text-sm">{t('db.loading')}</p>
              </div>
            ) : !isLicensed ? (
              <LicenseLockModal />
            ) : (
              <div className="flex h-full flex-col">
                {isTrial && <TrialBanner />}
                <div className="min-h-0 flex-1">
                  {!canAccessActiveView || activeView === 'pos' ? (
                    <POSScreen />
                  ) : activeView === 'payroll' ? (
                    <PayrollView />
                  ) : (
                    <InventoryView />
                  )}
                </div>
              </div>
            )}
          </div>
        </AuthGate>
      )}
    </div>
  )
}
