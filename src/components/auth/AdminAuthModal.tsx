import { useState } from 'react'
import type { FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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
import { Label } from '@/components/ui/label'

/**
 * Master passcode that unlocks the application for on-site maintenance.
 * Kept in the source deliberately: it is a vendor/owner override, not an
 * end-user credential (regular accounts live in the auth store).
 */
export const ADMIN_PASSCODE = '124171193811177'

interface AdminAuthModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once the passcode is accepted (before the dialog closes). */
  onAuthenticated?: () => void
}

/**
 * Small passcode dialog used from the license lock screen. Entering the correct
 * master passcode calls `onAuthenticated` so the caller can grant an admin
 * override; a wrong passcode shows an inline error and keeps the dialog open.
 */
export function AdminAuthModal({
  open,
  onOpenChange,
  onAuthenticated,
}: AdminAuthModalProps) {
  const { t } = useTranslation()
  const [passcode, setPasscode] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)

  // Reset the field each time the dialog re-opens. Adjusting state during
  // render (React's "you might not need an effect" pattern) avoids a cascading
  // re-render and keeps a stale passcode from leaking between opens.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setPasscode('')
      setInvalid(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (passcode.trim() !== ADMIN_PASSCODE) {
      setInvalid(true)
      return
    }
    onAuthenticated?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" aria-hidden="true" />
            {t('admin.auth.title')}
          </DialogTitle>
          <DialogDescription>{t('admin.auth.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="admin-passcode">
              {t('admin.auth.passcodeLabel')}
            </Label>
            <Input
              id="admin-passcode"
              type="password"
              dir="ltr"
              autoComplete="off"
              autoFocus
              value={passcode}
              onChange={event => {
                setPasscode(event.target.value)
                if (invalid) setInvalid(false)
              }}
              placeholder={t('admin.auth.passcodePlaceholder')}
              aria-invalid={invalid}
            />
            {invalid && (
              <p className="text-destructive text-sm">
                {t('admin.auth.error.invalid')}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="gap-2">
              <ShieldCheck className="size-4" aria-hidden="true" />
              {t('admin.auth.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
