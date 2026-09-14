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
import { formatTransactionTimestamp } from '@/lib/date-time'
import { formatMoney } from '@/lib/money'
import { STORE_INFO } from '@/lib/store-config'
import type { Sale } from '@/types/sales'

interface ReceiptModalProps {
  /** The completed sale to display; null when there is nothing to show. */
  sale: Sale | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Dashed separator used between every receipt section (thermal-roll look). */
function ReceiptDivider() {
  return (
    <div
      aria-hidden="true"
      className="my-3 border-t border-dashed border-neutral-400"
    />
  )
}

/**
 * Thermal-receipt preview (80mm roll layout) shown after a successful
 * checkout. On screen it renders as a narrow paper card; printing uses the
 * browser print dialog — the `@media print` rules in App.css hide the modal
 * chrome and print only the `.receipt-print-area` at 80mm.
 *
 * Sales tax is disabled (TAX_RATE = 0): the summary shows only the subtotal
 * and the grand total.
 */
export function ReceiptModal({ sale, open, onOpenChange }: ReceiptModalProps) {
  const { t } = useTranslation()

  if (!sale) return null

  const handlePrint = () => {
    window.print()
  }

  const cashierName =
    sale.cashierId === 'admin' ? t('auth.role.admin') : t('auth.role.cashier')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {/* `pe-10` keeps the title/description clear of the close (X) button. */}
        <DialogHeader className="pe-10">
          <DialogTitle>{t('pos.receipt.title')}</DialogTitle>
          <DialogDescription>{t('pos.receipt.description')}</DialogDescription>
        </DialogHeader>

        {/* Printable area: App.css hides everything else while printing */}
        <div className="receipt-print-area mx-auto w-full max-w-[300px] rounded-sm border border-neutral-300 bg-white px-4 py-5 font-mono text-xs text-neutral-950 shadow-sm">
          {/* Store header */}
          <div className="text-center">
            <p className="text-sm font-bold tracking-widest">
              {t('pos.receipt.storeName')}
            </p>
            <p className="mt-1 text-neutral-600">{STORE_INFO.address}</p>
            <p className="text-neutral-600">{STORE_INFO.phone}</p>
          </div>

          <ReceiptDivider />

          {/* Sale metadata */}
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-neutral-600">{t('pos.receipt.date')}</span>
              <span className="tabular-nums">
                {formatTransactionTimestamp(sale.createdAt)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-neutral-600">
                {t('pos.receipt.invoiceNo')}
              </span>
              <span className="font-semibold tabular-nums">
                {sale.invoiceNumber}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-neutral-600">
                {t('pos.receipt.cashier')}
              </span>
              <span>{cashierName}</span>
            </div>
          </div>

          <ReceiptDivider />

          {/* Items */}
          <table className="w-full">
            <thead>
              <tr className="border-b border-dashed border-neutral-400">
                <th className="py-1 text-start font-semibold">
                  {t('pos.receipt.item')}
                </th>
                <th className="py-1 text-center font-semibold">
                  {t('pos.receipt.qty')}
                </th>
                <th className="py-1 text-end font-semibold">
                  {t('pos.receipt.unitPrice')}
                </th>
                <th className="py-1 text-end font-semibold">
                  {t('pos.receipt.lineTotal')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map(item => (
                <tr
                  key={item.productId}
                  className="border-b border-dashed border-neutral-300 last:border-b-0"
                >
                  <td className="py-1.5 align-top">{item.name}</td>
                  <td className="py-1.5 text-center align-top tabular-nums">
                    {item.quantity}
                  </td>
                  <td className="py-1.5 text-end align-top tabular-nums">
                    {formatMoney(item.unitPrice)}
                  </td>
                  <td className="py-1.5 text-end align-top font-medium tabular-nums">
                    {formatMoney(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ReceiptDivider />

          {/* Totals — subtotal + grand total only (no tax) */}
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-neutral-600">
                {t('pos.receipt.subtotal')}
              </span>
              <span className="tabular-nums">{formatMoney(sale.subtotal)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-neutral-400 pt-1.5 text-sm font-bold">
              <span>{t('pos.receipt.total')}</span>
              <span className="tabular-nums">{formatMoney(sale.total)}</span>
            </div>
          </div>

          <ReceiptDivider />

          {/* Footer: scannable invoice code + thank-you note */}
          <div className="text-center">
            <div className="receipt-barcode" aria-hidden="true">
              <span>{sale.invoiceNumber}</span>
            </div>
            <p className="mt-2 font-semibold">{t('pos.receipt.thankYou')}</p>
          </div>
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
