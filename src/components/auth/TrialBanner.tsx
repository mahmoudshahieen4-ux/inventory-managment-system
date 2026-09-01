import { Hourglass, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useLicenseStore } from '@/store/useLicenseStore'
import { LicenseLockModal } from './LicenseLockModal'

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
/** Refresh the countdown display once a minute. */
const COUNTDOWN_TICK_MS = 60_000

function formatRemaining(
  expirationDate: string,
  now: number
): {
  days: number
  hours: number
} {
  const remainingMs = Math.max(0, Date.parse(expirationDate) - now)
  return {
    days: Math.floor(remainingMs / DAY_MS),
    hours: Math.floor((remainingMs % DAY_MS) / HOUR_MS),
  }
}

/**
 * Slim top banner shown while the app runs in its free-trial mode. It displays
 * the remaining trial time and a "Buy Now / Activate" button that opens the
 * (dismissable) activation overlay.
 */
export function TrialBanner() {
  const { t } = useTranslation()
  const status = useLicenseStore(state => state.status)
  const trialExpirationDate = useLicenseStore(
    state => state.trialExpirationDate
  )
  const [now, setNow] = useState(() => Date.now())
  const [showActivation, setShowActivation] = useState(false)

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setNow(Date.now()),
      COUNTDOWN_TICK_MS
    )
    return () => window.clearInterval(intervalId)
  }, [])

  if (status !== 'TRIAL' || !trialExpirationDate) return null

  const { days, hours } = formatRemaining(trialExpirationDate, now)

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b bg-sky-500/10 px-4 py-2 text-sm text-sky-700 dark:text-sky-300"
    >
      <span className="inline-flex items-center gap-2 font-medium">
        <Hourglass className="size-4" />
        {t('license.banner.title')} ·{' '}
        {t('license.banner.remaining', { days, hours })}
      </span>
      <Button
        size="sm"
        variant="default"
        onClick={() => setShowActivation(true)}
      >
        <KeyRound className="size-4" />
        {t('license.banner.buyNow')}
      </Button>
      {showActivation && (
        <LicenseLockModal onClose={() => setShowActivation(false)} />
      )}
    </div>
  )
}
