/**
 * Core domain types for POS sales and checkout.
 */

/** A line item currently in the cart, before checkout. */
export interface CartItem {
  productId: string
  sku: string
  name: string
  unitPrice: number
  quantity: number
}

/** An immutable line item recorded on a completed sale. */
export interface SaleItem extends CartItem {
  lineTotal: number
}

/** A completed sale transaction and its receipt data. */
export interface Sale {
  id: string
  /** Human-friendly sequential invoice number (e.g. INV-0001) shown on receipts. */
  invoiceNumber: string
  items: SaleItem[]
  subtotal: number
  tax: number
  total: number
  cashierId: string
  createdAt: string
}
