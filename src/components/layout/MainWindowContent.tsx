import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import {
  LicenseLockModal,
  TrialBanner,
  useLicenseGuard,
} from '@/components/auth'
import { InventoryView } from '@/components/inventory'
import { PayrollView } from '@/components/payroll'
import { POSScreen } from '@/components/pos'
import { useAppBootstrap } from '@/services/bootstrap'
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
  const licenseInitialized = useLicenseStore(state => state.initialized)
  const licenseStatus = useLicenseStore(state => state.status)

  // Load persisted SQLite data into the stores on startup (desktop only).
  useAppBootstrap()
  // License initialization + hourly expiration checks (desktop only).
  useLicenseGuard()

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
        <>
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
                  {activeView === 'pos' ? (
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
        </>
      )}
    </div>
  )
}
