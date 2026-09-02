import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Sale } from '@/types/sales'
import { CartSummary } from './CartSummary'
import { ProductCatalog } from './ProductCatalog'
import { ReceiptModal } from './ReceiptModal'
import { SalesHistory } from './SalesHistory'

/** Which panel the left POS pane shows. */
type PosTab = 'catalog' | 'history'

/**
 * Point of Sale screen: product catalog (or sales history) on the left, the
 * current sale on the right. Checkout runs in CartSummary; the recorded sale
 * opens the receipt modal here. Past invoices can be re-opened for re-printing.
 */
export function POSScreen() {
  const { t } = useTranslation()
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null)
  const [tab, setTab] = useState<PosTab>('catalog')

  return (
    <div className="grid h-full min-h-0 w-full min-w-0 grid-cols-12 gap-4 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-4 sm:py-4">
      {/* Left: product catalog with fast search, or sales history */}
      <section className="col-span-12 flex min-w-0 flex-col gap-3 lg:col-span-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">{t('pos.title')}</h1>
            <p className="text-muted-foreground text-sm">
              {t('pos.description')}
            </p>
          </div>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={tab}
            onValueChange={value => {
              if (value === 'catalog' || value === 'history') setTab(value)
            }}
            aria-label={t('pos.tabLabel')}
          >
            <ToggleGroupItem value="catalog">
              {t('pos.tabCatalog')}
            </ToggleGroupItem>
            <ToggleGroupItem value="history">
              {t('pos.tabHistory')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {tab === 'catalog' ? (
          <ProductCatalog />
        ) : (
          <SalesHistory
            onReprint={sale => {
              setReceiptSale(sale)
              setReceiptOpen(true)
            }}
          />
        )}
      </section>

      {/* Right: current sale / cart summary */}
      <section className="col-span-12 flex min-w-0 ps-0 lg:col-span-4 lg:ps-1">
        <CartSummary
          onCheckoutComplete={sale => {
            setReceiptSale(sale)
            setReceiptOpen(true)
          }}
        />
      </section>

      <ReceiptModal
        sale={receiptSale}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
      />
    </div>
  )
}
