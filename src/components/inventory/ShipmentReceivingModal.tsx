import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Search, Trash2, Truck } from 'lucide-react'

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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatMoney } from '@/lib/money'
import { useInventoryStore } from '@/store/useInventoryStore'
import type { Product } from '@/types/inventory'
import type { ShipmentLineInput } from '@/services/db'

interface ShipmentReceivingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product | null
}

interface ShipmentRow extends ShipmentLineInput {
  id: string
}

export function ShipmentReceivingModal({
  open,
  onOpenChange,
  product = null,
}: ShipmentReceivingModalProps) {
  const { t } = useTranslation()
  const products = useInventoryStore(state => state.products)
  const addShipment = useInventoryStore(state => state.addShipment)
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<ShipmentRow[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previousOpen, setPreviousOpen] = useState(open)

  if (open !== previousOpen) setPreviousOpen(open)
  if (open && !previousOpen) {
    setSearch('')
    setRows(product ? [createShipmentRow(product, 'carton')] : [])
  }

  const normalizedSearch = search.trim().toLocaleLowerCase()
  const matches = normalizedSearch
    ? products.filter(item =>
        [item.name, item.sku, item.barcode ?? ''].some(value =>
          value.toLocaleLowerCase().includes(normalizedSearch)
        )
      )
    : []

  const addProduct = (item: Product) => {
    setRows(current => [...current, createShipmentRow(item, 'carton')])
    setSearch('')
  }

  const updateRow = (rowId: string, updates: Partial<ShipmentRow>) => {
    setRows(current =>
      current.map(row => (row.id === rowId ? { ...row, ...updates } : row))
    )
  }

  const totalCost = rows.reduce(
    (total, row) => total + row.quantity * (row.purchasePrice ?? 0),
    0
  )
  const canSubmit =
    rows.length > 0 &&
    rows.every(
      row =>
        Number.isInteger(row.quantity) &&
        row.quantity > 0 &&
        Number.isFinite(row.purchasePrice) &&
        (row.purchasePrice ?? -1) >= 0
    )

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return
    setIsSubmitting(true)
    try {
      await addShipment(
        rows.map(row => ({
          productId: row.productId,
          unit: row.unit,
          quantity: row.quantity,
          purchasePrice: row.purchasePrice,
          batchNumber: row.batchNumber,
          expiryDate: row.expiryDate,
        }))
      )
      toast.success(
        t('inventory.shipment.toast.success', { count: rows.length })
      )
      onOpenChange(false)
    } catch (error) {
      toast.error(`${t('db.toast.saveFailed')}: ${String(error)}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-4 overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t('inventory.shipment.title')}</DialogTitle>
          <DialogDescription>
            {t('inventory.shipment.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="shipment-search">
            {t('inventory.shipment.searchLabel')}
          </Label>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              id="shipment-search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => {
                if (event.key !== 'Enter') return
                const exact = products.find(
                  item =>
                    item.barcode === search.trim() || item.sku === search.trim()
                )
                if (exact) {
                  event.preventDefault()
                  addProduct(exact)
                }
              }}
              placeholder={t('inventory.shipment.searchPlaceholder')}
              className="ps-9"
            />
          </div>
          {matches.length > 0 && (
            <div className="border-border max-h-36 overflow-y-auto rounded-md border">
              {matches.slice(0, 8).map(item => (
                <button
                  type="button"
                  key={item.id}
                  className="hover:bg-accent/60 flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm"
                  onClick={() => addProduct(item)}
                >
                  <span className="min-w-0 truncate font-medium">
                    {item.name}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {item.barcode || item.sku}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          <table className="w-full min-w-245 text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr className="border-b text-start text-xs text-muted-foreground">
                <th className="p-2 font-medium">
                  {t('inventory.shipment.product')}
                </th>
                <th className="p-2 font-medium">
                  {t('inventory.shipment.unit')}
                </th>
                <th className="p-2 font-medium">
                  {t('inventory.shipment.quantity')}
                </th>
                <th className="p-2 font-medium">
                  {t('inventory.shipment.purchasePrice')}
                </th>
                <th className="p-2 font-medium">
                  {t('inventory.shipment.batchNumberOptional')}
                </th>
                <th className="p-2 font-medium">
                  {t('inventory.shipment.expiryDateOptional')}
                </th>
                <th className="p-2 text-end font-medium">
                  {t('inventory.shipment.subtotal')}
                </th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const item = products.find(entry => entry.id === row.productId)
                if (!item) return null
                return (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td className="max-w-64 p-2">
                      <div className="truncate font-medium">{item.name}</div>
                      <div className="text-muted-foreground truncate text-xs">
                        {item.barcode || item.sku}
                        <span className="ms-2">
                          {item.cartonQuantity} {t('inventory.unit.carton')} +{' '}
                          {item.boxQuantity} {t('inventory.unit.box')}
                        </span>
                      </div>
                    </td>
                    <td className="p-2">
                      <Select
                        value={row.unit}
                        onValueChange={value => {
                          if (value !== 'carton' && value !== 'box') return
                          const purchasePrice =
                            value === 'carton'
                              ? item.cartonPurchasePrice
                              : item.boxPurchasePrice
                          updateRow(row.id, { unit: value, purchasePrice })
                        }}
                      >
                        <SelectTrigger
                          aria-label={t('inventory.shipment.unit')}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="carton">
                            {t('inventory.unit.carton')}
                          </SelectItem>
                          <SelectItem value="box">
                            {t('inventory.unit.box')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={row.quantity}
                        aria-label={t('inventory.shipment.quantity')}
                        onChange={event =>
                          updateRow(row.id, {
                            quantity: Number(event.target.value),
                          })
                        }
                        className="w-24"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.purchasePrice ?? 0}
                        aria-label={t('inventory.shipment.purchasePrice')}
                        onChange={event =>
                          updateRow(row.id, {
                            purchasePrice: Number(event.target.value),
                          })
                        }
                        className="w-28"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={row.batchNumber ?? ''}
                        aria-label={t('inventory.shipment.batchNumberOptional')}
                        onChange={event =>
                          updateRow(row.id, { batchNumber: event.target.value })
                        }
                        className="w-28"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="date"
                        value={row.expiryDate ?? ''}
                        aria-label={t('inventory.shipment.expiryDateOptional')}
                        onChange={event =>
                          updateRow(row.id, {
                            expiryDate: event.target.value || undefined,
                          })
                        }
                        className="w-36"
                      />
                    </td>
                    <td className="p-2 text-end font-medium tabular-nums">
                      {formatMoney(row.quantity * (row.purchasePrice ?? 0))}
                    </td>
                    <td className="p-2 text-end">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('inventory.shipment.removeRow', {
                          name: item.name,
                        })}
                        onClick={() =>
                          setRows(current =>
                            current.filter(entry => entry.id !== row.id)
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="text-muted-foreground h-24 text-center"
                  >
                    {t('inventory.shipment.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter className="items-center justify-between border-t pt-4 sm:justify-between">
          <div className="me-auto text-sm">
            <span className="text-muted-foreground">
              {t('inventory.shipment.totalCost')}
            </span>
            <span className="ms-2 font-semibold tabular-nums">
              {formatMoney(totalCost)}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || isSubmitting}
            onClick={() => void handleSubmit()}
          >
            <Truck />
            {t('inventory.shipment.submit', { count: rows.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function createShipmentRow(
  product: Product,
  unit: 'carton' | 'box'
): ShipmentRow {
  return {
    id: crypto.randomUUID(),
    productId: product.id,
    unit,
    quantity: 1,
    purchasePrice:
      unit === 'carton'
        ? product.cartonPurchasePrice
        : product.boxPurchasePrice,
  }
}
