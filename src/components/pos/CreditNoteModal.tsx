import { FileText, Printer } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatMoney } from '@/lib/money'
import { STORE_INFO } from '@/lib/store-config'
import { formatTransactionTimestamp } from '@/lib/date-time'
import type { CreditNote } from '@/types/sales'

interface CreditNoteModalProps {
  note: CreditNote | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreditNoteModal({
  note,
  open,
  onOpenChange,
}: CreditNoteModalProps) {
  const { t } = useTranslation()

  if (!note) return null

  const cashierName =
    note.cashierId === 'ADMIN' ? t('auth.role.admin') : t('auth.role.cashier')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pos.creditNote.title')}</DialogTitle>
          <DialogDescription>
            {t('pos.creditNote.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="credit-note-print-area text-sm">
          <div className="text-center">
            <p className="text-base font-semibold">
              {t('pos.receipt.storeName')}
            </p>
            <p className="text-muted-foreground text-xs">
              {STORE_INFO.address}
            </p>
            <p className="text-muted-foreground text-xs">{STORE_INFO.phone}</p>
            <p className="mt-2 text-base font-bold">
              {t('pos.creditNote.heading')}
            </p>
            <p className="font-medium">{note.creditNoteNumber}</p>
            <p className="text-muted-foreground text-xs">
              {t('pos.creditNote.originalInvoice')}:{' '}
              {note.originalInvoiceNumber}
            </p>
            <p className="text-muted-foreground text-xs">
              {t('pos.creditNote.returnDate')}:{' '}
              {formatTransactionTimestamp(note.createdAt)}
            </p>
            <p className="text-muted-foreground text-xs">
              {t('pos.receipt.cashier')}: {cashierName}
            </p>
          </div>

          <table className="mt-4 w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="py-1 text-start font-medium">
                  {t('pos.receipt.item')}
                </th>
                <th className="py-1 text-center font-medium">
                  {t('pos.receipt.qty')}
                </th>
                <th className="py-1 text-end font-medium">
                  {t('pos.receipt.lineTotal')}
                </th>
              </tr>
            </thead>
            <tbody>
              {note.items.map(item => (
                <tr key={item.productId} className="border-b last:border-b-0">
                  <td className="py-1.5">{item.name}</td>
                  <td className="py-1.5 text-center">{item.quantity}</td>
                  <td className="py-1.5 text-end font-medium">
                    {formatMoney(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-between border-t pt-3 font-semibold">
            <span>{t('pos.creditNote.refundTotal')}</span>
            <span>{formatMoney(note.total)}</span>
          </div>
          <div
            className="credit-note-barcode mt-5"
            aria-label={note.creditNoteNumber}
          >
            <span>{note.creditNoteNumber}</span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('pos.receipt.close')}
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" />
            {t('pos.creditNote.print')}
          </Button>
          <span className="sr-only">
            <FileText />
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
