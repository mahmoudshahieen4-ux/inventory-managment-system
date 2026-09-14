/**
 * أنواع البيانات لوحة تحليلات المنتجات.
 *
 * تحتوي على جميع الواجهات والأنواع المستخدمة في صفحة التحليلات
 * الإدارية لعرض أداء المبيعات والأرباح والرواكد.
 */

/** النطاق الزمني المتاح للتحليلات. */
export type TimeRange = 'TODAY' | '1_MONTH' | '3_MONTHS' | '6_MONTHS'

/** طريقة ترتيب جدول المنتجات الأكثر مبيعاً. */
export type AnalyticsSortMode = 'profit' | 'quantity'

/** بيانات تحليلات منتج واحد مجمعة من المبيعات. */
export interface ProductAnalyticsItem {
  /** معرف المنتج. */
  productId: string
  /** اسم المنتج كما هو مسجل في فواتير البيع. */
  productName: string
  /** إجمالي الكمية المباعة خلال الفترة المحددة. */
  totalQuantitySold: number
  /** إجمالي الإيرادات (المبيعات) للمنتج. */
  totalRevenue: number
  /** إجمالي الأرباح المحققة من المنتج. */
  totalProfit: number
  /** هامش الربح كنسبة مئوية (مثلاً 25.5%). */
  profitMargin: number
}

/** منتج راكد أو بطيء الحركة مع رأس المال المجمّد. */
export interface DeadStockItem {
  /** معرف المنتج. */
  productId: string
  /** اسم المنتج. */
  productName: string
  /** كود المنتج (SKU). */
  sku: string
  /** التصنيف. */
  category: string
  /** الكمية الحالية في المخزون. */
  quantity: number
  /** سعر الشراء للوحدة. */
  purchasePrice: number
  /** رأس المال المجمّد (الكمية × سعر الشراء). */
  tiedUpCapital: number
  /** الكمية المباعة خلال الفترة (صفر أو منخفضة جداً). */
  quantitySold: number
}

/** منتج مرتب حسب هامش الربح الأعلى. */
export interface HighestMarginItem {
  /** معرف المنتج. */
  productId: string
  /** اسم المنتج. */
  productName: string
  /** كود المنتج (SKU). */
  sku: string
  /** التصنيف. */
  category: string
  /** سعر الشراء. */
  purchasePrice: number
  /** سعر البيع. */
  sellingPrice: number
  /** هامش الربح كنسبة مئوية. */
  profitMarginPercent: number
}

/** ملخص المؤشرات الرئيسية للوحة التحليلات. */
export interface AnalyticsSummary {
  /** إجمالي عدد القطع المباعة خلال الفترة. */
  totalUnitsSold: number
  /** إجمالي إيرادات المبيعات. */
  totalRevenue: number
  /** إجمالي الأرباح المحققة. */
  totalProfit: number
  /** قيمة رأس المال المجمّد في الرواكد. */
  deadStockValue: number
}

/** الاستجابة الكاملة لدالة جلب التحليلات. */
export interface AnalyticsData {
  /** المؤشرات الرئيسية. */
  summary: AnalyticsSummary
  /** أداء كل منتج (الأكثر مبيعاً/ربحاً). */
  productPerformance: ProductAnalyticsItem[]
  /** المنتجات الراكدة وبطيئة الحركة. */
  deadStock: DeadStockItem[]
  /** المنتجات الأعلى هامش ربح. */
  highestMargins: HighestMarginItem[]
}
