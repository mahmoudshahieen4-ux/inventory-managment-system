import type { TimeRange } from '@/types/analytics'

const DAYS_BACK: Record<TimeRange, number> = {
  TODAY: 0,
  '1_WEEK': 7,
  '1_MONTH': 30,
  '3_MONTHS': 90,
  '6_MONTHS': 180,
}

export const timeRangeLabelKeys: Record<TimeRange, string> = {
  TODAY: 'sales.range.today',
  '1_WEEK': 'sales.range.week',
  '1_MONTH': 'sales.range.month',
  '3_MONTHS': 'sales.range.quarter',
  '6_MONTHS': 'sales.range.halfYear',
}

/** Local calendar midnight, serialized like sales.created_at (UTC ISO).
 * Week/month mean the last 7/30 days, not calendar week/month boundaries.
 * Calendar arithmetic preserves local midnight across daylight-saving changes.
 */
export function cutoffForRange(range: TimeRange, now = new Date()): string {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - DAYS_BACK[range])
  cutoff.setHours(0, 0, 0, 0)
  return cutoff.toISOString()
}
