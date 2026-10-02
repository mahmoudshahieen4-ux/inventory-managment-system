/**
 * Core domain types for POS sales and checkout.
 */

/** A line item currently in the cart, before checkout. */
export type SaleUnit = 'box' | 'carton'

export interface CartItem {
  productId: string
  sku: string
  name: string
  purchasePrice?: number
  unitPrice: number
  quantity: number
  unit?: SaleUnit
}

/** An immutable line item recorded on a completed sale. */
export interface SaleItem extends CartItem {
  lineTotal: number
  profit?: number
}

/** How a sale was settled at checkout. */
export type PaymentType = 'CASH' | 'CREDIT'

/** A completed sale transaction and its receipt data. */
export interface Sale {
  id: string
  /** Human-friendly sequential invoice number (e.g. INV-0001) shown on receipts. */
  invoiceNumber: string
  items: SaleItem[]
  subtotal: number
  tax: number
  total: number
  totalProfit?: number
  cashierId: string
  createdAt: string
  /** Linked customer account when the sale was on account (آجل). */
  customerId?: string
  customerName?: string
  /** Settlement type: cash in full, or credit (possibly partially paid). */
  paymentType?: PaymentType
  /** Amount actually paid at checkout (== `total` for a full cash sale). */
  paidAmount?: number
}

/** A line included in a partial or full return. */
export interface ReturnItem {
  productId: string
  name: string
  sku: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

/** Immutable credit note issued instead of mutating the original invoice. */
export interface CreditNote {
  id: string
  creditNoteNumber: string
  originalInvoiceNumber: string
  originalSaleId: string
  items: ReturnItem[]
  total: number
  cashierId: string
  createdAt: string
}
