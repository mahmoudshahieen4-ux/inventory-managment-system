/**
 * Core domain types for the Workers Payroll & Attendance module.
 *
 * These types map to the SQLite tables created in `src/services/db.ts`
 * (snake_case columns ↔ camelCase fields via dedicated row mappers).
 */

/** Daily attendance options for a single worker. */
export type AttendanceStatus = 'PRESENT' | 'HALF_DAY' | 'ABSENT'

/** Operational status of a worker record. */
export type WorkerStatus = 'ACTIVE' | 'INACTIVE'

/** A worker whose daily attendance and salary are tracked. */
export interface Worker {
  id: string
  name: string
  phone: string
  /** Fixed amount earned for one full attendance day. */
  dailyRate: number
  status: WorkerStatus
  createdAt: string
}

/** Payload used when creating or updating a worker (id/timestamps managed). */
export type WorkerInput = Pick<Worker, 'name' | 'phone' | 'dailyRate'> & {
  status?: WorkerStatus
}

/** Daily attendance for one worker — unique per (workerId, date). */
export interface AttendanceRecord {
  id: string
  workerId: string
  /** Day this record applies to, formatted as `YYYY-MM-DD`. */
  date: string
  status: AttendanceStatus
  /** Optional additional deduction for that day (damages, fines, etc.). */
  deductionAmount: number
  notes: string
  createdAt: string
}

/** A cash advance granted to a worker, deducted from the monthly salary. */
export interface AdvanceRecord {
  id: string
  workerId: string
  amount: number
  /** Day the advance was granted, formatted as `YYYY-MM-DD`. */
  date: string
  notes: string
  createdAt: string
}

/**
 * Aggregated payroll figures for a single worker in one calendar month.
 * Computed by `buildMonthlySummary` in `src/lib/payroll.ts`.
 */
export interface MonthlyPayrollSummary {
  workerId: string
  workerName: string
  /** Base daily rate of the worker (snake_case column `daily_rate`). */
  dailyRate: number
  /** Number of full PRESENT days. */
  presentDays: number
  /** Number of HALF_DAY entries. */
  halfDays: number
  /** Weighted attendance — a full day counts 1, a half day counts 0.5. */
  daysAttended: number
  /** `daysAttended × dailyRate`. */
  totalEarnings: number
  /** Sum of `deductionAmount` across attendance records in the month. */
  totalDeductions: number
  /** Sum of advance amounts granted in the month. */
  totalAdvances: number
  /** `totalEarnings − totalDeductions − totalAdvances`. */
  netPayable: number
}
/**
 * A finalized monthly salary payout for a worker. Persisted in the
 * `salary_payments` SQLite table (snake_case ↔ camelCase via `toSalaryPayment`).
 */
export interface SalaryPaymentRecord {
  id: string
  workerId: string
  /** Calendar period the salary covers, formatted as `YYYY-MM`. */
  monthYear: string
  /** Gross earnings before deductions (`daysAttended × dailyRate`). */
  baseAmount: number
  /** Sum of `deductionAmount` across attendance records in the month. */
  totalDeductions: number
  /** Sum of advance amounts granted in the month. */
  totalAdvances: number
  /** `baseAmount − totalDeductions − totalAdvances`. */
  netAmount: number
  /** ISO timestamp when the payout was made. */
  paidAt: string
  /** The user/role that authorized the payout. */
  paidBy: string
}

/** A salary payout logged as an operating expense so profits reflect wages. */
export interface OperatingExpenseRecord {
  id: string
  /** Day the expense was recorded, formatted as `YYYY-MM-DD`. */
  expenseDate: string
  /** Expense bucket, e.g. `SALARY`. */
  category: string
  /** Human-readable description, e.g. "صرف راتب - [Worker] - [YYYY-MM]". */
  description: string
  /** Positive amount spent (net salary payout). */
  amount: number
  createdAt: string
}
