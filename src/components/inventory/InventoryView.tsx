import { useTranslation } from 'react-i18next'

import { InventoryTable } from './InventoryTable'

/** Scrollable page wrapper for the inventory screen (fade-in on load). */
export function InventoryView() {
  const { t } = useTranslation()

  return (
    <div className="animate-fade-in h-full min-h-0 w-full overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
      <h1 className="sr-only">{t('inventory.title')}</h1>
      <InventoryTable />
    </div>
  )
}
