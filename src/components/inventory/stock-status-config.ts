import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { StockStatus } from '@/types/inventory'

interface StockStatusStyle {
  /** i18n key for the status label shown in the badge. */
  labelKey: string
  icon: LucideIcon
  /** Softly-filled outlined pill styling for the status badge. */
  badgeClassName: string
  /** Subtle row tint + colored left border (no full-row color overlay). */
  rowClassName: string
}

export const stockStatusStyles: Record<StockStatus, StockStatusStyle> = {
  OUT_OF_STOCK: {
    labelKey: 'inventory.status.outOfStock',
    icon: XCircle,
    badgeClassName:
      'border-red-200 bg-red-50 text-red-800 dark:border-rose-800/40 dark:bg-rose-950/40 dark:text-[#FB7185]',
    rowClassName: 'border-b border-[#E5E7EB] bg-white dark:bg-card',
  },
  LOW_STOCK: {
    labelKey: 'inventory.status.lowStock',
    icon: AlertTriangle,
    badgeClassName:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-[#FBBF24]',
    rowClassName: 'border-b border-[#E5E7EB] bg-white dark:bg-card',
  },
  IN_STOCK: {
    labelKey: 'inventory.status.inStock',
    icon: CheckCircle2,
    badgeClassName:
      'border-green-200 bg-green-50 text-green-800 dark:border-emerald-800/30 dark:bg-emerald-950/30 dark:text-[#34D399]',
    rowClassName: 'border-b border-[#E5E7EB] bg-white dark:bg-card',
  },
}
