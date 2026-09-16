import { useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAutoSelectOnFocus } from '@/hooks/use-auto-select-on-focus'
import { roundMoney } from '@/lib/money'
import type { StockUpdate } from '@/services/db'
import { useInventoryStore } from '@/store/useInventoryStore'
import { useSalesStore } from '@/store/useSalesStore'
import type { ReturnItem, Sale } from '@/types/sales'

interface ReturnModalProps {
  sale: Sale | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (items: ReturnItem[], stockUpdates: StockUpdate[]) => void
}

export function ReturnModal({
  sale,
  open,
  onOpenChange,
  onComplete,
}: ReturnModalProps) {
  const { t } = useTranslation()
  const {
    onFocus: onQtyFocus,
    onMouseUp: onMouseUpQty,
    onWheel,
  } = useAutoSelectOnFocus()
  const returnedQuantity = useSalesStore(state => state.returnedQuantity)
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  if (!sale) return null

  const available = (productId: string, soldQuantity: number) =>
    Math.max(0, soldQuantity - returnedQuantity(sale.id, productId))

  /** Clamped setter — the return quantity can never leave [0, max]. */
  const setReturnQty = (productId: string, next: number, max: number) => {
    setQuantities(current => ({
      ...current,
      [productId]: Math.min(max, Math.max(0, next)),
    }))
  }

  const handleSubmit = () => {
    const items: ReturnItem[] = []
    const stockUpdates: StockUpdate[] = []
    const products = useInventoryStore.getState().products

    for (const item of sale.items) {
      const quantity = Math.min(
        Math.max(0, quantities[item.productId] ?? 0),
        available(item.productId, item.quantity)
      )
      if (quantity === 0) continue
      items.push({
        productId: item.productId,
        name: item.name,
        sku: item.sku,
        quantity,
        unitPrice: item.unitPrice,
        lineTotal: roundMoney(quantity * item.unitPrice),
      })
      const product = products.find(entry => entry.id === item.productId)
      if (product) {
        // Absolute post-return quantity, mirroring the checkout StockUpdate
        // shape — the store persists it inside the credit-note transaction.
        stockUpdates.push({
          productId: product.id,
          newQuantity: product.quantity + quantity,
        })
      }
    }

    if (items.length === 0) {
      toast.error(t('pos.return.selectAtLeastOne'))
      return
    }

    // Mirror the restock into the UI state immediately (optimistic feedback);
    // the DB write happens in createCreditNote's single transaction.
    const updateProduct = useInventoryStore.getState().updateProduct
    for (const update of stockUpdates) {
      updateProduct(update.productId, { quantity: update.newQuantity })
    }

    onComplete(items, stockUpdates)
    setQuantities({})
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-5 text-primary" />
            {t('pos.return.title')}
          </DialogTitle>
          <DialogDescription>
            {t('pos.return.description', { invoice: sale.invoiceNumber })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 space-y-2 overflow-y-auto pe-1">
          {sale.items.map(item => {
            const max = available(item.productId, item.quantity)
            const qty = Math.min(quantities[item.productId] ?? 0, max)
            return (
              <div
                key={item.productId}
                className="bg-muted/50 flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {item.name}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {t('pos.return.available', { qty: max })}
                  </span>
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7"
                    disabled={qty <= 0}
                    aria-label={t('pos.return.decrease', { name: item.name })}
                    onClick={() => setReturnQty(item.productId, qty - 1, max)}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <Input
                    type="number"
                    min={0}
                    max={max}
                    disabled={max === 0}
                    value={qty}
                    onFocus={onQtyFocus}
                    onMouseUp={onMouseUpQty}
                    onWheel={onWheel}
                    onChange={event =>
                      setReturnQty(
                        item.productId,
                        Number.parseInt(event.target.value, 10) || 0,
                        max
                      )
                    }
                    aria-label={t('pos.return.quantity', { name: item.name })}
                    className="h-7 w-14 text-center"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7"
                    disabled={qty >= max}
                    aria-label={t('pos.return.increase', { name: item.name })}
                    onClick={() => setReturnQty(item.productId, qty + 1, max)}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('pos.receipt.close')}
          </Button>
          <Button onClick={handleSubmit}>{t('pos.return.complete')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
