import type { StockStatus } from '@/types/inventory'

/**
 * Derives the stock availability status for a product.
 *
 * - `OUT_OF_STOCK` when quantity is at or below zero.
 * - `LOW_STOCK` when quantity is positive but at or below the reorder threshold.
 * - `IN_STOCK` when quantity is above the reorder threshold.
 */
export function getStockStatus(
  quantity: number,
  minThreshold: number
): StockStatus {
  if (quantity <= 0) return 'OUT_OF_STOCK'
  if (quantity <= minThreshold) return 'LOW_STOCK'
  return 'IN_STOCK'
}
