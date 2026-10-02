import { useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Save, PackagePlus, Sparkles, Wand } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CollapsibleSection } from '@/components/ui/collapsible'
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
import { generateBarcode } from '@/lib/barcode'
import { formatMoney, roundMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useInventoryStore } from '@/store/useInventoryStore'
import type { NewProduct, Product } from '@/types/inventory'

type Translate = ReturnType<typeof useTranslation>['t']

/** Controlled string values backing the form inputs. */
interface ProductFormValues {
  name: string
  sku: string
  barcode: string
  category: string
  cartonQuantity: string
  boxQuantity: string
  boxesPerCarton: string
  cartonPurchasePrice: string
  boxSellingPrice: string
  cartonSellingPriceOverride: string
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
  cartonQuantity: '0',
  boxQuantity: '0',
  boxesPerCarton: '1',
  cartonPurchasePrice: '',
  boxSellingPrice: '',
  cartonSellingPriceOverride: '',
  minThreshold: '0',
}

const NUMBER_FIELDS = [
  'cartonQuantity',
  'boxesPerCarton',
  'boxSellingPrice',
] as const

function toFormValues(product: Product): ProductFormValues {
  return {
    name: product.name,
    sku: product.sku,
    barcode: product.barcode ?? '',
    category: product.category,
    cartonQuantity: String(product.cartonQuantity),
    boxQuantity: String(product.boxQuantity),
    boxesPerCarton: String(product.unitsPerCarton ?? 1),
    cartonPurchasePrice: String(product.cartonPurchasePrice),
    boxSellingPrice: String(product.boxSellingPrice),
    cartonSellingPriceOverride:
      product.unitsPerCarton !== undefined &&
      roundMoney(product.boxSellingPrice * product.unitsPerCarton) !==
        roundMoney(product.cartonSellingPrice)
        ? String(product.cartonSellingPrice)
        : '',
    minThreshold: String(product.minThreshold),
  }
}

function parseNumber(value: string): number {
  const normalized = value.trim().replace(/,/g, '.')
  if (normalized === '') return NaN
  return Number(normalized)
}

function calculateDerivedPrices(values: ProductFormValues) {
  const unitsPerCarton = parseNumber(values.boxesPerCarton)
  const cartonPurchasePrice = parseNumber(values.cartonPurchasePrice)
  const boxSellingPrice = parseNumber(values.boxSellingPrice)
  const sellingPriceOverride = parseNumber(values.cartonSellingPriceOverride)
  const validUnits = Number.isFinite(unitsPerCarton) && unitsPerCarton > 0
  const calculatedCartonSellingPrice =
    validUnits && Number.isFinite(boxSellingPrice)
      ? roundMoney(boxSellingPrice * unitsPerCarton)
      : null

  return {
    boxPurchasePrice:
      validUnits && Number.isFinite(cartonPurchasePrice)
        ? roundMoney(cartonPurchasePrice / unitsPerCarton)
        : null,
    calculatedCartonSellingPrice,
    cartonSellingPrice:
      Number.isFinite(sellingPriceOverride) &&
      values.cartonSellingPriceOverride.trim() !== ''
        ? roundMoney(sellingPriceOverride)
        : calculatedCartonSellingPrice,
  }
}

function purchasePriceExceedsSellingPrice(values: ProductFormValues): boolean {
  const cartonPurchasePrice = parseNumber(values.cartonPurchasePrice)
  const boxSellingPrice = parseNumber(values.boxSellingPrice)
  const unitsPerCarton = parseNumber(values.boxesPerCarton)
  if (
    !Number.isFinite(cartonPurchasePrice) ||
    cartonPurchasePrice <= 0 ||
    !Number.isFinite(boxSellingPrice) ||
    boxSellingPrice <= 0 ||
    !Number.isFinite(unitsPerCarton) ||
    unitsPerCarton <= 0
  ) {
    return false
  }

  const derivedPrices = calculateDerivedPrices(values)
  return (
    (derivedPrices.boxPurchasePrice !== null &&
      derivedPrices.boxPurchasePrice > boxSellingPrice) ||
    (derivedPrices.cartonSellingPrice !== null &&
      derivedPrices.cartonSellingPrice > 0 &&
      cartonPurchasePrice > derivedPrices.cartonSellingPrice)
  )
}

/**
 * Generates a readable product code that doubles as a scannable barcode.
 * Mirrors the store's `createProductSku()` pattern so codes stay consistent:
 * `PRD-` prefix + 8 uppercase hex characters from a random UUID.
 */
function generateProductCode(): string {
  return `PRD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

/** Fields that live inside the collapsed "more options" section. */
const OPTIONAL_ERROR_FIELDS = [
  'sku',
  'barcode',
  'minThreshold',
  'boxQuantity',
  'boxesPerCarton',
  'cartonPurchasePrice',
  'cartonSellingPriceOverride',
] as const

/** ARIA props `FormField` hands to the wrapped control. */
interface FieldControlProps {
  id: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

interface FormFieldProps {
  id: string
  label: string
  /** Validation message; rendered as an alert linked via aria-describedby. */
  error?: string
  required?: boolean
  className?: string
  /** Render prop receiving the ARIA props to spread onto the control. */
  children: (controlProps: FieldControlProps) => ReactNode
}

/**
 * Label + control + error message with the ARIA wiring done once: the control
 * receives `aria-invalid`, the error alert is referenced through
 * `aria-describedby`, and required fields get a visual/native indicator.
 */
function FormField({
  id,
  label,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  const describedBy = error ? `${id}-error` : undefined

  return (
    <div className={cn('grid gap-2', className)}>
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
  const positivePrice = t('inventory.form.validation.positivePrice')

  if (!values.name.trim()) errors.name = required
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

  for (const field of NUMBER_FIELDS) {
    const number = parseNumber(values[field])
    if (values[field].trim() === '') {
      errors[field] = required
    } else if (Number.isNaN(number)) {
      errors[field] = notANumber
    } else if (number < 0) {
      errors[field] = negative
    } else if (field === 'boxSellingPrice' && number <= 0) {
      errors[field] = positivePrice
    } else if (
      [
        'cartonQuantity',
        'boxQuantity',
        'boxesPerCarton',
        'minThreshold',
      ].includes(field) &&
      !Number.isInteger(number)
    ) {
      errors[field] = t('inventory.form.validation.positiveInteger')
    } else if (field === 'boxesPerCarton' && number < 1) {
      errors[field] = t('inventory.form.validation.positiveInteger')
    }
  }

  if (values.cartonPurchasePrice.trim() !== '') {
    const purchasePrice = parseNumber(values.cartonPurchasePrice)
    if (Number.isNaN(purchasePrice)) {
      errors.cartonPurchasePrice = notANumber
    } else if (purchasePrice < 0) {
      errors.cartonPurchasePrice = negative
    } else if (purchasePriceExceedsSellingPrice(values)) {
      errors.cartonPurchasePrice = t(
        'inventory.form.validation.purchasePriceExceedsSellingPrice'
      )
    }
  }

  if (values.boxQuantity.trim() !== '') {
    const boxQuantity = parseNumber(values.boxQuantity)
    if (Number.isNaN(boxQuantity)) {
      errors.boxQuantity = notANumber
    } else if (boxQuantity < 0) {
      errors.boxQuantity = negative
    } else if (!Number.isInteger(boxQuantity)) {
      errors.boxQuantity = t('inventory.form.validation.positiveInteger')
    }
  }

  if (values.minThreshold.trim() !== '') {
    const threshold = parseNumber(values.minThreshold)
    if (Number.isNaN(threshold)) {
      errors.minThreshold = notANumber
    } else if (threshold < 0) {
      errors.minThreshold = negative
    } else if (!Number.isInteger(threshold)) {
      errors.minThreshold = t('inventory.form.validation.positiveInteger')
    }
  }

  if (values.cartonSellingPriceOverride.trim() !== '') {
    const override = parseNumber(values.cartonSellingPriceOverride)
    if (Number.isNaN(override)) {
      errors.cartonSellingPriceOverride = notANumber
    } else if (override < 0) {
      errors.cartonSellingPriceOverride = negative
    } else if (override === 0) {
      errors.cartonSellingPriceOverride = positivePrice
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
  const {
    onFocus: onQtyFocus,
    onMouseUp: onMouseUpQty,
    onWheel,
  } = useAutoSelectOnFocus()
  const addProduct = useInventoryStore(state => state.addProduct)
  const updateProduct = useInventoryStore(state => state.updateProduct)
  const products = useInventoryStore(state => state.products)
  const [values, setValues] = useState<ProductFormValues>(() =>
    product ? toFormValues(product) : EMPTY_VALUES
  )
  const [errors, setErrors] = useState<FormErrors>({})
  // Optional fields are progressively disclosed: collapsed on open.
  const [optionsOpen, setOptionsOpen] = useState(false)
  const derivedPrices = calculateDerivedPrices(values)
  const hasPriceConflict = purchasePriceExceedsSellingPrice(values)
  const extrasExpanded = optionsOpen || hasPriceConflict

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
    setOptionsOpen(false)
  }

  const setField = (field: keyof ProductFormValues) => {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.target.value
      const numericValue = [
        'cartonQuantity',
        'boxQuantity',
        'boxesPerCarton',
        'cartonPurchasePrice',
        'boxSellingPrice',
        'cartonSellingPriceOverride',
        'minThreshold',
      ].includes(field)
        ? value.replace(/^0+(?=\d)/, '')
        : value
      setValues(current => ({ ...current, [field]: numericValue }))
      setErrors(current => {
        const next = { ...current, [field]: undefined }
        if (
          field === 'cartonPurchasePrice' ||
          field === 'boxSellingPrice' ||
          field === 'cartonSellingPriceOverride'
        ) {
          next.cartonPurchasePrice = undefined
          next.boxSellingPrice = undefined
          next.cartonSellingPriceOverride = undefined
        }
        return next
      })
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

  // Number of optional fields that already hold a value, surfaced on the
  // disclosure trigger so pre-filled data is visible at a glance.
  const filledOptionalCount = [values.sku, values.barcode].filter(
    value => value.trim() !== ''
  ).length

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextErrors = validate(values, t, products, product?.id)
    setErrors(nextErrors)

    // Errors on fields inside the collapsed "more options" section would be
    // invisible — expand it so the user can see and fix them.
    if (OPTIONAL_ERROR_FIELDS.some(field => nextErrors[field])) {
      setOptionsOpen(true)
    }

    if (Object.keys(nextErrors).length > 0) return

    const boxQuantity = parseNumber(values.boxQuantity) || 0
    const payload: NewProduct = {
      name: values.name.trim(),
      sku: values.sku.trim(),
      barcode: values.barcode.trim() || undefined,
      category: values.category.trim(),
      cartonQuantity: parseNumber(values.cartonQuantity),
      boxQuantity,
      boxesPerCarton: parseNumber(values.boxesPerCarton),
      cartonPurchasePrice: parseNumber(values.cartonPurchasePrice) || 0,
      boxPurchasePrice: derivedPrices.boxPurchasePrice ?? 0,
      cartonSellingPrice: derivedPrices.cartonSellingPrice ?? 0,
      boxSellingPrice: parseNumber(values.boxSellingPrice),
      quantity:
        parseNumber(values.cartonQuantity) *
          parseNumber(values.boxesPerCarton) +
        boxQuantity,
      purchasePrice: derivedPrices.boxPurchasePrice ?? 0,
      sellingPrice: parseNumber(values.boxSellingPrice),
      minThreshold: parseNumber(values.minThreshold) || 0,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {/* `pe-10` keeps the title/description clear of the close (X) button. */}
        <DialogHeader className="pe-10">
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
          <FormField
            id="product-name"
            label={t('inventory.form.name')}
            error={errors.name}
            required
            className="sm:col-span-2"
          >
            {controlProps => (
              <Input
                {...controlProps}
                required
                value={values.name}
                onChange={setField('name')}
                autoFocus={!product}
              />
            )}
          </FormField>

          <FormField
            id="product-boxSellingPrice"
            label={t('inventory.form.boxSellingPrice')}
            error={errors.boxSellingPrice}
            required
          >
            {controlProps => (
              <div className="grid gap-2">
                <Input
                  {...controlProps}
                  required
                  inputMode="decimal"
                  value={values.boxSellingPrice}
                  onFocus={onQtyFocus}
                  onMouseUp={onMouseUpQty}
                  onWheel={onWheel}
                  onChange={setField('boxSellingPrice')}
                />
                <p aria-live="polite" className="text-muted-foreground text-xs">
                  {t('inventory.form.cartonSellingPriceCalculated', {
                    price:
                      derivedPrices.calculatedCartonSellingPrice === null
                        ? '-'
                        : formatMoney(
                            derivedPrices.calculatedCartonSellingPrice
                          ),
                  })}
                </p>
              </div>
            )}
          </FormField>

          <FormField
            id="product-cartonQuantity"
            label={t('inventory.form.cartonQuantity')}
            error={errors.cartonQuantity}
            required
          >
            {controlProps => (
              <Input
                {...controlProps}
                required
                type="number"
                min={0}
                step="1"
                value={values.cartonQuantity}
                onFocus={onQtyFocus}
                onMouseUp={onMouseUpQty}
                onWheel={onWheel}
                onChange={setField('cartonQuantity')}
              />
            )}
          </FormField>

          <CollapsibleSection
            className="border-t pt-1 sm:col-span-2"
            open={extrasExpanded}
            onOpenChange={setOptionsOpen}
            title={
              extrasExpanded
                ? t('inventory.form.options.hide')
                : t('inventory.form.options.show')
            }
            trailing={
              filledOptionalCount > 0 ? (
                <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums">
                  <span aria-hidden="true">{filledOptionalCount}</span>
                  <span className="sr-only">
                    {t('inventory.form.options.filled', {
                      filled: filledOptionalCount,
                    })}
                  </span>
                </span>
              ) : undefined
            }
          >
            <div className="grid gap-4 pt-4 sm:grid-cols-2">
              <FormField
                id="product-category"
                label={t('inventory.form.category')}
              >
                {controlProps => (
                  <Input
                    {...controlProps}
                    value={values.category}
                    onChange={setField('category')}
                  />
                )}
              </FormField>

              <FormField
                id="product-cartonPurchasePrice"
                label={t('inventory.form.cartonPurchasePrice')}
                error={
                  hasPriceConflict
                    ? t(
                        'inventory.form.validation.purchasePriceExceedsSellingPrice'
                      )
                    : errors.cartonPurchasePrice
                }
              >
                {controlProps => (
                  <div className="grid gap-2">
                    <Input
                      {...controlProps}
                      inputMode="decimal"
                      value={values.cartonPurchasePrice}
                      onFocus={onQtyFocus}
                      onMouseUp={onMouseUpQty}
                      onWheel={onWheel}
                      onChange={setField('cartonPurchasePrice')}
                    />
                    <p className="text-muted-foreground text-xs">
                      {t('inventory.form.purchasePriceOptional')}
                    </p>
                    <p
                      aria-live="polite"
                      className="text-muted-foreground text-xs"
                    >
                      {t('inventory.form.boxPurchasePriceCalculated', {
                        price:
                          derivedPrices.boxPurchasePrice === null
                            ? '-'
                            : formatMoney(derivedPrices.boxPurchasePrice),
                      })}
                    </p>
                  </div>
                )}
              </FormField>

              {(
                [
                  ['boxQuantity', 'inventory.form.boxQuantity'],
                  ['boxesPerCarton', 'inventory.form.boxesPerCarton'],
                ] as const
              ).map(([field, label]) => (
                <FormField
                  key={field}
                  id={`product-${field}`}
                  label={t(label)}
                  error={errors[field]}
                  required={field === 'boxesPerCarton'}
                >
                  {controlProps => (
                    <Input
                      {...controlProps}
                      required={field === 'boxesPerCarton'}
                      type="number"
                      min={field === 'boxesPerCarton' ? 1 : 0}
                      step="1"
                      value={values[field]}
                      onFocus={onQtyFocus}
                      onMouseUp={onMouseUpQty}
                      onWheel={onWheel}
                      onChange={setField(field)}
                    />
                  )}
                </FormField>
              ))}

              <div className="grid gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-self-start"
                  onClick={() =>
                    setValues(current => ({
                      ...current,
                      cartonSellingPriceOverride:
                        current.cartonSellingPriceOverride.trim() === ''
                          ? String(derivedPrices.cartonSellingPrice ?? '')
                          : '',
                    }))
                  }
                >
                  {values.cartonSellingPriceOverride.trim() === ''
                    ? t('inventory.form.cartonSellingOverride')
                    : t('inventory.form.cartonSellingUseCalculated')}
                </Button>
                {values.cartonSellingPriceOverride.trim() !== '' && (
                  <FormField
                    id="product-cartonSellingPriceOverride"
                    label={t('inventory.form.cartonSellingPrice')}
                    error={errors.cartonSellingPriceOverride}
                  >
                    {controlProps => (
                      <Input
                        {...controlProps}
                        inputMode="decimal"
                        value={values.cartonSellingPriceOverride}
                        onFocus={onQtyFocus}
                        onMouseUp={onMouseUpQty}
                        onWheel={onWheel}
                        onChange={setField('cartonSellingPriceOverride')}
                      />
                    )}
                  </FormField>
                )}
              </div>

              <FormField
                id="product-min-threshold"
                label={t('inventory.form.minThreshold')}
                error={errors.minThreshold}
              >
                {controlProps => (
                  <Input
                    {...controlProps}
                    type="number"
                    min={0}
                    step="1"
                    value={values.minThreshold}
                    onFocus={onQtyFocus}
                    onMouseUp={onMouseUpQty}
                    onWheel={onWheel}
                    onChange={setField('minThreshold')}
                  />
                )}
              </FormField>

              <FormField
                id="product-sku"
                label={t('inventory.form.sku')}
                error={errors.sku}
              >
                {controlProps => (
                  <div className="flex gap-2">
                    <Input
                      {...controlProps}
                      value={values.sku}
                      onChange={setField('sku')}
                      placeholder={t('inventory.form.skuPlaceholder')}
                      className="min-w-0 flex-1"
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
                )}
              </FormField>

              <FormField
                id="product-barcode"
                label={t('inventory.form.barcode')}
                error={errors.barcode}
              >
                {controlProps => (
                  <div className="flex gap-2">
                    <Input
                      {...controlProps}
                      value={values.barcode}
                      onChange={setField('barcode')}
                      placeholder={t('inventory.form.barcodePlaceholder')}
                      className="min-w-0 flex-1"
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
                )}
              </FormField>
            </div>
          </CollapsibleSection>

          <DialogFooter className="mt-2 sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={hasPriceConflict}>
              {product ? <Save /> : <PackagePlus />}
              {product ? t('inventory.form.save') : t('inventory.form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
