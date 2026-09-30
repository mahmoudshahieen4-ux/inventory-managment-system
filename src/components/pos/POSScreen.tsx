import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Archive, CircleHelp, PauseCircle } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { useSalesStore } from '@/store/useSalesStore'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { usePosShortcuts } from '@/hooks/use-pos-shortcuts'
import { playErrorBeep, playScanBeep } from '@/lib/barcode'
import { findProductByBarcode, isTauriRuntime } from '@/services/db'
import { useCartStore } from '@/store/useCartStore'
import { useInventoryStore } from '@/store/useInventoryStore'
import { useHeldInvoicesStore } from '@/store/useHeldInvoicesStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { CreditNote, ReturnItem, Sale } from '@/types/sales'
import { CartSummary } from './CartSummary'
import { ProductCatalog } from './ProductCatalog'
import { ReceiptModal } from './ReceiptModal'
import { SalesHistory } from './SalesHistory'
import { ReturnModal } from './ReturnModal'
import { CreditNoteModal } from './CreditNoteModal'
import { HoldCartDialog } from './HoldCartDialog'
import { HeldInvoicesModal } from './HeldInvoicesModal'

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
  const [holdOpen, setHoldOpen] = useState(false)
  const [heldInvoicesOpen, setHeldInvoicesOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const cartItemCount = useCartStore(state => state.items.length)
  const heldInvoiceCount = useHeldInvoicesStore(
    state => state.heldInvoices.length
  )

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
      playErrorBeep()
      toast.error(t('pos.scan.notFound', { barcode: code }))
      return
    }
    if (product.quantity <= 0) {
      playErrorBeep()
      toast.error(t('pos.scan.outOfStock', { name: product.name }))
      return
    }
    const inCart =
      useCartStore.getState().items.find(item => item.productId === product.id)
        ?.quantity ?? 0
    if (inCart >= product.quantity) {
      playErrorBeep()
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

  // Keyboard-driven POS flow for cashier speed.
  usePosShortcuts({
    onFocusSearch: () => {
      setTab('catalog')
      requestAnimationFrame(() => searchInputRef.current?.focus())
    },
    onHoldCart: () => {
      if (useCartStore.getState().items.length > 0) setHoldOpen(true)
      else setHeldInvoicesOpen(true)
    },
    onClearCart: () => {
      useCartStore.getState().clearCart()
      useHeldInvoicesStore.getState().clearActiveHeldInvoice()
      toast.info(t('pos.toast.cartCleared'))
    },
    onPrintReceipt: () => {
      // Printing is only meaningful while the receipt modal is open — and never
      // while a checkout is still committing (a held F12 must not queue prints
      // for a receipt that is not on screen yet).
      if (receiptOpen && !useSalesStore.getState().isSubmitting) window.print()
    },
  })

  return (
    <div
      dir="ltr"
      className="grid h-full min-h-0 w-full min-w-0 grid-cols-12 gap-4 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-4 sm:py-4"
    >
      {/* Left: product catalog with fast search, or sales history */}
      <section
        dir="rtl"
        className="col-span-12 flex min-w-0 flex-col gap-3 lg:col-span-8"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">{t('pos.title')}</h1>
            <p className="text-muted-foreground text-sm">
              {t('pos.description')}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={cartItemCount === 0}
              onClick={() => setHoldOpen(true)}
            >
              <PauseCircle />
              {t('pos.held.holdAction')}
              <kbd className="rounded border px-1 font-mono text-[10px]">
                F3
              </kbd>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setHeldInvoicesOpen(true)}
            >
              <Archive />
              {t('pos.held.openAction')}
              <Badge
                variant="secondary"
                className="ms-1 min-w-5 justify-center px-1"
              >
                {heldInvoiceCount}
              </Badge>
            </Button>
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
        </div>

        {tab === 'catalog' ? (
          <ProductCatalog
            search={catalogSearch}
            onSearchChange={setCatalogSearch}
            inputRef={searchInputRef}
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
      <section
        dir="rtl"
        className="col-span-12 flex min-w-0 ps-0 lg:col-span-4 lg:ps-1"
      >
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
        onComplete={(items: ReturnItem[], stockUpdates) => {
          if (!returnSale) return
          const note = useSalesStore
            .getState()
            .createCreditNote(
              returnSale,
              items,
              useAuthStore.getState().currentUser?.displayName ?? 'cashier',
              stockUpdates
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
      <HoldCartDialog open={holdOpen} onOpenChange={setHoldOpen} />
      <HeldInvoicesModal
        open={heldInvoicesOpen}
        onOpenChange={setHeldInvoicesOpen}
      />
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="fixed inset-e-5 bottom-5 z-40 size-11 rounded-full border shadow-md transition-transform duration-150 hover:scale-105"
        aria-label={t('pos.shortcuts.openHelp')}
        title={t('pos.shortcuts.openHelp')}
        onClick={() => setHelpOpen(true)}
      >
        <CircleHelp className="size-5" />
      </Button>
      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent side="right" className="w-[min(24rem,90vw)] p-0">
          <SheetHeader className="border-b pe-12 pt-6 pb-4">
            <SheetTitle>{t('pos.shortcuts.title')}</SheetTitle>
            <SheetDescription>
              {t('pos.shortcuts.description')}
            </SheetDescription>
          </SheetHeader>
          <div dir="rtl" className="space-y-1 p-4">
            {(['F1', 'F2', 'F3', 'F4', 'F12'] as const).map(key => (
              <div
                key={key}
                className="flex items-center justify-between gap-3 border-b py-3 last:border-0"
              >
                <span className="text-sm">{t(`pos.shortcuts.${key}`)}</span>
                <kbd className="bg-muted text-foreground rounded border px-2 py-1 font-mono text-xs">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
