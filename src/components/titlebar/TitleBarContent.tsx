import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/useAuthStore'
import { useTheme } from '@/hooks/use-theme'
import { executeCommand, useCommandContext } from '@/lib/commands'
import {
  LogOut,
  Settings,
  Shield,
  ShieldCheck,
  Moon,
  Sun,
  Store,
} from 'lucide-react'

/** Place this after window controls on macOS, or at the start on Windows/Linux. */
export function TitleBarLeftActions() {
  return (
    <div className="flex items-center gap-1">
      <div className="mr-2 flex items-center gap-1.5 px-1 text-primary">
        <Store className="size-4" aria-hidden="true" />
        <span className="text-xs font-bold tracking-wide">Hypeer Market</span>
      </div>
    </div>
  )
}

/**
 * Role switch control shown in the title bar.
 * Toggles between ADMIN and CASHIER for testing RBAC.
 */
export function UserSessionBadge() {
  const { t } = useTranslation()
  const currentUser = useAuthStore(state => state.currentUser)
  if (!currentUser) return null

  const roleLabel =
    currentUser.role === 'ADMIN' ? t('auth.role.admin') : t('auth.role.cashier')
  const RoleIcon = currentUser.role === 'ADMIN' ? ShieldCheck : Shield

  return (
    <Button
      onClick={() => useAuthStore.getState().logout()}
      variant="ghost"
      size="sm"
      className="h-6 gap-1 text-foreground/70 hover:text-foreground"
      aria-label={t('auth.logout.action', { name: currentUser.displayName })}
      title={t('auth.logout.action', { name: currentUser.displayName })}
    >
      <RoleIcon className="size-3.5" />
      <span>{roleLabel}</span>
      <LogOut className="size-3" />
    </Button>
  )
}

/** Place this before window controls on Windows, or at the end on macOS/Linux. */
export function TitleBarRightActions() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const commandContext = useCommandContext()

  const handleOpenPreferences = async () => {
    const result = await executeCommand('open-preferences', commandContext)
    if (!result.success && result.error) {
      commandContext.showToast(result.error, 'error')
    }
  }

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <div className="flex items-center gap-1">
      <UserSessionBadge />

      <Button
        onClick={toggleTheme}
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-foreground/70 hover:text-foreground"
        aria-label={t(
          theme === 'dark' ? 'titlebar.switchToLight' : 'titlebar.switchToDark'
        )}
        title={t(
          theme === 'dark' ? 'titlebar.switchToLight' : 'titlebar.switchToDark'
        )}
      >
        {theme === 'dark' ? (
          <Sun className="h-3 w-3" />
        ) : (
          <Moon className="h-3 w-3" />
        )}
      </Button>

      <Button
        onClick={handleOpenPreferences}
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-foreground/70 hover:text-foreground"
        title={t('titlebar.settings')}
      >
        <Settings className="h-3 w-3" />
      </Button>
    </div>
  )
}

interface TitleBarTitleProps {
  title?: string
}

/**
 * Centered title for the title bar.
 * Uses absolute positioning to stay centered regardless of other content.
 */
export function TitleBarTitle({ title = 'Tauri App' }: TitleBarTitleProps) {
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <span className="text-sm font-medium text-foreground/80">{title}</span>
    </div>
  )
}

/**
 * Combined toolbar content for simple layouts.
 * Use this for Linux or when you want all toolbar items in one fragment.
 *
 * For more control, use TitleBarLeftActions, TitleBarRightActions, and TitleBarTitle separately.
 */
export function TitleBarContent({ title = 'Tauri App' }: TitleBarTitleProps) {
  return (
    <>
      <TitleBarLeftActions />
      <TitleBarTitle title={title} />
      <TitleBarRightActions />
    </>
  )
}
