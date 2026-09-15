import { useState } from 'react'
import type { FormEvent } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/useAuthStore'
import { SettingsField } from './shared/SettingsComponents'

interface ChangePasswordModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Self-service password change dialog (Preferences → Security).
 *
 * Flow: locally validate that the confirmation matches, then delegate to
 * `useAuthStore.changeOwnPassword` which verifies the current password against
 * the stored PBKDF2 hash in SQLite before persisting the new one. The form
 * resets whenever the dialog closes so a cancelled attempt never leaks typed
 * passwords into the next open.
 */
export function ChangePasswordModal({
  open,
  onOpenChange,
}: ChangePasswordModalProps) {
  const { t } = useTranslation()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  /** Resets the form on close so a cancelled attempt never leaks typed
   * passwords into the next open (event-driven — no effect needed). */
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setIsSaving(false)
    }
    onOpenChange(nextOpen)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error(t('preferences.security.toast.mismatch'))
      return
    }
    setIsSaving(true)
    try {
      const ok = await useAuthStore
        .getState()
        .changeOwnPassword(currentPassword, newPassword)
      if (ok) {
        toast.success(t('preferences.security.toast.passwordChanged'))
        handleOpenChange(false)
      } else {
        const code = useAuthStore.getState().error?.code ?? 'DB_UNAVAILABLE'
        toast.error(t(`auth.errors.${code}`))
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" aria-hidden="true" />
            {t('preferences.security.own.title')}
          </DialogTitle>
          <DialogDescription>
            {t('preferences.security.own.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <SettingsField label={t('preferences.security.own.current')}>
            <Input
              type="password"
              dir="ltr"
              autoComplete="current-password"
              value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)}
              required
            />
          </SettingsField>
          <SettingsField label={t('preferences.security.own.new')}>
            <Input
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              required
            />
          </SettingsField>
          <SettingsField label={t('preferences.security.own.confirm')}>
            <Input
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              required
            />
          </SettingsField>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSaving} className="gap-2">
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound className="size-4" aria-hidden="true" />
              )}
              {t('preferences.security.own.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
