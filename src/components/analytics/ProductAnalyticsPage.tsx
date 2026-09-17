/**
 * صفحة تحليلات المنتجات للمدير.
 *
 * لوحة تحكم شاملة تعرض أداء المبيعات، الأرباح، المنتجات الأكثر مبيعاً،
 * المنتجات الراكدة، وأعلى المنتجات هامش ربح.
 * مقتصرة على المستخدمين بدور ADMIN فقط.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BarChart3,
  Boxes,
  DollarSign,
  PackageX,
  Percent,
  TrendingUp,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatMoney } from '@/lib/money'
import { timeRangeLabelKeys } from '@/lib/sales-time-range'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/useAuthStore'
import { fetchFullAnalytics } from '@/services/db'
import type {
  AnalyticsData,
  AnalyticsSortMode,
  TimeRange,
} from '@/types/analytics'

/* ------------------------------------------------------------------ */
/* الثوابت المساعدة                                                    */
/* ------------------------------------------------------------------ */

const ANALYTICS_RANGES: TimeRange[] = [
  'TODAY',
  '1_WEEK',
  '1_MONTH',
  '3_MONTHS',
  '6_MONTHS',
]

/** يحدد لون شارة هامش الربح بناءً على القيمة. */
function marginBadgeVariant(
  margin: number
): 'default' | 'secondary' | 'destructive' | undefined {
  if (margin >= 40) return 'default'
  if (margin >= 20) return 'secondary'
  return 'destructive'
}

/* ------------------------------------------------------------------ */
/* Range-keyed persistent analytics queries                            */
/* ------------------------------------------------------------------ */

interface AnalyticsState {
  data: AnalyticsData | null
  isLoading: boolean
  error: string | null
  range: TimeRange
  setRange: (range: TimeRange) => void
}

/** Range-keyed queries keep late responses from replacing the active report. */
function useAnalytics(): AnalyticsState {
  const [range, setRange] = useState<TimeRange>('TODAY')
  const { data, isLoading, error } = useQuery({
    queryKey: ['product-analytics', range],
    queryFn: () => fetchFullAnalytics(range),
  })

  return {
    data: data ?? null,
    isLoading,
    error: error?.message ?? null,
    range,
    setRange,
  }
}

/* ------------------------------------------------------------------ */
/* مكون البطاقة الإحصائية (KPI)                                        */
/* ------------------------------------------------------------------ */

interface KpiCardProps {
  title: string
  value: string
  icon: React.ReactNode
  badgeLabel?: string
  isLoading: boolean
}

function KpiCard({ title, value, icon, badgeLabel, isLoading }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-3/4" />
        ) : (
          <div className="text-2xl font-bold tabular-nums">{value}</div>
        )}
        {badgeLabel && !isLoading && (
          <Badge variant="outline" className="mt-2 text-[11px]">
            {badgeLabel}
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* المكون الرئيسي للوحة التحليلات                                       */
/* ------------------------------------------------------------------ */

export function ProductAnalyticsPage() {
  const { t } = useTranslation()
  const role = useAuthStore(state => state.currentUser?.role)
  const isAdmin = role === 'ADMIN'
  const [sortMode, setSortMode] = useState<AnalyticsSortMode>('profit')
  const { data, isLoading, error, range, setRange } = useAnalytics()

  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <Empty>
          <EmptyMedia variant="icon">
            <BarChart3 className="size-8" />
          </EmptyMedia>
          <EmptyTitle>{t('analytics.accessDenied')}</EmptyTitle>
          <EmptyDescription>{t('analytics.accessDeniedDesc')}</EmptyDescription>
        </Empty>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <Empty>
          <EmptyMedia variant="icon">
            <PackageX className="size-8" />
          </EmptyMedia>
          <EmptyTitle>{t('analytics.errorTitle')}</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4 sm:p-6">
      <AnalyticsHeader range={range} onRangeChange={setRange} />
      <KpiCardsSection
        summary={data?.summary ?? null}
        isLoading={isLoading}
        range={range}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <TopProductsCard
          products={data?.productPerformance ?? []}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          isLoading={isLoading}
        />
        <HighestMarginCard
          products={data?.highestMargins ?? []}
          isLoading={isLoading}
        />
      </div>
      <DeadStockCard items={data?.deadStock ?? []} isLoading={isLoading} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* الترويسة ومحدد النطاق الزمني                                        */
/* ------------------------------------------------------------------ */

interface AnalyticsHeaderProps {
  range: TimeRange
  onRangeChange: (range: TimeRange) => void
}

function AnalyticsHeader({ range, onRangeChange }: AnalyticsHeaderProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
          <BarChart3 className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {t('analytics.pageTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('analytics.pageSubtitle')}
          </p>
        </div>
      </div>
      <ToggleGroup
        type="single"
        value={range}
        onValueChange={value => {
          if (value) onRangeChange(value as TimeRange)
        }}
        variant="outline"
        size="sm"
        className="self-start sm:self-auto"
      >
        {ANALYTICS_RANGES.map(option => (
          <ToggleGroupItem key={option} value={option}>
            {t(timeRangeLabelKeys[option])}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* قسم البطاقات الإحصائية الأربع                                       */
/* ------------------------------------------------------------------ */

interface KpiCardsSectionProps {
  summary: AnalyticsData['summary'] | null
  isLoading: boolean
  /** الفترة المختارة — عند اختيار «اليوم» تتبدّل عناوين البطاقات لصيغة يومية. */
  range: TimeRange
}

function KpiCardsSection({ summary, isLoading, range }: KpiCardsSectionProps) {
  const { t } = useTranslation()
  const isToday = range === 'TODAY'
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title={t(
          isToday ? 'analytics.kpi.unitsSoldToday' : 'analytics.kpi.unitsSold'
        )}
        value={isLoading ? '' : String(summary?.totalUnitsSold ?? 0)}
        icon={<Boxes className="size-4" />}
        badgeLabel={t('analytics.kpi.unitsSoldBadge')}
        isLoading={isLoading}
      />
      <KpiCard
        title={t(
          isToday
            ? 'analytics.kpi.totalRevenueToday'
            : 'analytics.kpi.totalRevenue'
        )}
        value={isLoading ? '' : formatMoney(summary?.totalRevenue ?? 0)}
        icon={<DollarSign className="size-4" />}
        badgeLabel={t('analytics.kpi.revenueBadge')}
        isLoading={isLoading}
      />
      <KpiCard
        title={t(
          isToday ? 'analytics.kpi.netProfitToday' : 'analytics.kpi.netProfit'
        )}
        value={isLoading ? '' : formatMoney(summary?.totalProfit ?? 0)}
        icon={<TrendingUp className="size-4" />}
        badgeLabel={t('analytics.kpi.profitBadge')}
        isLoading={isLoading}
      />
      <KpiCard
        title={t('analytics.kpi.deadStockValue')}
        value={isLoading ? '' : formatMoney(summary?.deadStockValue ?? 0)}
        icon={<PackageX className="size-4" />}
        badgeLabel={t('analytics.kpi.deadStockBadge')}
        isLoading={isLoading}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* بطاقة المنتجات الأكثر مبيعاً ورابحة                                  */
/* ------------------------------------------------------------------ */

interface TopProductsCardProps {
  products: AnalyticsData['productPerformance']
  sortMode: AnalyticsSortMode
  onSortModeChange: (mode: AnalyticsSortMode) => void
  isLoading: boolean
}

function TopProductsCard({
  products,
  sortMode,
  onSortModeChange,
  isLoading,
}: TopProductsCardProps) {
  const { t } = useTranslation()
  const sorted = isLoading
    ? []
    : [...products].sort((a, b) =>
        sortMode === 'profit'
          ? b.totalProfit - a.totalProfit
          : b.totalQuantitySold - a.totalQuantitySold
      )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="size-4 text-emerald-500" />
          {t('analytics.topProducts.title')}
        </CardTitle>
        <CardDescription>
          {t('analytics.topProducts.description')}
        </CardDescription>
        <Tabs
          value={sortMode}
          onValueChange={v => onSortModeChange(v as AnalyticsSortMode)}
          className="w-fit"
        >
          <TabsList className="h-8">
            <TabsTrigger value="profit" className="text-xs">
              {t('analytics.topProducts.sortByProfit')}
            </TabsTrigger>
            <TabsTrigger value="quantity" className="text-xs">
              {t('analytics.topProducts.sortByQuantity')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-6">
            <Empty className="border-0">
              <EmptyMedia variant="icon">
                <TrendingUp className="size-6" />
              </EmptyMedia>
              <EmptyTitle>{t('analytics.empty.noSalesTitle')}</EmptyTitle>
              <EmptyDescription>
                {t('analytics.empty.noSalesDesc')}
              </EmptyDescription>
            </Empty>
          </div>
        ) : (
          <div className="max-h-[360px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>{t('analytics.topProducts.colName')}</TableHead>
                  <TableHead className="text-center">
                    {t('analytics.topProducts.colQty')}
                  </TableHead>
                  <TableHead className="text-center">
                    {t('analytics.topProducts.colRevenue')}
                  </TableHead>
                  <TableHead className="text-center">
                    {t('analytics.topProducts.colProfit')}
                  </TableHead>
                  <TableHead className="text-center">
                    {t('analytics.topProducts.colMargin')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.slice(0, 15).map(p => (
                  <TableRow key={p.productId}>
                    <TableCell className="font-medium">
                      <div className="max-w-[140px] truncate">
                        {p.productName}
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {p.totalQuantitySold}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {formatMoney(p.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-center font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatMoney(p.totalProfit)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={marginBadgeVariant(p.profitMargin)}
                        className="text-[11px]"
                      >
                        {p.profitMargin}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* بطاقة المنتجات الأعلى هامش ربح                                      */
/* ------------------------------------------------------------------ */

interface HighestMarginCardProps {
  products: AnalyticsData['highestMargins']
  isLoading: boolean
}

function HighestMarginCard({ products, isLoading }: HighestMarginCardProps) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Percent className="size-4 text-blue-500" />
          {t('analytics.highestMargin.title')}
        </CardTitle>
        <CardDescription>
          {t('analytics.highestMargin.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="p-6">
            <Empty className="border-0">
              <EmptyMedia variant="icon">
                <Percent className="size-6" />
              </EmptyMedia>
              <EmptyTitle>{t('analytics.empty.noProductsTitle')}</EmptyTitle>
              <EmptyDescription>
                {t('analytics.empty.noProductsDesc')}
              </EmptyDescription>
            </Empty>
          </div>
        ) : (
          <div className="max-h-[360px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>{t('analytics.highestMargin.colName')}</TableHead>
                  <TableHead className="text-center">
                    {t('analytics.highestMargin.colPurchase')}
                  </TableHead>
                  <TableHead className="text-center">
                    {t('analytics.highestMargin.colSelling')}
                  </TableHead>
                  <TableHead className="text-center">
                    {t('analytics.highestMargin.colMargin')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.slice(0, 15).map(p => (
                  <TableRow key={p.productId}>
                    <TableCell className="font-medium">
                      <div className="max-w-[140px] truncate">
                        {p.productName}
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-muted-foreground">
                      {formatMoney(p.purchasePrice)}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {formatMoney(p.sellingPrice)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={marginBadgeVariant(p.profitMarginPercent)}
                        className="text-[11px]"
                      >
                        {p.profitMarginPercent}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* بطاقة الرواكد والمنتجات بطيئة الحركة                                */
/* ------------------------------------------------------------------ */

interface DeadStockCardProps {
  items: AnalyticsData['deadStock']
  isLoading: boolean
}

function DeadStockCard({ items, isLoading }: DeadStockCardProps) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageX className="size-4 text-amber-500" />
          {t('analytics.deadStock.title')}
        </CardTitle>
        <CardDescription>
          {t('analytics.deadStock.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-6">
            <Empty className="border-0">
              <EmptyMedia variant="icon">
                <Boxes className="size-6" />
              </EmptyMedia>
              <EmptyTitle>{t('analytics.empty.noDeadStockTitle')}</EmptyTitle>
              <EmptyDescription>
                {t('analytics.empty.noDeadStockDesc')}
              </EmptyDescription>
            </Empty>
          </div>
        ) : (
          <div className="max-h-[320px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>{t('analytics.deadStock.colName')}</TableHead>
                  <TableHead className="text-center">
                    {t('analytics.deadStock.colSku')}
                  </TableHead>
                  <TableHead className="text-center">
                    {t('analytics.deadStock.colQty')}
                  </TableHead>
                  <TableHead className="text-center">
                    {t('analytics.deadStock.colQtySold')}
                  </TableHead>
                  <TableHead className="text-center">
                    {t('analytics.deadStock.colTiedCapital')}
                  </TableHead>
                  <TableHead className="text-center">
                    {t('analytics.deadStock.colStatus')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow
                    key={item.productId}
                    className={cn(
                      item.quantitySold === 0 &&
                        'bg-red-50/50 dark:bg-red-950/20'
                    )}
                  >
                    <TableCell className="font-medium">
                      <div className="max-w-[140px] truncate">
                        {item.productName}
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs text-muted-foreground">
                      {item.sku}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {item.quantitySold}
                    </TableCell>
                    <TableCell className="text-center font-medium tabular-nums text-amber-600 dark:text-amber-400">
                      {formatMoney(item.tiedUpCapital)}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.quantitySold === 0 ? (
                        <Badge
                          variant="outline"
                          className="border-red-200 bg-red-50 text-red-800 dark:border-rose-800/40 dark:bg-rose-950/40 dark:text-[#FB7185] text-[11px]"
                        >
                          {t('analytics.deadStock.statusDead')}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-[#FBBF24] text-[11px]"
                        >
                          {t('analytics.deadStock.statusSlow')}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
