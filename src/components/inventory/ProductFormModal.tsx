import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Save, PackagePlus, Sparkles, Wand } from 'lucide-react'

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
import { generateBarcode } from '@/lib/barcode'
import { useInventoryStore } from '@/store/useInventoryStore'
import type { NewProduct, Product } from '@/types/inventory'

type Translate = ReturnType<typeof useTranslation>['t']

/** Controlled string values backing the form inputs. */
interface ProductFormValues {
  name: string
  sku: string
  barcode: string
  category: string
  unit: string
  unitsPerCarton: string
  purchasePrice: string
  sellingPrice: string
  quantity: string
  minThreshold: string
}

type FormErrors = Partial<Record<keyof ProductFormValues, string>>

interface ProductFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Product being edited, or `null`/`undefined` when creating a new one. */
  product?: Product | null
}

const EMPTY_VALUES: ProductFormValues = {
  name: '',
  sku: '',
  barcode: '',
  category: '',
  unit: '',
  unitsPerCarton: '',
  purchasePrice: '',
  sellingPrice: '',
  quantity: '',
  minThreshold: '',
}

const NUMBER_FIELDS = [
  'purchasePrice',
  'sellingPrice',
  'quantity',
  'minThreshold',
] as const

function toFormValues(product: Product): ProductFormValues {
  return {
    name: product.name,
    sku: product.sku,
    barcode: product.barcode ?? '',
    category: product.category,
    unit: product.unit ?? '',
    unitsPerCarton: product.unitsPerCarton
      ? String(product.unitsPerCarton)
      : '',
    purchasePrice: String(product.purchasePrice),
    sellingPrice: String(product.sellingPrice),
    quantity: String(product.quantity),
    minThreshold: String(product.minThreshold),
  }
}

function parseNumber(value: string): number {
  const normalized = value.trim().replace(/,/g, '.')
  if (normalized === '') return NaN
  return Number(normalized)
}

/**
 * Generates a readable product code that doubles as a scannable barcode.
 * Mirrors the store's `createProductSku()` pattern so codes stay consistent:
 * `PRD-` prefix + 8 uppercase hex characters from a random UUID.
 */
function generateProductCode(): string {
  return `PRD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

function validate(
  values: ProductFormValues,
  t: Translate,
  products: Product[],
  editingId?: string
): FormErrors {
  const errors: FormErrors = {}
  const required = t('inventory.form.validation.required')
  const notANumber = t('inventory.form.validation.number')
  const negative = t('inventory.form.validation.nonNegative')

  if (!values.name.trim()) errors.name = required
  if (!values.category.trim()) errors.category = required

  // Barcode is optional, but when set it must be unique across the catalog so a
  // scanner can always resolve exactly one product.
  const barcode = values.barcode.trim()
  if (
    barcode &&
    products.some(
      product => product.id !== editingId && product.barcode === barcode
    )
  ) {
    errors.barcode = t('inventory.form.validation.barcodeExists')
  }

  if (values.unit === 'كرتونة') {
    const unitsPerCarton = parseNumber(values.unitsPerCarton)
    if (values.unitsPerCarton.trim() === '') {
      errors.unitsPerCarton = required
    } else if (!Number.isInteger(unitsPerCarton) || unitsPerCarton < 1) {
      errors.unitsPerCarton = t('inventory.form.validation.positiveInteger')
    }
  }

  for (const field of NUMBER_FIELDS) {
    const number = parseNumber(values[field])
    if (values[field].trim() === '') {
      errors[field] = required
    } else if (Number.isNaN(number)) {
      errors[field] = notANumber
    } else if (number < 0) {
      errors[field] = negative
    }
  }

  return errors
}

export function ProductFormModal({
  open,
  onOpenChange,
  product = null,
}: ProductFormModalProps) {
  const { t } = useTranslation()
  const addProduct = useInventoryStore(state => state.addProduct)
  const updateProduct = useInventoryStore(state => state.updateProduct)
  const products = useInventoryStore(state => state.products)
  const [values, setValues] = useState<ProductFormValues>(() =>
    product ? toFormValues(product) : EMPTY_VALUES
  )
  const [errors, setErrors] = useState<FormErrors>({})

  // Track the previous open/product combo and reset the form state whenever
  // the modal opens or the target product changes. Uses the React-recommended
  // "adjust state during render" pattern (avoids effects that trigger cascading renders).
  const [prevOpenState, setPrevOpenState] = useState(open)
  const [prevProductState, setPrevProductState] = useState(product)

  if (open !== prevOpenState) {
    setPrevOpenState(open)
  }

  if (open && (!prevOpenState || product !== prevProductState)) {
    setPrevProductState(product)
    setValues(product ? toFormValues(product) : EMPTY_VALUES)
    setErrors({})
  }

  const setField = (field: keyof ProductFormValues) => {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setValues(current => ({ ...current, [field]: event.target.value }))
      setErrors(current => ({ ...current, [field]: undefined }))
    }
  }

  const handleGenerateSku = () => {
    setValues(current => ({ ...current, sku: generateProductCode() }))
    setErrors(current => ({ ...current, sku: undefined }))
  }

  const handleGenerateBarcode = () => {
    setValues(current => ({ ...current, barcode: generateBarcode() }))
    setErrors(current => ({ ...current, barcode: undefined }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextErrors = validate(values, t, products, product?.id)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload: NewProduct = {
      name: values.name.trim(),
      sku: values.sku.trim(),
      barcode: values.barcode.trim() || undefined,
      category: values.category.trim(),
      unit: values.unit.trim() || undefined,
      unitsPerCarton:
        values.unit === 'كرتونة'
          ? parseNumber(values.unitsPerCarton)
          : undefined,
      purchasePrice: parseNumber(values.purchasePrice),
      sellingPrice: parseNumber(values.sellingPrice),
      quantity: parseNumber(values.quantity),
      minThreshold: parseNumber(values.minThreshold),
    }

    if (product) {
      updateProduct(product.id, payload)
      toast.success(t('inventory.toast.productUpdated'))
    } else {
      addProduct(payload)
      toast.success(t('inventory.toast.productCreated'))
    }

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {product
              ? t('inventory.form.editTitle')
              : t('inventory.form.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('inventory.form.description')}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="product-name">{t('inventory.form.name')}</Label>
            <Input
              id="product-name"
              value={values.name}
              onChange={setField('name')}
              aria-invalid={errors.name ? true : undefined}
            />
            {errors.name && (
              <p className="text-destructive text-sm" role="alert">
                {errors.name}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="product-sku">{t('inventory.form.sku')}</Label>
            <div className="flex gap-2">
              <Input
                id="product-sku"
                value={values.sku}
                onChange={setField('sku')}
                placeholder={t('inventory.form.skuPlaceholder')}
                className="min-w-0 flex-1"
                aria-invalid={errors.sku ? true : undefined}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={handleGenerateSku}
              >
                <Sparkles className="size-4" />
                {t('inventory.form.generateBarcode')}
              </Button>
            </div>
            {errors.sku && (
              <p className="text-destructive text-sm" role="alert">
                {errors.sku}
              </p>
            )}
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="product-barcode">
              {t('inventory.form.barcode')}
            </Label>
            <div className="flex gap-2">
              <Input
                id="product-barcode"
                value={values.barcode}
                onChange={setField('barcode')}
                placeholder={t('inventory.form.barcodePlaceholder')}
                autoFocus={!product}
                className="min-w-0 flex-1"
                aria-invalid={errors.barcode ? true : undefined}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={handleGenerateBarcode}
              >
                <Wand className="size-4" />
                {t('inventory.form.generateEan13')}
              </Button>
            </div>
            {errors.barcode && (
              <p className="text-destructive text-sm" role="alert">
                {errors.barcode}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="product-category">
              {t('inventory.form.category')}
            </Label>
            <Input
              id="product-category"
              value={values.category}
              onChange={setField('category')}
              aria-invalid={errors.category ? true : undefined}
            />
            {errors.category && (
              <p className="text-destructive text-sm" role="alert">
                {errors.category}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="product-unit">{t('inventory.form.unit')}</Label>
            <Input
              id="product-unit"
              list="product-unit-options"
              value={values.unit}
              onChange={setField('unit')}
              placeholder={t('inventory.form.unitPlaceholder')}
            />
            <datalist id="product-unit-options">
              <option value="علبة" />
              <option value="كرتونة" />
            </datalist>
          </div>

          {values.unit === 'كرتونة' && (
            <div className="grid gap-1.5">
              <Label htmlFor="product-units-per-carton">
                {t('inventory.form.unitsPerCarton')}
              </Label>
              <Input
                id="product-units-per-carton"
                type="number"
                min={1}
                step="1"
                value={values.unitsPerCarton}
                onChange={setField('unitsPerCarton')}
                aria-invalid={errors.unitsPerCarton ? true : undefined}
              />
              {errors.unitsPerCarton && (
                <p className="text-destructive text-sm" role="alert">
                  {errors.unitsPerCarton}
                </p>
              )}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="product-purchase-price">
              {t('inventory.form.purchasePrice')}
            </Label>
            <Input
              id="product-purchase-price"
              type="text"
              inputMode="decimal"
              value={values.purchasePrice}
              onChange={setField('purchasePrice')}
              aria-invalid={errors.purchasePrice ? true : undefined}
            />
            {errors.purchasePrice && (
              <p className="text-destructive text-sm" role="alert">
                {errors.purchasePrice}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="product-selling-price">
              {t('inventory.form.sellingPrice')}
            </Label>
            <Input
              id="product-selling-price"
              type="text"
              inputMode="decimal"
              value={values.sellingPrice}
              onChange={setField('sellingPrice')}
              aria-invalid={errors.sellingPrice ? true : undefined}
            />
            {errors.sellingPrice && (
              <p className="text-destructive text-sm" role="alert">
                {errors.sellingPrice}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="product-quantity">
              {t('inventory.form.quantity')}
            </Label>
            <Input
              id="product-quantity"
              type="number"
              min={0}
              step="1"
              value={values.quantity}
              onChange={setField('quantity')}
              aria-invalid={errors.quantity ? true : undefined}
            />
            {errors.quantity && (
              <p className="text-destructive text-sm" role="alert">
                {errors.quantity}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="product-min-threshold">
              {t('inventory.form.minThreshold')}
            </Label>
            <Input
              id="product-min-threshold"
              type="number"
              min={0}
              step="1"
              value={values.minThreshold}
              onChange={setField('minThreshold')}
              aria-invalid={errors.minThreshold ? true : undefined}
            />
            {errors.minThreshold && (
              <p className="text-destructive text-sm" role="alert">
                {errors.minThreshold}
              </p>
            )}
          </div>

          <DialogFooter className="mt-2 sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit">
              {product ? <Save /> : <PackagePlus />}
              {product ? t('inventory.form.save') : t('inventory.form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
