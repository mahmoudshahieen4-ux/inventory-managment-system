import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Search, Truck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
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
import { useAutoSelectOnFocus } from '@/hooks/use-auto-select-on-focus'
import { formatMoney } from '@/lib/money'
import { getStockStatus } from '@/lib/stock-status'
import { cn } from '@/lib/utils'
import { useInventoryStore } from '@/store/useInventoryStore'
import type { Product } from '@/types/inventory'
import { stockStatusStyles } from './stock-status-config'

interface StockInModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Product that receives the stock. When omitted (batch mode, opened from the
   * toolbar) the user searches and selects a product before entering the
   * quantity.
   */
  product?: Product | null
}

interface FieldControlProps {
  id: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

/**
 * Label + control + error message with ARIA wiring done once, mirroring the
 * FormField helper used by ProductFormModal (kept local so this component stays
 * self-contained and importable on its own).
 */
function FormField({
  id,
  label,
  error,
  required,
  children,
}: {
  id: string
  label: string
  error?: string
  required?: boolean
  children: (controlProps: FieldControlProps) => ReactNode
}) {
  const describedBy = error ? `${id}-error` : undefined
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        )}
      </Label>
      {children({
        id,
        ...(error ? { 'aria-invalid': true as const } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      })}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  )
}

/** Parses a localized/numeric string into a number (handles comma separators). */
function parseNumber(value: string): number {
  const normalized = value.trim().replace(/,/g, '.')
  if (normalized === '') return NaN
  return Number(normalized)
}

/** Stock-in / receipt dialog — increases a product's on-hand quantity. */
export function StockInModal({
  open,
  onOpenChange,
  product = null,
}: StockInModalProps) {
  const { t } = useTranslation()
  const {
    onFocus: onQtyFocus,
    onMouseUp: onMouseUpQty,
    onWheel,
  } = useAutoSelectOnFocus()
  const products = useInventoryStore(state => state.products)
  const addStock = useInventoryStore(state => state.addStock)

  // Single product (per-row quick add) vs. batch (toolbar) selection modes.
  const lockedProduct = product
  const [productSearch, setProductSearch] = useState('')
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [quantity, setQuantity] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [quantityError, setQuantityError] = useState('')
  const [costError, setCostError] = useState('')

  // Reset editable state every time the dialog opens (including when the parent
  // re-opens it for a different product). Mirrors ProductFormModal's
  // "adjust state during render" pattern to avoid cascading effects.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
  }
  if (open && prevOpen !== true) {
    setProductSearch('')
    setSelectedProductId('')
    setQuantity('')
    setCostPrice('')
    setQuantityError('')
    setCostError('')
  }

  // In single-product mode the product is locked in; otherwise resolve from the
  // selection made in the searchable product list.
  const selectedProduct =
    lockedProduct ??
    (selectedProductId ? products.find(p => p.id === selectedProductId) : null)

  const addedQuantity = parseNumber(quantity)
  const isValidQuantity = Number.isInteger(addedQuantity) && addedQuantity > 0
  const newTotal =
    selectedProduct && !Number.isNaN(addedQuantity)
      ? selectedProduct.quantity + addedQuantity
      : selectedProduct
        ? selectedProduct.quantity
        : null
  const newTotalStatus =
    selectedProduct && newTotal !== null
      ? getStockStatus(newTotal, selectedProduct.minThreshold)
      : null
  const previewBadgeClass = newTotalStatus
    ? stockStatusStyles[newTotalStatus].badgeClassName
    : 'border-border text-muted-foreground'

  // Batch-mode product list, filtered by name / SKU / barcode.
  const productSearchNorm = productSearch.trim().toLowerCase()
  const matchingProducts =
    productSearchNorm === ''
      ? products.slice().sort((a, b) => b.quantity - a.quantity)
      : products.filter(
          item =>
            item.name.toLowerCase().includes(productSearchNorm) ||
            item.sku.toLowerCase().includes(productSearchNorm) ||
            (item.barcode ?? '').toLowerCase().includes(productSearchNorm)
        )

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Live validation in the change handlers keeps `quantityError`/`costError`
    // in sync and disables the submit button while the input is invalid, so by
    // the time we reach here the values are guaranteed valid.
    if (!selectedProduct || !isValidQuantity) return

    const parsedCost =
      costPrice.trim() !== '' ? parseNumber(costPrice) : undefined

    addStock(selectedProduct.id, addedQuantity, parsedCost)
    toast.success(
      t('inventory.stockIn.toast.success', {
        name: selectedProduct.name,
        qty: addedQuantity,
      })
    )
    onOpenChange(false)
  }

  const handleQuantityChange = (event: FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value
    setQuantity(value)
    if (value.trim() === '') {
      setQuantityError('')
      return
    }
    const num = parseNumber(value)
    if (Number.isNaN(num)) {
      setQuantityError(t('inventory.form.validation.number'))
    } else if (!Number.isInteger(num) || num <= 0) {
      setQuantityError(t('inventory.form.validation.positiveInteger'))
    } else {
      setQuantityError('')
    }
  }

  const handleCostChange = (event: FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value
    setCostPrice(value)
    if (value.trim() === '') {
      setCostError('')
      return
    }
    const num = parseNumber(value)
    if (Number.isNaN(num)) {
      setCostError(t('inventory.form.validation.number'))
    } else if (num < 0) {
      setCostError(t('inventory.form.validation.nonNegative'))
    } else {
      setCostError('')
    }
  }

  const canSubmit =
    !!selectedProduct && isValidQuantity && !quantityError && !costError

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <DialogHeader>
            <DialogTitle>{t('inventory.stockIn.title')}</DialogTitle>
            <DialogDescription>
              {t('inventory.stockIn.description')}
            </DialogDescription>
          </DialogHeader>

          {/* Batch mode: search & select a product before entering a quantity. */}
          {!lockedProduct && (
            <div className="grid gap-2">
              <Label htmlFor="stockin-product-search">
                {t('inventory.stockIn.productLabel')}
              </Label>
              <div className="relative">
                <Search className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  id="stockin-product-search"
                  type="search"
                  value={productSearch}
                  onChange={event => setProductSearch(event.target.value)}
                  placeholder={t('inventory.stockIn.selectProduct')}
                  aria-label={t('inventory.stockIn.searchLabel')}
                  className="ps-9"
                />
              </div>
              <div className="border-border max-h-56 min-h-[4.5rem] overflow-y-auto rounded-md border">
                {matchingProducts.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-center text-sm">
                    {t('inventory.stockIn.noMatch')}
                  </p>
                ) : (
                  matchingProducts.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        'w-full cursor-pointer text-start p-2 text-sm hover:bg-accent/60',
                        selectedProductId === item.id && 'bg-accent/60'
                      )}
                      onClick={() => {
                        setSelectedProductId(item.id)
                        setProductSearch('')
                      }}
                    >
                      <div className="font-medium">{item.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {item.sku}
                        {item.barcode ? ` • ${item.barcode}` : ''}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {selectedProduct ? (
            <>
              {/* Product info + read-only current stock badge */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">{selectedProduct.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {selectedProduct.sku}
                    {selectedProduct.barcode
                      ? ` • ${selectedProduct.barcode}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs">
                    {t('inventory.stockIn.currentStock')}
                  </span>
                  <Badge variant="secondary">
                    {selectedProduct.quantity} {selectedProduct.unit ?? ''}
                  </Badge>
                </div>
              </div>
            </>
          ) : (
            lockedProduct === null && (
              <p className="text-muted-foreground text-center text-sm">
                {t('inventory.stockIn.selectFirst')}
              </p>
            )
          )}

          {selectedProduct && (
            <>
              {/* Quantity to add (auto-selects on focus for fast entry) */}
              <FormField
                id="stockin-quantity"
                label={t('inventory.stockIn.quantityLabel')}
                error={quantityError}
                required
              >
                {({
                  id,
                  'aria-invalid': invalid,
                  'aria-describedby': describedBy,
                }) => (
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    step={1}
                    value={quantity}
                    onChange={handleQuantityChange}
                    onFocus={onQtyFocus}
                    onMouseUp={onMouseUpQty}
                    onWheel={onWheel}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    placeholder={t('inventory.stockIn.quantityPlaceholder')}
                    autoComplete="off"
                  />
                )}
              </FormField>

              {/* Optional new purchase price */}
              <FormField
                id="stockin-cost"
                label={t('inventory.stockIn.costPriceLabel')}
              >
                {({
                  id,
                  'aria-invalid': invalid,
                  'aria-describedby': describedBy,
                }) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    step={0.01}
                    value={costPrice}
                    onFocus={onQtyFocus}
                    onMouseUp={onMouseUpQty}
                    onWheel={onWheel}
                    onChange={handleCostChange}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    placeholder={t('inventory.stockIn.costPricePlaceholder')}
                    autoComplete="off"
                  />
                )}
              </FormField>
            </>
          )}

          {/* Live preview: Current + Added = New Total (colored by result status). */}
          {selectedProduct && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
              <span className="text-sm">{t('inventory.stockIn.newTotal')}</span>
              <Badge className={cn('text-xs', previewBadgeClass)}>
                {selectedProduct.quantity} +{' '}
                {Number.isNaN(addedQuantity) ? 0 : addedQuantity} ={' '}
                {newTotal ?? selectedProduct.quantity}
                {selectedProduct.purchasePrice > 0 || costPrice.trim() !== ''
                  ? ` (${formatMoney(
                      costPrice.trim() !== ''
                        ? parseNumber(costPrice)
                        : selectedProduct.purchasePrice
                    )})`
                  : null}
              </Badge>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              <Truck />
              {t('inventory.stockIn.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
