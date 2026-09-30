import { useEffect, useRef, useState } from 'react'
import { PackageSearch, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { stockStatusStyles } from '@/components/inventory/stock-status-config'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/money'
import { playScanBeep } from '@/lib/barcode'
import { resolveProductUnit } from '@/lib/product-unit'
import { getStockStatus } from '@/lib/stock-status'
import { cn } from '@/lib/utils'
import { useCartStore } from '@/store/useCartStore'
import { useInventoryStore } from '@/store/useInventoryStore'

interface ProductCatalogProps {
  /**
   * Optional external control over the search box. The POS screen owns this
   * state so it can clear the box after a barcode scan.
   */
  search?: string
  onSearchChange?: (search: string) => void
  inputRef?: React.RefObject<HTMLInputElement | null>
}

/** Left POS pane: instant search plus a grid of sellable product cards. */
export function ProductCatalog({
  search,
  onSearchChange,
  inputRef,
}: ProductCatalogProps = {}) {
  const { t } = useTranslation()
  const [localSearch, setLocalSearch] = useState('')
  const activeSearch = search ?? localSearch

  const handleSearchChange = (value: string) => {
    if (onSearchChange) {
      onSearchChange(value)
    } else {
      setLocalSearch(value)
    }
  }

  const products = useInventoryStore(state => state.products)
  const cartItems = useCartStore(state => state.items)
  const localInputRef = useRef<HTMLInputElement>(null)
  const [activeCategory, setActiveCategory] = useState('ALL')

  useEffect(() => {
    const input = inputRef?.current ?? localInputRef.current
    input?.focus()
  }, [inputRef])

  const cartQtyByProduct = new Map(
    cartItems.map(item => [item.productId, item.quantity])
  )

  const normalizedSearch = activeSearch.trim().toLowerCase()
  const sellableProducts = products.filter(product => product.quantity > 0)
  const categories = [
    ...new Set(sellableProducts.map(product => product.category)),
  ]
    .filter(category => category.trim() !== '')
    .sort((left, right) => left.localeCompare(right))
  const filteredProducts = normalizedSearch
    ? sellableProducts.filter(
        product =>
          product.name.toLowerCase().includes(normalizedSearch) ||
          product.sku.toLowerCase().includes(normalizedSearch) ||
          (product.barcode ?? '').toLowerCase().includes(normalizedSearch)
      )
    : sellableProducts
  const categoryFilteredProducts =
    activeCategory === 'ALL'
      ? filteredProducts
      : filteredProducts.filter(product => product.category === activeCategory)

  return (
    <>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 inset-s-3 size-4 -translate-y-1/2" />
        <Input
          ref={inputRef ?? localInputRef}
          value={activeSearch}
          onChange={event => handleSearchChange(event.target.value)}
          placeholder={t('pos.searchPlaceholder')}
          aria-label={t('pos.searchLabel')}
          className="ps-9 pe-12"
        />
        <kbd className="bg-muted text-muted-foreground pointer-events-none absolute inset-e-3 top-1/2 -translate-y-1/2 rounded border px-1.5 py-0.5 font-mono text-[10px]">
          F1
        </kbd>
      </div>

      <div
        role="group"
        aria-label={t('pos.categoryFilter.label')}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        <Button
          type="button"
          size="sm"
          variant={activeCategory === 'ALL' ? 'default' : 'outline'}
          className="shrink-0 transition-colors duration-150"
          onClick={() => setActiveCategory('ALL')}
        >
          {t('pos.categoryFilter.all')}
        </Button>
        {categories.map(category => (
          <Button
            type="button"
            key={category}
            size="sm"
            variant={activeCategory === category ? 'default' : 'outline'}
            className="shrink-0 transition-colors duration-150"
            onClick={() => setActiveCategory(category)}
          >
            {category}
          </Button>
        ))}
      </div>

      {categoryFilteredProducts.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center text-sm">
          <PackageSearch className="size-8 opacity-60" />
          <p>{t('pos.empty')}</p>
        </div>
      ) : (
        <div className="grid min-h-0 w-full min-w-0 flex-1 auto-rows-min content-start gap-3 overflow-y-auto overflow-x-hidden pb-1 sm:grid-cols-2 xl:grid-cols-3">
          {categoryFilteredProducts.map(product => {
            const status = getStockStatus(
              product.quantity,
              product.minThreshold
            )
            const style = stockStatusStyles[status]
            const StatusIcon = style.icon
            const inCart = cartQtyByProduct.get(product.id) ?? 0
            // Disabled when out of stock or when the cart already holds every unit.
            const canAdd = product.quantity > 0 && inCart < product.quantity

            return (
              <div
                key={product.id}
                className="flex flex-col gap-2 rounded-lg border p-3 transition-all duration-150 hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {product.name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {product.sku}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn('shrink-0', style.badgeClassName)}
                  >
                    <StatusIcon className="size-3" />
                    {t('pos.catalog.stock', { qty: product.quantity })}
                  </Badge>
                </div>

                <div className="flex items-end justify-between gap-2">
                  <p className="text-base font-semibold">
                    {formatMoney(product.sellingPrice)}
                  </p>
                  <span className="text-muted-foreground text-xs">
                    {resolveProductUnit(product.unit)}
                  </span>
                </div>

                <div className="mt-auto flex items-center justify-between gap-2">
                  {inCart > 0 ? (
                    <span className="text-muted-foreground text-xs">
                      {t('pos.catalog.inCart', { qty: inCart })}
                    </span>
                  ) : (
                    <span />
                  )}
                  <Button
                    size="sm"
                    className="ms-auto"
                    disabled={!canAdd}
                    onClick={() => {
                      useCartStore.getState().addToCart(product)
                      playScanBeep({ frequency: 1047, durationMs: 65 })
                    }}
                  >
                    <Plus className="size-4" />
                    {t('pos.catalog.addToCart')}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
