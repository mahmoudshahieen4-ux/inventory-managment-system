import {
  Copy,
  LockKeyhole,
  MessageCircle,
  Phone,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatLicenseKey } from '@/lib/license-key'
import { SUPPORT_INFO } from '@/lib/store-config'
import { getHardwareId, type HardwareId } from '@/services/hardware-id'
import { useLicenseStore } from '@/store/useLicenseStore'

interface LicenseLockModalProps {
  /**
   * When provided the overlay is dismissible (used from the trial banner).
   * Omit it for the non-dismissable full-screen lock state.
   */
  onClose?: () => void
}

/**
 * Full-screen lock overlay shown while the license status is UNREGISTERED or
 * EXPIRED. It blocks the whole application until a valid serial key is
 * activated. When `onClose` is provided the overlay becomes dismissible so it
 * can be re-used from the trial banner ("Buy Now / Activate").
 */
export function LicenseLockModal({ onClose }: LicenseLockModalProps) {
  const { t } = useTranslation()
  const status = useLicenseStore(state => state.status)
  const [hardware, setHardware] = useState<HardwareId | null>(null)
  const [key, setKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    void getHardwareId().then(setHardware)
  }, [])

  const isExpired = status === 'EXPIRED'

  const handleCopyHardwareId = async () => {
    if (!hardware) return
    try {
      await navigator.clipboard.writeText(hardware.displayId)
      toast.success(t('license.lock.copied'))
    } catch {
      // Clipboard unavailable (permissions) — nothing to do.
    }
  }

  const handleActivate = async () => {
    setSubmitting(true)
    setInvalid(false)
    const record = await useLicenseStore.getState().activate(key)
    setSubmitting(false)
    if (!record) setInvalid(true)
  }

  const handleStartTrial = () => {
    void useLicenseStore.getState().startTrial()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4">
      <div className="bg-card relative w-full max-w-md space-y-5 rounded-xl border p-6 shadow-lg">
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute end-4 top-4"
            aria-label={t('license.lock.close')}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        )}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="bg-muted flex size-12 items-center justify-center rounded-full">
            <LockKeyhole className="size-6" />
          </div>
          <h1 className="text-lg font-semibold">
            {isExpired
              ? t('license.lock.expiredTitle')
              : t('license.lock.title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isExpired
              ? t('license.lock.expiredDescription')
              : t('license.lock.description')}
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t('license.lock.hardwareId')}</p>
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
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="license-key-input">
            {t('license.lock.keyLabel')}
          </label>
          <Input
            id="license-key-input"
            value={key}
            onChange={event => setKey(formatLicenseKey(event.target.value))}
            placeholder={t('license.lock.keyPlaceholder')}
            className="text-center font-mono tracking-widest"
            aria-invalid={invalid}
          />
          {invalid && (
            <p className="text-sm text-red-500">
              {t('license.lock.error.invalid')}
            </p>
          )}
          <Button
            className="w-full"
            disabled={submitting}
            onClick={() => void handleActivate()}
          >
            <ShieldCheck className="size-4" />
            {t('license.lock.activate')}
          </Button>
        </div>

        {!isExpired && (
          <Button
            variant="outline"
            className="w-full"
            onClick={handleStartTrial}
          >
            {t('license.lock.trial')}
          </Button>
        )}

        <div className="border-t pt-4 text-center text-sm">
          <p className="text-muted-foreground">{t('license.lock.contact')}</p>
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
    </div>
  )
}
