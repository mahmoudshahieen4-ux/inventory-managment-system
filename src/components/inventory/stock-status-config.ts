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
    badgeClassName: 'border-red-500/40 bg-red-500/10 text-red-400',
    rowClassName: 'border-s-2 border-s-red-500 bg-red-950/30',
  },
  LOW_STOCK: {
    labelKey: 'inventory.status.lowStock',
    icon: AlertTriangle,
    badgeClassName: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
    rowClassName: 'border-s-2 border-s-amber-500 bg-amber-950/30',
  },
  IN_STOCK: {
    labelKey: 'inventory.status.inStock',
    icon: CheckCircle2,
    badgeClassName: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
    rowClassName: 'border-s-2 border-s-transparent',
  },
}
