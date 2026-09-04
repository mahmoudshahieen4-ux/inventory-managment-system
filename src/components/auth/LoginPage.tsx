import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  LogIn,
  TriangleAlert,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  InputGroup,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuthStore } from '@/store/useAuthStore'
import type { UserRole } from '@/types/auth'

/** Default username mapping used internally for authentication. */
const ROLE_USERNAME: Record<UserRole, string> = {
  ADMIN: 'admin',
  CASHIER: 'cashier',
}

export function LoginPage() {
  const { t } = useTranslation()
  const status = useAuthStore(state => state.status)
  const error = useAuthStore(state => state.error)

  const [role, setRole] = useState<UserRole>('ADMIN')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const isSubmitting = status === 'AUTHENTICATING'
  const errorMessage = error ? t(`auth.errors.${error.code}`) : null

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    // تمرير اسم المستخدم تلقائياً بناءً على الدور المختار
    const username = ROLE_USERNAME[role]
    void useAuthStore.getState().login(username, password)
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-b from-background to-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LockKeyhole className="size-6" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl">{t('auth.login.title')}</CardTitle>
          <CardDescription>{t('auth.login.description')}</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="space-y-4">
            {/* نوع الحساب */}
            <div className="space-y-2">
              <Label htmlFor="login-role">{t('auth.login.role')}</Label>
              <Select
                value={role}
                onValueChange={value => setRole(value as UserRole)}
                disabled={isSubmitting}
              >
                <SelectTrigger id="login-role" className="w-full">
                  <SelectValue placeholder={t('auth.login.role')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">{t('auth.role.admin')}</SelectItem>
                  <SelectItem value="CASHIER">
                    {t('auth.role.cashier')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* كلمة السر فقط */}
            <div className="space-y-2 pb-2">
              <Label htmlFor="login-password">{t('auth.login.password')}</Label>
              <InputGroup>
                <InputGroupInput
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete="current-password"
                  dir="ltr"
                  disabled={isSubmitting}
                />
                <InputGroupButton
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="me-1 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(previous => !previous)}
                  aria-label={
                    showPassword
                      ? t('auth.login.hidePassword')
                      : t('auth.login.showPassword')
                  }
                  aria-pressed={showPassword}
                  disabled={isSubmitting}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </InputGroupButton>
              </InputGroup>
            </div>

            {errorMessage && (
              <Alert variant="destructive">
                <TriangleAlert className="size-4" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter className="flex-col gap-3">
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || password.length === 0}
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogIn className="size-4" aria-hidden="true" />
              )}
              {isSubmitting
                ? t('auth.login.submitting')
                : t('auth.login.submit')}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {t('auth.login.defaultCredentialsHint')}
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
