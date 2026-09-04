import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatMoney } from '@/lib/money'
import { useAuthStore } from '@/store/useAuthStore'
import {
  roundMoney,
  selectCartSubtotal,
  selectCartTax,
  selectCartTotal,
  TAX_RATE,
  useCartStore,
} from '@/store/useCartStore'
import { useInventoryStore } from '@/store/useInventoryStore'
import { useSalesStore } from '@/store/useSalesStore'
import type { Sale, SaleItem } from '@/types/sales'

/** Tax rate as a whole percentage for display (0.05 → 5). */
const TAX_PERCENT = Math.round(TAX_RATE * 100)

interface CartSummaryProps {
  /** Called with the recorded sale after a successful checkout. */
  onCheckoutComplete: (sale: Sale) => void
}

/** Right POS pane: current sale lines, quantity controls, totals and checkout. */
export function CartSummary({ onCheckoutComplete }: CartSummaryProps) {
  const { t } = useTranslation()

  const products = useInventoryStore(state => state.products)
  const cartItems = useCartStore(state => state.items)
  const subtotal = useCartStore(selectCartSubtotal)
  const tax = useCartStore(selectCartTax)
  const total = useCartStore(selectCartTotal)

  const handleClearCart = () => {
    useCartStore.getState().clearCart()
    toast.info(t('pos.toast.cartCleared'))
  }

  const handleCheckout = () => {
    const { items } = useCartStore.getState()
    if (items.length === 0) return

    // 1. Deduct the sold quantities from the inventory immediately.
    const currentProducts = useInventoryStore.getState().products
    for (const item of items) {
      const product = currentProducts.find(entry => entry.id === item.productId)
      if (!product) continue
      useInventoryStore.getState().updateProduct(item.productId, {
        quantity: Math.max(0, product.quantity - item.quantity),
      })
    }

    // 2. Record the completed sale.
    const saleItems: SaleItem[] = items.map(item => ({
      ...item,
      lineTotal: roundMoney(item.unitPrice * item.quantity),
      profit: roundMoney(
        (item.unitPrice - (item.purchasePrice ?? 0)) * item.quantity
      ),
    }))
    const cartState = useCartStore.getState()
    const sale = useSalesStore.getState().addSale({
      items: saleItems,
      subtotal: selectCartSubtotal(cartState),
      tax: selectCartTax(cartState),
      total: selectCartTotal(cartState),
      totalProfit: roundMoney(
        saleItems.reduce((sum, item) => sum + (item.profit ?? 0), 0)
      ),
      cashierId:
        useAuthStore.getState().currentUser?.username ?? 'guest',
    })

    // 3. Reset the cart for the next sale and hand the receipt to the parent.
    useCartStore.getState().clearCart()
    onCheckoutComplete(sale)
    toast.success(t('pos.toast.saleSuccess'))
  }

  const handleQuantityChange = (
    productId: string,
    stock: number,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const parsedQuantity = Number.parseInt(event.target.value, 10)
    if (Number.isNaN(parsedQuantity)) return
    useCartStore
      .getState()
      .updateQuantity(productId, Math.min(parsedQuantity, stock))
  }

  return (
    <Card className="flex h-full min-h-0 w-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingCart className="size-4" />
          {t('pos.cart.title')}
        </CardTitle>
        <CardDescription>
          {t('pos.cart.itemsCount', { qty: cartItems.length })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        {cartItems.length === 0 ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
            {t('pos.cart.empty')}
          </div>
        ) : (
          <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {cartItems.map(item => {
              const stock =
                products.find(product => product.id === item.productId)
                  ?.quantity ?? 0

              return (
                <li key={item.productId} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {item.name}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {item.sku} · {formatMoney(item.unitPrice)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-red-500 size-7"
                      aria-label={t('pos.cart.remove')}
                      onClick={() =>
                        useCartStore.getState().removeFromCart(item.productId)
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7"
                        aria-label={t('pos.cart.decrease')}
                        disabled={item.quantity <= 1}
                        onClick={() =>
                          useCartStore
                            .getState()
                            .updateQuantity(item.productId, item.quantity - 1)
                        }
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <input
                        type="number"
                        min={1}
                        max={stock}
                        value={item.quantity}
                        aria-label={t('pos.cart.quantity', { name: item.name })}
                        className="border-input bg-background text-foreground h-7 w-14 rounded-md border text-center text-sm font-medium outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                        onChange={event =>
                          handleQuantityChange(item.productId, stock, event)
                        }
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7"
                        aria-label={t('pos.cart.increase')}
                        disabled={item.quantity >= stock}
                        onClick={() =>
                          useCartStore
                            .getState()
                            .updateQuantity(item.productId, item.quantity + 1)
                        }
                      >
                        <Plus className="size-3.5" />
                      </Button>
                      <span className="text-muted-foreground ms-2 text-xs">
                        {t('pos.cart.maxStock', { qty: stock })}
                      </span>
                    </div>
                    <span className="text-sm font-semibold">
                      {formatMoney(roundMoney(item.unitPrice * item.quantity))}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="space-y-2 border-t pt-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {t('pos.cart.subtotal')}
            </span>
            <span>{formatMoney(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {t('pos.cart.tax', { rate: TAX_PERCENT })}
            </span>
            <span>{formatMoney(tax)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <span>{t('pos.cart.total')}</span>
            <span>{formatMoney(total)}</span>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              disabled={cartItems.length === 0}
              onClick={handleClearCart}
            >
              {t('pos.cart.clearCart')}
            </Button>
            <Button
              className="flex-[2]"
              disabled={cartItems.length === 0}
              onClick={handleCheckout}
            >
              <ShoppingCart className="size-4" />
              {t('pos.cart.checkout')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
