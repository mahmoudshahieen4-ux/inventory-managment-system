import type { Product, ProductUnit } from '@/types/inventory'

/**
 * Canonical unit values stored in the database.
 *
 * Units are persisted as stable, language-neutral keys (Arabic strings, kept
 * for backwards compatibility with existing rows) while the visible labels come
 * from i18n, so switching the UI language never rewrites stored data.
 */
export const PRODUCT_UNIT_VALUES = {
  PIECE: 'قطعة',
  BOX: 'علبة',
  CARTON: 'كرتونة',
} as const satisfies Record<string, ProductUnit>

/**
 * Unit used whenever a product has no explicit unit.
 *
 * Product management deliberately avoids unit conversions: every product is
 * counted in whole pieces unless the user picks something else, so the UI never
 * has to render an empty/"unspecified" unit.
 */
export const DEFAULT_PRODUCT_UNIT: string = PRODUCT_UNIT_VALUES.PIECE

/**
 * Trims a raw unit value read from state, SQLite, or form input.
 * Returns an empty string for `null`/`undefined`/blank values.
 */
export function normalizeProductUnit(unit?: string | null): string {
  return typeof unit === 'string' ? unit.trim() : ''
}

/**
 * Display/persistence helper: always yields a usable unit, falling back to
 * {@link DEFAULT_PRODUCT_UNIT} instead of an empty or "unspecified" label.
 */
export function resolveProductUnit(unit?: string | null): string {
  return normalizeProductUnit(unit) || DEFAULT_PRODUCT_UNIT
}

/** Whether the product is counted in cartons. */
export function isCartonUnit(unit?: string | null): boolean {
  return normalizeProductUnit(unit) === PRODUCT_UNIT_VALUES.CARTON
}

/**
 * Boxes contained in one carton, when the product is sold by the carton.
 * Returns `undefined` for every other unit so stale counts never leak.
 */
export function resolveUnitsPerCarton(
  product: Pick<Product, 'unit' | 'unitsPerCarton'>
): number | undefined {
  const boxes = Number(product.unitsPerCarton)
  if (!isCartonUnit(product.unit) || !Number.isFinite(boxes) || boxes <= 0) {
    return undefined
  }
  return boxes
}
