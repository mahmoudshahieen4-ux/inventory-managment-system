import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/useAuthStore'
import { useSalesStore } from '@/store/useSalesStore'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { usePosShortcuts } from '@/hooks/use-pos-shortcuts'
import { playScanBeep } from '@/lib/barcode'
import { findProductByBarcode, isTauriRuntime } from '@/services/db'
import { useCartStore } from '@/store/useCartStore'
import { useInventoryStore } from '@/store/useInventoryStore'
import type { CreditNote, ReturnItem, Sale } from '@/types/sales'
import { CartSummary } from './CartSummary'
import { ProductCatalog } from './ProductCatalog'
import { ReceiptModal } from './ReceiptModal'
import { SalesHistory } from './SalesHistory'
import { ReturnModal } from './ReturnModal'
import { CreditNoteModal } from './CreditNoteModal'

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
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnSale, setReturnSale] = useState<Sale | null>(null)
  const [creditNote, setCreditNote] = useState<CreditNote | null>(null)
  const [creditNoteOpen, setCreditNoteOpen] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')

  /**
   * Hands-free barcode scanning: USB/Bluetooth scanners behave like keyboards,
   * so the hook replays their output to this callback on `Enter`.
   */
  const handleScan = async (scanned: string): Promise<void> => {
    const code = scanned.trim()
    const product =
      useInventoryStore
        .getState()
        .products.find(entry => entry.barcode === code || entry.sku === code) ??
      // Safety net: the in-memory store may not be hydrated yet in desktop.
      (isTauriRuntime() ? await findProductByBarcode(code) : null)

    if (!product) {
      toast.error(t('pos.scan.notFound', { barcode: code }))
      return
    }
    if (product.quantity <= 0) {
      toast.error(t('pos.scan.outOfStock', { name: product.name }))
      return
    }
    const inCart =
      useCartStore.getState().items.find(item => item.productId === product.id)
        ?.quantity ?? 0
    if (inCart >= product.quantity) {
      toast.error(t('pos.scan.maxStock', { qty: product.quantity }))
      return
    }

    useCartStore.getState().addToCart(product)
    // Clear the catalog search so leaked scanner keystrokes never linger.
    setCatalogSearch('')
    playScanBeep()
    toast.success(t('pos.scan.added', { name: product.name }))
  }

  // Only listen while the catalog (sales) panel is visible; the sales-history
  // search box has its own barcode-aware filter.
  useBarcodeScanner(
    scanned => {
      void handleScan(scanned)
    },
    { enabled: tab === 'catalog' }
  )

  // Keyboard-driven POS flow: F1 new sale, F2 cash payment, F12 print, ESC clear.
  usePosShortcuts({
    onNewSale: () => {
      useCartStore.getState().clearCart()
      setCatalogSearch('')
      setTab('catalog')
      toast.info(t('pos.toast.cartCleared'))
    },
    onClearCart: () => {
      useCartStore.getState().clearCart()
      toast.info(t('pos.toast.cartCleared'))
    },
    onPrintReceipt: () => {
      // Printing is only meaningful while the receipt modal is open.
      if (receiptOpen) window.print()
    },
  })

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
          <ProductCatalog
            search={catalogSearch}
            onSearchChange={setCatalogSearch}
          />
        ) : (
          <SalesHistory
            onReprint={sale => {
              setReceiptSale(sale)
              setReceiptOpen(true)
            }}
            onReturn={sale => {
              setReturnSale(sale)
              setReturnOpen(true)
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
      <ReturnModal
        sale={returnSale}
        open={returnOpen}
        onOpenChange={setReturnOpen}
        onComplete={(items: ReturnItem[]) => {
          if (!returnSale) return
          const note = useSalesStore
            .getState()
            .createCreditNote(
              returnSale,
              items,
              useAuthStore.getState().currentUser?.displayName ?? 'cashier'
            )
          setCreditNote(note)
          setCreditNoteOpen(true)
        }}
      />
      <CreditNoteModal
        note={creditNote}
        open={creditNoteOpen}
        onOpenChange={setCreditNoteOpen}
      />
    </div>
  )
}
