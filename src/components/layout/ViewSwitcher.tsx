import { Boxes, ShoppingCart, UsersRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthStore } from '@/store/useAuthStore'
import { useUIStore } from '@/store/ui-store'

/** Main navigation: centered tabs with an accent underline on the active view. */
export function ViewSwitcher() {
  const { t } = useTranslation()
  const activeView = useUIStore(state => state.activeView)
  const currentUser = useAuthStore(state => state.currentUser)
  const role = currentUser?.role
  const isAdmin = role === 'ADMIN'

  return (
    <div className="flex justify-center px-4 pt-1">
      <Tabs
        value={activeView}
        onValueChange={value =>
          useUIStore
            .getState()
            .setActiveView(value as 'inventory' | 'pos' | 'payroll')
        }
      >
        <TabsList>
          {isAdmin && (
            <TabsTrigger value="inventory" className="px-4">
              <Boxes className="size-4" />
              {t('nav.inventory')}
            </TabsTrigger>
          )}
          <TabsTrigger value="pos" className="px-4">
            <ShoppingCart className="size-4" />
            {t('nav.pos')}
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="payroll" className="px-4">
              <UsersRound className="size-4" />
              {t('nav.payroll')}
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>
    </div>
  )
}
