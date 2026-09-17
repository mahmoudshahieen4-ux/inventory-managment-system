import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { StockStatus } from '@/types/inventory'

interface StockStatusStyle {
  /** i18n key for the status label shown in the badge. */
  labelKey: string
  icon: LucideIcon
  /** Softly-filled outlined pill styling for the status badge. */
  badgeClassName: string
  /**
   * Theme-aware row styling: base background, explicit light/dark hover, and
   * — for low/out stock — a subtle accent border on the reading-start edge.
   * Normal rows override hover with their unchanged base background.
   * These classes are applied AFTER the shared `<TableRow>` base classes
   * through `cn` (tailwind-merge), so they replace the default hover
   * deterministically instead of fighting the CSS cascade.
   */
  rowClassName: string
}

export const stockStatusStyles: Record<StockStatus, StockStatusStyle> = {
  OUT_OF_STOCK: {
    labelKey: 'inventory.status.outOfStock',
    icon: XCircle,
    badgeClassName:
      'border-red-200 bg-red-50 text-red-800 dark:border-rose-800/40 dark:bg-rose-950/40 dark:text-[#FB7185]',
    rowClassName:
      'border-s-2 border-s-red-400/60 border-b border-b-[#E5E7EB] bg-red-50/70 hover:bg-red-100/80 dark:border-s-red-500/50 dark:border-b-border dark:bg-red-950/30 dark:hover:bg-red-900/40',
  },
  LOW_STOCK: {
    labelKey: 'inventory.status.lowStock',
    icon: AlertTriangle,
    badgeClassName:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-[#FBBF24]',
    rowClassName:
      'border-s-2 border-s-amber-400/60 border-b border-b-[#E5E7EB] bg-amber-50/70 hover:bg-amber-100/80 dark:border-s-amber-500/50 dark:border-b-border dark:bg-amber-950/30 dark:hover:bg-amber-900/40',
  },
  IN_STOCK: {
    labelKey: 'inventory.status.inStock',
    icon: CheckCircle2,
    badgeClassName:
      'border-green-200 bg-green-50 text-green-800 dark:border-emerald-800/30 dark:bg-emerald-950/30 dark:text-[#34D399]',
    rowClassName:
      'border-b border-b-[#E5E7EB] bg-white hover:bg-white dark:border-b-border dark:bg-card dark:hover:bg-card transition-none',
  },
}
