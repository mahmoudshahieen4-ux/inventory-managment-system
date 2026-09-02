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
    badgeClassName: 'border-rose-800/40 bg-rose-950/40 text-[#FB7185]',
    rowClassName: 'border-s-2 border-s-rose-800/40 bg-rose-950/40',
  },
  LOW_STOCK: {
    labelKey: 'inventory.status.lowStock',
    icon: AlertTriangle,
    badgeClassName: 'border-amber-800/40 bg-amber-950/40 text-[#FBBF24]',
    rowClassName: 'border-s-2 border-s-amber-800/40 bg-amber-950/40',
  },
  IN_STOCK: {
    labelKey: 'inventory.status.inStock',
    icon: CheckCircle2,
    badgeClassName: 'border-emerald-800/30 bg-emerald-950/30 text-[#34D399]',
    rowClassName: 'border-s-2 border-s-emerald-800/30 bg-emerald-950/30',
  },
}
