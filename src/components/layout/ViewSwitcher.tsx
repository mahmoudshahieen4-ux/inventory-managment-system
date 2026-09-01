import { Boxes, ShoppingCart } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUIStore } from '@/store/ui-store'

/** Main navigation: centered tabs with an accent underline on the active view. */
export function ViewSwitcher() {
  const { t } = useTranslation()
  const activeView = useUIStore(state => state.activeView)

  return (
    <div className="flex justify-center px-4 pt-1">
      <Tabs
        value={activeView}
        onValueChange={value =>
          useUIStore.getState().setActiveView(value as 'inventory' | 'pos')
        }
      >
        <TabsList>
          <TabsTrigger value="inventory">
            <Boxes className="size-4" />
            {t('nav.inventory')}
          </TabsTrigger>
          <TabsTrigger value="pos">
            <ShoppingCart className="size-4" />
            {t('nav.pos')}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
}
