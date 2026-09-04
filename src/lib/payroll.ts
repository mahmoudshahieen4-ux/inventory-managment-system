/**
 * Pure helpers for the Workers Payroll module.
 *
 * Kept free of store/React coupling so the monthly payroll math is easy to
 * unit test and stays deterministic (see `payroll.test.ts`).
 */
import type {
  AdvanceRecord,
  AttendanceRecord,
  AttendanceStatus,
  MonthlyPayrollSummary,
  Worker,
} from '@/types/payroll'

/** Attendance weight applied to `daysAttended` for each status. */
export const ATTENDANCE_PAY: Record<AttendanceStatus, number> = {
  PRESENT: 1,
  HALF_DAY: 0.5,
  ABSENT: 0,
}

/** Converts a `Date` into the `YYYY-MM-DD` key used by the SQLite tables. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Returns the `YYYY-MM-` prefix used to filter a whole calendar month. */
export function monthPrefix(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-`
}

/** Returns the `YYYY-MM` key used to identify a calendar month period. */
export function monthYearKey(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

/**
 * True when the `YYYY-MM-DD` key represents a date strictly after today.
 * Used to reject attendance/advance entries planned for future days.
 */
export function isFutureDate(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return true
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(`${dateKey}T00:00:00`) > today
}

/** Localized month label (e.g. "March") for a given year/month. */
export function monthName(year: number, month: number, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, { month: 'long' }).format(
    new Date(year, month - 1, 1)
  )
}

interface BuildSummaryInput {
  worker: Worker | undefined
  /** Attendance of the worker (any dates — filtered to the month internally). */
  attendance: AttendanceRecord[]
  /** Advances of the worker (any dates — filtered to the month internally). */
  advances: AdvanceRecord[]
  year: number
  /** 1-based month (1 = January, 12 = December). */
  month: number
}

/**
 * Aggregates one worker's attendance/advances into a monthly payroll summary.
 * The worker may be undefined (e.g. deleted while old records still exist);
 * in that case the summary is computed with a zero daily rate.
 */
export function buildMonthlySummary({
  worker,
  attendance,
  advances,
  year,
  month,
}: BuildSummaryInput): MonthlyPayrollSummary {
  const prefix = monthPrefix(year, month)

  const monthAttendance = attendance.filter(record =>
    record.date.startsWith(prefix)
  )
  const presentDays = monthAttendance.filter(
    record => record.status === 'PRESENT'
  ).length
  const halfDays = monthAttendance.filter(
    record => record.status === 'HALF_DAY'
  ).length
  const daysAttended = presentDays + halfDays * ATTENDANCE_PAY.HALF_DAY

  const totalDeductions = monthAttendance.reduce(
    (sum, record) => sum + record.deductionAmount,
    0
  )
  const totalAdvances = advances
    .filter(record => record.date.startsWith(prefix))
    .reduce((sum, record) => sum + record.amount, 0)

  const dailyRate = worker?.dailyRate ?? 0
  const totalEarnings = daysAttended * dailyRate

  return {
    workerId: worker?.id ?? '',
    workerName: worker?.name ?? '—',
    dailyRate,
    presentDays,
    halfDays,
    daysAttended,
    totalEarnings,
    totalDeductions,
    totalAdvances,
    netPayable: totalEarnings - totalDeductions - totalAdvances,
  }
}
