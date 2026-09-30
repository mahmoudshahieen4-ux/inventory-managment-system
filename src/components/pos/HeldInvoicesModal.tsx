import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Clock3, RotateCcw, Trash2 } from 'lucide-react'

import i18n from '@/i18n/config'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatMoney } from '@/lib/money'
import { useCartStore } from '@/store/useCartStore'
import { useHeldInvoicesStore } from '@/store/useHeldInvoicesStore'

interface HeldInvoicesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function timeAgo(date: string, t: ReturnType<typeof useTranslation>['t']) {
  const seconds = Math.round((Date.now() - new Date(date).getTime()) / 1000)
  if (!Number.isFinite(seconds)) return date
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ]
  const formatter = new Intl.RelativeTimeFormat(i18n.language, {
    numeric: 'auto',
  })
  const [unit, divisor] = units.find(([, value]) => seconds >= value) ?? [
    'second',
    1,
  ]
  const value = -Math.floor(seconds / divisor)
  return t('pos.held.timeAgo', { value: formatter.format(value, unit) })
}

export function HeldInvoicesModal({
  open,
  onOpenChange,
}: HeldInvoicesModalProps) {
  const { t } = useTranslation()
  const heldInvoices = useHeldInvoicesStore(state => state.heldInvoices)
  const resumeHeldInvoice = useHeldInvoicesStore(
    state => state.resumeHeldInvoice
  )
  const deleteHeldInvoice = useHeldInvoicesStore(
    state => state.deleteHeldInvoice
  )
  const cartIsEmpty = useCartStore(state => state.items.length === 0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleResume = async (id: string) => {
    const resumed = await resumeHeldInvoice(id)
    if (!resumed) return
    toast.success(t('pos.held.toast.resumed'))
    onOpenChange(false)
  }

  const handleDelete = async (id: string, customerName?: string) => {
    const confirmed = window.confirm(
      t('pos.held.deleteConfirm', {
        name: customerName || t('pos.held.walkIn'),
      })
    )
    if (!confirmed) return
    await deleteHeldInvoice(id)
    toast.success(t('pos.held.toast.deleted'))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-4 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('pos.held.title')}</DialogTitle>
          <DialogDescription>
            {t('pos.held.description', { count: heldInvoices.length })}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {heldInvoices.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              {t('pos.held.empty')}
            </p>
          ) : (
            heldInvoices.map(invoice => (
              <section key={invoice.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">
                        {invoice.customerName || t('pos.held.walkIn')}
                      </h3>
                      <Badge variant="secondary">
                        {t('pos.held.itemsCount', {
                          count: invoice.items.reduce<number>(
                            (count, item) => count + item.quantity,
                            0
                          ),
                        })}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                      <Clock3 className="size-3.5" />
                      {timeAgo(invoice.createdAt, t)}
                    </p>
                    {invoice.notes && (
                      <p className="text-muted-foreground mt-1 text-sm">
                        {invoice.notes}
                      </p>
                    )}
                  </div>
                  <div className="text-end">
                    <p className="font-semibold tabular-nums">
                      {formatMoney(invoice.totalAmount)}
                    </p>
                    <div className="mt-2 flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!cartIsEmpty}
                        onClick={() => void handleResume(invoice.id)}
                      >
                        <RotateCcw />
                        {t('pos.held.resume')}
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('pos.held.delete', {
                          name: invoice.customerName || t('pos.held.walkIn'),
                        })}
                        onClick={() =>
                          void handleDelete(invoice.id, invoice.customerName)
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground mt-2 text-xs underline underline-offset-4"
                  aria-expanded={expandedId === invoice.id}
                  onClick={() =>
                    setExpandedId(current =>
                      current === invoice.id ? null : invoice.id
                    )
                  }
                >
                  {expandedId === invoice.id
                    ? t('pos.held.hideItems')
                    : t('pos.held.showItems')}
                </button>
                {expandedId === invoice.id && (
                  <ul className="mt-2 divide-y border-t text-sm">
                    {invoice.items.map((item, index) => (
                      <li
                        key={`${item.productId}-${item.unit ?? 'box'}-${index}`}
                        className="flex justify-between gap-3 py-2"
                      >
                        <span className="min-w-0 truncate">
                          {item.name} × {item.quantity}{' '}
                          {t(`inventory.unit.${item.unit ?? 'box'}`)}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatMoney(item.unitPrice * item.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
