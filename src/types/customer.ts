/**
 * Domain types for the Customer Debt & Credit Management module
 * (إدارة مديونيات وحسابات العملاء).
 *
 * Mirrors the `customers` / `customer_ledger` SQLite tables created in
 * `src/services/db.ts` (snake_case columns ↔ camelCase fields via row mappers).
 */

/** Reason a `customer_ledger` audit row was written. */
export type CustomerLedgerType = 'SALE_CREDIT' | 'PAYMENT' | 'MANUAL_ADJUSTMENT'

/** How a debt payment was settled. */
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER'

/** A customer account whose running debt is tracked. */
export interface Customer {
  id: string
  name: string
  phone: string
  address: string
  /**
   * Running debt the customer owes the shop (مديونية). Positive means the
   * customer owes money; `0` means the account is settled.
   */
  currentBalance: number
  createdAt: string
}

/** Payload used when creating or updating a customer profile. */
export interface CustomerInput {
  name: string
  phone?: string
  address?: string
}

/**
 * One immutable row in a customer's ledger (كشف الحساب). Entries are only ever
 * appended — the running balance is derived from them, never edited in place.
 */
export interface CustomerLedgerEntry {
  id: string
  customerId: string
  type: CustomerLedgerType
  /** Positive magnitude of the movement (never negative). */
  amount: number
  /** Balance before this movement. */
  previousBalance: number
  /** Balance after this movement. */
  newBalance: number
  /** Linked sale id / payment reference, when the movement came from one. */
  referenceId: string | null
  notes: string
  createdAt: string
}

/**
 * A ledger movement to persist. The previous/new balances are computed
 * atomically inside the transaction, so they are not part of this input.
 */
export interface CustomerLedgerInput {
  id: string
  customerId: string
  type: CustomerLedgerType
  amount: number
  referenceId: string | null
  notes: string
  createdAt: string
}
