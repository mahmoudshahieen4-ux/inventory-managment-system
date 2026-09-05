import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useLicenseStore } from '@/store/useLicenseStore'
import { LicenseLockModal } from './LicenseLockModal'

/**
 * Amber warning banner shown while an ACTIVE subscription is within its last
 * 3 days (`graceWarning` in the license store). It nudges the shop owner to
 * renew before the app locks and opens the (dismissable) activation overlay.
 */
export function GracePeriodBanner() {
  const { t } = useTranslation()
  const status = useLicenseStore(state => state.status)
  const graceWarning = useLicenseStore(state => state.graceWarning)
  const daysRemaining = useLicenseStore(state => state.daysRemaining)
  const [showActivation, setShowActivation] = useState(false)

  if (status !== 'ACTIVE' || !graceWarning) return null

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300"
    >
      <span className="inline-flex items-center gap-2 font-medium">
        <TriangleAlert className="size-4" />
        {t('license.banner.graceTitle')} ·{' '}
        {t('license.banner.graceRemaining', { days: daysRemaining ?? 0 })}
      </span>
      <Button
        size="sm"
        variant="default"
        onClick={() => setShowActivation(true)}
      >
        {t('license.banner.renewNow')}
      </Button>
      {showActivation && (
        <LicenseLockModal onClose={() => setShowActivation(false)} />
      )}
    </div>
  )
}
