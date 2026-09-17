import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { stockStatusStyles } from '@/components/inventory/stock-status-config'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/money'
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
}

/** Left POS pane: instant search plus a grid of sellable product cards. */
export function ProductCatalog({
  search,
  onSearchChange,
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

  const cartQtyByProduct = new Map(
    cartItems.map(item => [item.productId, item.quantity])
  )

  const normalizedSearch = activeSearch.trim().toLowerCase()
  const sellableProducts = products.filter(product => product.quantity > 0)
  const filteredProducts = normalizedSearch
    ? sellableProducts.filter(
        product =>
          product.name.toLowerCase().includes(normalizedSearch) ||
          product.sku.toLowerCase().includes(normalizedSearch) ||
          (product.barcode ?? '').toLowerCase().includes(normalizedSearch)
      )
    : sellableProducts

  return (
    <>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" />
        <Input
          value={activeSearch}
          onChange={event => handleSearchChange(event.target.value)}
          placeholder={t('pos.searchPlaceholder')}
          aria-label={t('pos.searchLabel')}
          className="ps-9"
        />
      </div>

      {filteredProducts.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          {t('pos.empty')}
        </div>
      ) : (
        <div className="grid min-h-0 w-full min-w-0 flex-1 auto-rows-min content-start gap-3 overflow-y-auto overflow-x-hidden pb-1 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map(product => {
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
                className="flex flex-col gap-2 rounded-lg border p-3"
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
                    onClick={() => useCartStore.getState().addToCart(product)}
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
