import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
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
import { useInventoryStore } from '@/store/useInventoryStore'
import { useSalesStore } from '@/store/useSalesStore'
import type { ReturnItem, Sale } from '@/types/sales'

interface ReturnModalProps {
  sale: Sale | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (items: ReturnItem[]) => void
}

export function ReturnModal({
  sale,
  open,
  onOpenChange,
  onComplete,
}: ReturnModalProps) {
  const { t } = useTranslation()
  const returnedQuantity = useSalesStore(state => state.returnedQuantity)
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  if (!sale) return null

  const available = (productId: string, soldQuantity: number) =>
    Math.max(0, soldQuantity - returnedQuantity(sale.id, productId))

  const handleSubmit = () => {
    const items: ReturnItem[] = sale.items.flatMap(item => {
      const quantity = Math.min(
        Math.max(0, quantities[item.productId] ?? 0),
        available(item.productId, item.quantity)
      )
      if (quantity === 0) return []
      return [
        {
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          quantity,
          unitPrice: item.unitPrice,
          lineTotal: quantity * item.unitPrice,
        },
      ]
    })

    if (items.length === 0) {
      toast.error(t('pos.return.selectAtLeastOne'))
      return
    }

    const updateProduct = useInventoryStore.getState().updateProduct
    for (const item of items) {
      const product = useInventoryStore
        .getState()
        .products.find(entry => entry.id === item.productId)
      if (product)
        updateProduct(product.id, {
          quantity: product.quantity + item.quantity,
        })
    }

    onComplete(items)
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
            return (
              <label
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
                <Input
                  type="number"
                  min={0}
                  max={max}
                  disabled={max === 0}
                  value={quantities[item.productId] ?? 0}
                  onChange={event =>
                    setQuantities(current => ({
                      ...current,
                      [item.productId]:
                        Number.parseInt(event.target.value, 10) || 0,
                    }))
                  }
                  aria-label={t('pos.return.quantity', { name: item.name })}
                  className="h-9 w-20 text-center"
                />
              </label>
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
