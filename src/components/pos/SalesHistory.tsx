import { History, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money'
import { formatTransactionTimestamp } from '@/lib/date-time'
import { useSalesStore } from '@/store/useSalesStore'
import { Input } from '@/components/ui/input'
import type { Sale } from '@/types/sales'
import type { TimeRange } from '@/types/analytics'
import { cutoffForRange, timeRangeLabelKeys } from '@/lib/sales-time-range'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const HISTORY_RANGES: TimeRange[] = ['TODAY', '1_WEEK', '1_MONTH']

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
  const [range, setRange] = useState<TimeRange>('TODAY')
  const cutoff = Date.parse(cutoffForRange(range))
  const normalizedSearch = search.trim().toLowerCase()
  const filteredSales = sales.filter(
    sale =>
      Date.parse(sale.createdAt) >= cutoff &&
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
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={range}
        aria-label={t('sales.range.label')}
        onValueChange={value => {
          if (HISTORY_RANGES.includes(value as TimeRange))
            setRange(value as TimeRange)
        }}
      >
        {HISTORY_RANGES.map(option => (
          <ToggleGroupItem key={option} value={option}>
            {t(timeRangeLabelKeys[option])}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {filteredSales.length === 0 && (
        <p role="status" className="text-muted-foreground text-sm">
          {t('pos.history.noMatches')}
        </p>
      )}
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
