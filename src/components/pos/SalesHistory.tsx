import { History, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money'
import { formatTransactionTimestamp } from '@/lib/date-time'
import { useSalesStore } from '@/store/useSalesStore'
import { Input } from '@/components/ui/input'
import type { Sale } from '@/types/sales'

interface SalesHistoryProps {
  /** Called with the stored sale to re-open its receipt for printing. */
  onReprint: (sale: Sale) => void
  onReturn: (sale: Sale) => void
}

/** Completed sales list; each stored invoice can be re-printed from here. */
export function SalesHistory({ onReprint, onReturn }: SalesHistoryProps) {
  const { t } = useTranslation()
  const sales = useSalesStore(state => state.sales)
  const [search, setSearch] = useState('')
  const normalizedSearch = search.trim().toLowerCase()
  const filteredSales = sales.filter(sale =>
    sale.invoiceNumber.toLowerCase().includes(normalizedSearch)
  )

  if (sales.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 text-sm">
        <History className="size-6" />
        {t('pos.history.empty')}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Input
        value={search}
        onChange={event => setSearch(event.target.value)}
        placeholder={t('pos.history.searchPlaceholder')}
        aria-label={t('pos.history.searchLabel')}
      />
      <ul className="min-h-0 w-full min-w-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pb-1">
        {filteredSales.map(sale => (
          <li
            key={sale.id}
            className="flex items-center justify-between gap-4 rounded-lg border p-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{sale.invoiceNumber}</p>
              <p className="text-muted-foreground text-xs">
                {formatTransactionTimestamp(sale.createdAt)} ·{' '}
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => onReturn(sale)}
              >
                <RotateCcw className="size-3.5" />
                {t('pos.history.return')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
