import { useState } from 'react'
import type { FormEvent } from 'react'
import { KeyRound, Loader2, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuthStore } from '@/store/useAuthStore'
import { useUIStore } from '@/store/ui-store'
import type { AuthErrorCode } from '@/types/auth'
import { SettingsField, SettingsSection } from '../shared/SettingsComponents'

type SecurityError = AuthErrorCode | 'MISMATCH'

/**
 * Security preferences: session overview with logout, self-service password
 * change, and — for admins — resetting worker (cashier) passwords.
 */
export function SecurityPane() {
  const { t } = useTranslation()
  const currentUser = useAuthStore(state => state.currentUser)
  const users = useAuthStore(state => state.users)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSavingOwn, setIsSavingOwn] = useState(false)

  const [targetUserId, setTargetUserId] = useState('')
  const [workerPassword, setWorkerPassword] = useState('')
  const [isSavingWorker, setIsSavingWorker] = useState(false)

  if (!currentUser) return null

  const isAdmin = currentUser.role === 'ADMIN'
  const otherUsers = users.filter(user => user.id !== currentUser.id)

  const showError = (code: SecurityError) => {
    toast.error(
      code === 'MISMATCH'
        ? t('preferences.security.toast.mismatch')
        : t(`auth.errors.${code}`)
    )
  }

  const handleChangeOwnPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (newPassword !== confirmPassword) {
      showError('MISMATCH')
      return
    }
    setIsSavingOwn(true)
    try {
      const ok = await useAuthStore
        .getState()
        .changeOwnPassword(currentPassword, newPassword)
      if (ok) {
        toast.success(t('preferences.security.toast.passwordChanged'))
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        showError(useAuthStore.getState().error?.code ?? 'DB_UNAVAILABLE')
      }
    } finally {
      setIsSavingOwn(false)
    }
  }

  const handleChangeWorkerPassword = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault()
    if (!targetUserId) return
    setIsSavingWorker(true)
    try {
      const ok = await useAuthStore
        .getState()
        .changeUserPassword(targetUserId, workerPassword)
      if (ok) {
        toast.success(t('preferences.security.toast.passwordChanged'))
        setWorkerPassword('')
      } else {
        showError(useAuthStore.getState().error?.code ?? 'DB_UNAVAILABLE')
      }
    } finally {
      setIsSavingWorker(false)
    }
  }

  const handleLogout = () => {
    useUIStore.getState().setPreferencesOpen(false)
    useAuthStore.getState().logout()
  }

  const roleLabel =
    currentUser.role === 'ADMIN' ? t('auth.role.admin') : t('auth.role.cashier')

  return (
    <div className="space-y-6">
      <SettingsSection title={t('preferences.security.session.title')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t('preferences.security.session.signedInAs')}
            </span>
            <span className="text-sm font-medium">
              {currentUser.displayName}
            </span>
            <Badge variant="secondary">{roleLabel}</Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="gap-2"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {t('preferences.security.session.logout')}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title={t('preferences.security.own.title')}>
        <form onSubmit={handleChangeOwnPassword} className="space-y-4">
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
          <Button
            type="submit"
            size="sm"
            disabled={isSavingOwn}
            className="gap-2"
          >
            {isSavingOwn ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound className="size-4" aria-hidden="true" />
            )}
            {t('preferences.security.own.save')}
          </Button>
        </form>
      </SettingsSection>

      {isAdmin && otherUsers.length > 0 && (
        <SettingsSection title={t('preferences.security.workers.title')}>
          <form onSubmit={handleChangeWorkerPassword} className="space-y-4">
            <SettingsField
              label={t('preferences.security.workers.account')}
              description={t('preferences.security.workers.description')}
            >
              <Select value={targetUserId} onValueChange={setTargetUserId}>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={t('preferences.security.workers.account')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {otherUsers.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.displayName} ({user.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsField>
            <SettingsField label={t('preferences.security.workers.new')}>
              <Input
                type="password"
                dir="ltr"
                autoComplete="new-password"
                value={workerPassword}
                onChange={event => setWorkerPassword(event.target.value)}
                required
              />
            </SettingsField>
            <Button
              type="submit"
              size="sm"
              disabled={isSavingWorker || !targetUserId}
              className="gap-2"
            >
              {isSavingWorker ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound className="size-4" aria-hidden="true" />
              )}
              {t('preferences.security.workers.save')}
            </Button>
          </form>
        </SettingsSection>
      )}
    </div>
  )
}
