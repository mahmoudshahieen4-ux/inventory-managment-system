import { History, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money'
import { useSalesStore } from '@/store/useSalesStore'
import type { Sale } from '@/types/sales'

interface SalesHistoryProps {
  /** Called with the stored sale to re-open its receipt for printing. */
  onReprint: (sale: Sale) => void
}

/** Completed sales list; each stored invoice can be re-printed from here. */
export function SalesHistory({ onReprint }: SalesHistoryProps) {
  const { t } = useTranslation()
  const sales = useSalesStore(state => state.sales)

  if (sales.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 text-sm">
        <History className="size-6" />
        {t('pos.history.empty')}
      </div>
    )
  }

  return (
    <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-1">
      {sales.map(sale => (
        <li
          key={sale.id}
          className="flex items-center justify-between gap-4 rounded-lg border p-4"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">{sale.invoiceNumber}</p>
            <p className="text-muted-foreground text-xs">
              {new Date(sale.createdAt).toLocaleString()} ·{' '}
              {t('pos.cart.itemsCount', { qty: sale.items.length })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-semibold">
              {formatMoney(sale.total)}
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-label={t('pos.history.reprintAria', {
                invoice: sale.invoiceNumber,
              })}
              onClick={() => onReprint(sale)}
            >
              <RotateCcw className="size-3.5" />
              {t('pos.history.reprint')}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
