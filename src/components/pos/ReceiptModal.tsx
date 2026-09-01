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
import type { Sale } from '@/types/sales'

interface ReceiptModalProps {
  /** The completed sale to display; null when there is nothing to show. */
  sale: Sale | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Receipt preview shown after a successful checkout. Printing uses the browser print dialog. */
export function ReceiptModal({ sale, open, onOpenChange }: ReceiptModalProps) {
  const { t } = useTranslation()

  if (!sale) return null

  const handlePrint = () => {
    window.print()
  }

  const cashierName =
    sale.cashierId === 'ADMIN' ? t('auth.role.admin') : t('auth.role.cashier')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pos.receipt.title')}</DialogTitle>
          <DialogDescription>{t('pos.receipt.description')}</DialogDescription>
        </DialogHeader>

        {/* Printable area: App.css hides everything else while printing */}
        <div className="receipt-print-area text-sm">
          <div className="text-center">
            <p className="text-base font-semibold">
              {t('pos.receipt.storeName')}
            </p>
            <p className="text-muted-foreground text-xs">
              {STORE_INFO.address}
            </p>
            <p className="text-muted-foreground text-xs">{STORE_INFO.phone}</p>
            <p className="text-muted-foreground text-xs">
              {t('pos.receipt.date')}:{' '}
              {new Date(sale.createdAt).toLocaleString()}
            </p>
            <p className="mt-1 font-medium">
              {t('pos.receipt.invoiceNo')}: {sale.invoiceNumber}
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
                  {t('pos.receipt.unitPrice')}
                </th>
                <th className="py-1 text-end font-medium">
                  {t('pos.receipt.lineTotal')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map(item => (
                <tr key={item.productId} className="border-b last:border-b-0">
                  <td className="py-1.5">{item.name}</td>
                  <td className="py-1.5 text-center">{item.quantity}</td>
                  <td className="py-1.5 text-end">
                    {formatMoney(item.unitPrice)}
                  </td>
                  <td className="py-1.5 text-end font-medium">
                    {formatMoney(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 space-y-1 border-t pt-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t('pos.receipt.subtotal')}
              </span>
              <span>{formatMoney(sale.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t('pos.receipt.tax')}
              </span>
              <span>{formatMoney(sale.tax)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>{t('pos.receipt.total')}</span>
              <span>{formatMoney(sale.total)}</span>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            {t('pos.receipt.thankYou')}
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('pos.receipt.close')}
          </Button>
          <Button
            variant="outline"
            title={t('pos.receipt.exportPdfHint')}
            onClick={handlePrint}
          >
            <FileText className="size-4" />
            {t('pos.receipt.exportPdf')}
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="size-4" />
            {t('pos.receipt.print')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
