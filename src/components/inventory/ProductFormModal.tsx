import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Save, PackagePlus } from 'lucide-react'

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
import { useInventoryStore } from '@/store/useInventoryStore'
import type { NewProduct, Product } from '@/types/inventory'

type Translate = ReturnType<typeof useTranslation>['t']

/** Controlled string values backing the form inputs. */
interface ProductFormValues {
  name: string
  sku: string
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

function validate(values: ProductFormValues, t: Translate): FormErrors {
  const errors: FormErrors = {}
  const required = t('inventory.form.validation.required')
  const notANumber = t('inventory.form.validation.number')
  const negative = t('inventory.form.validation.nonNegative')

  if (!values.name.trim()) errors.name = required
  if (!values.category.trim()) errors.category = required

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextErrors = validate(values, t)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload: NewProduct = {
      name: values.name.trim(),
      sku: values.sku.trim(),
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
            <Input
              id="product-sku"
              value={values.sku}
              onChange={setField('sku')}
              placeholder={t('inventory.form.skuPlaceholder')}
              aria-invalid={errors.sku ? true : undefined}
            />
            {errors.sku && (
              <p className="text-destructive text-sm" role="alert">
                {errors.sku}
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
