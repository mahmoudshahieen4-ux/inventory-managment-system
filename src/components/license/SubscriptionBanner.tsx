import { Copy, MessageCircle, Phone, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SUPPORT_INFO } from '@/lib/store-config'
import { getHardwareId, type HardwareId } from '@/services/hardware-id'
import { useLicenseStore } from '@/store/useLicenseStore'

/** Renders a labeled value + optional trailing action, stacked in the modal. */
function DetailRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-sm">{label}</p>
      {children}
    </div>
  )
}

/**
 * Amber "subscription expiring soon" banner shown at the top of the main
 * layout while an ACTIVE subscription has `EXPIRING_SOON_DAYS` (3) or fewer
 * days left. Unlike the full-screen `LicenseLockModal` (which only appears for
 * EXPIRED / BLOCKED) this banner is non-blocking — the POS keeps working
 * while the shop owner is nudged to renew.
 */
export function SubscriptionBanner() {
  const { t } = useTranslation()
  const status = useLicenseStore(state => state.status)
  const isExpiringSoon = useLicenseStore(state => state.isExpiringSoon)
  const daysRemaining = useLicenseStore(state => state.daysRemaining)
  const expirationDate = useLicenseStore(state => state.expirationDate)
  const [showRenewal, setShowRenewal] = useState(false)
  const [hardware, setHardware] = useState<HardwareId | null>(null)

  useEffect(() => {
    void getHardwareId().then(setHardware)
  }, [])

  if (status !== 'ACTIVE' || !isExpiringSoon || daysRemaining === null) {
    return null
  }

  const handleCopyHardwareId = async () => {
    if (!hardware) return
    try {
      await navigator.clipboard.writeText(hardware.displayId)
      toast.success(t('license.lock.copied'))
    } catch {
      // Clipboard unavailable (permissions) — nothing to do.
    }
  }

  return (
    <>
      <div
        role="alert"
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300"
      >
        <span className="inline-flex items-center gap-2 font-medium">
          <TriangleAlert className="size-4" />
          {t('license.banner.expiringSoonMessage', { days: daysRemaining })}
        </span>
        <Button
          size="sm"
          variant="default"
          onClick={() => setShowRenewal(true)}
        >
          {t('license.banner.renewNowContact')}
        </Button>
      </div>

      <Dialog open={showRenewal} onOpenChange={setShowRenewal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('license.renewal.title')}</DialogTitle>
            <DialogDescription>
              {t('license.renewal.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <DetailRow label={t('license.lock.hardwareId')}>
              <div className="flex items-center gap-2">
                <code className="bg-muted flex-1 rounded-md px-3 py-2 text-center font-mono text-sm tracking-widest">
                  {hardware?.displayId ?? '····-····-····-····'}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('license.lock.copyHardwareId')}
                  disabled={!hardware}
                  onClick={() => void handleCopyHardwareId()}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </DetailRow>

            {expirationDate && (
              <DetailRow label={t('license.renewal.expiresOn')}>
                <p className="text-sm font-medium">
                  {new Date(expirationDate).toLocaleDateString()}
                </p>
              </DetailRow>
            )}

            <DetailRow label={t('license.renewal.daysLeft')}>
              <p className="text-sm font-medium">
                {t('license.renewal.daysLeftValue', {
                  count: daysRemaining,
                  days: daysRemaining,
                })}
              </p>
            </DetailRow>

            <div className="border-t pt-4 text-center text-sm">
              <p className="text-muted-foreground">
                {t('license.lock.contact')}
              </p>
              <div className="mt-2 flex items-center justify-center gap-3">
                <a
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 hover:underline"
                  href={SUPPORT_INFO.whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-4" />
                  {t('license.lock.whatsapp')}
                </a>
                <span className="text-muted-foreground inline-flex items-center gap-1.5">
                  <Phone className="size-4" />
                  {SUPPORT_INFO.phone}
                </span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
