import type { ProductBatch } from '@/types/inventory'

export interface FefoPlan {
  deductions: { batchId: string; quantity: number }[]
  remainingQuantity: number
}

export function planFefoDeductions(
  batches: ProductBatch[],
  requestedQuantity: number
): FefoPlan {
  let remainingQuantity = Math.max(0, Math.floor(requestedQuantity))
  const datedBatches = batches
    .filter(batch => batch.expiryDate != null && batch.quantity > 0)
    .slice()
    .sort((left, right) => {
      const expiryOrder = (left.expiryDate ?? '').localeCompare(
        right.expiryDate ?? ''
      )
      return expiryOrder || left.createdAt.localeCompare(right.createdAt)
    })
  const deductions: FefoPlan['deductions'] = []

  for (const batch of datedBatches) {
    if (remainingQuantity === 0) break
    const quantity = Math.min(batch.quantity, remainingQuantity)
    deductions.push({ batchId: batch.id, quantity })
    remainingQuantity -= quantity
  }

  return { deductions, remainingQuantity }
}
