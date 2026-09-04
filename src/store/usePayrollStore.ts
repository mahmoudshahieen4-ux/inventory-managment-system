import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { toast } from 'sonner'

import i18n from '@/i18n/config'
import {
  buildMonthlySummary,
  isFutureDate,
  monthYearKey,
  toDateKey,
} from '@/lib/payroll'
import {
  deleteWorkerRow,
  fetchSalaryPayments,
  fetchWorkersData,
  initializeDatabase,
  isTauriRuntime,
  persistAdvance,
  persistAttendance,
  persistOperatingExpense,
  persistSalaryPayment,
  persistWorker,
} from '@/services/db'
import type {
  AdvanceRecord,
  AttendanceRecord,
  AttendanceStatus,
  MonthlyPayrollSummary,
  SalaryPaymentRecord,
  Worker,
  WorkerInput,
} from '@/types/payroll'

/**
 * Seed workers used to initialize the payroll store on first launch,
 * mirroring the inventory store's seed-data pattern.
 */
export const initialWorkers: Worker[] = [
  {
    id: 'worker-001',
    name: 'أحمد محمد',
    phone: '0100 000 0001',
    dailyRate: 250,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'worker-002',
    name: 'محمود علي',
    phone: '0100 000 0002',
    dailyRate: 200,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  },
]

interface PayrollState {
  workers: Worker[]
  attendance: AttendanceRecord[]
  advances: AdvanceRecord[]
  /** Finalized monthly payouts — any worker/month present here is frozen. */
  salaryPayments: SalaryPaymentRecord[]

  /** Creates a worker (id + createdAt generated), persists and returns it. */
  addWorker: (input: WorkerInput) => Worker
  /** Updates existing worker fields, then persists and replaces the row. */
  updateWorker: (id: string, updates: Partial<WorkerInput>) => void
  /** Removes a worker together with their attendance/advance records. */
  deleteWorker: (id: string) => void
  /**
   * Upserts one day of attendance for a worker. Re-saving the same
   * (workerId, date) updates the existing record instead of creating a
   * duplicate — the same behavior enforced by the SQLite UNIQUE constraint.
   */
  recordAttendance: (
    workerId: string,
    date: string,
    input: {
      status: AttendanceStatus
      deductionAmount?: number
      notes?: string
    }
  ) => void
  /**
   * Records a cash advance for a worker (deducted from the monthly salary).
   * Returns the created record, or null when the date is in the future or
   * the target month was already paid (frozen).
   */
  addAdvance: (
    workerId: string,
    input: { amount: number; date?: string; notes?: string }
  ) => AdvanceRecord | null
  /** Pure monthly aggregation selector, backed by `buildMonthlySummary`. */
  getMonthlySummary: (
    workerId: string,
    year: number,
    month: number
  ) => MonthlyPayrollSummary
  /**
   * Finalizes the monthly salary for a worker (صرف الراتب): persists a
   * `salary_payments` row, logs the net payout as an operating expense and
   * freezes the month's records. All amounts are derived from
   * `getMonthlySummary` — the single source of truth — so the stored record
   * always matches the audited attendance/advance data. Returns the created
   * record, or null when the month is already paid or the worker is missing.
   */
  paySalary: (
    workerId: string,
    year: number,
    month: number,
    paidBy: string
  ) => SalaryPaymentRecord | null
  /** True when the worker's salary for the given month was already paid. */
  isSalaryPaid: (workerId: string, year: number, month: number) => boolean
  /** Loads stored payroll data from SQLite; seeds the database on first launch. */
  hydrate: () => Promise<void>
}

/** Fire-and-forget persistence helper: local state first, toast on DB failure. */
function persist(action: () => Promise<void>): void {
  if (!isTauriRuntime()) return
  action().catch(error => {
    toast.error(`${i18n.t('db.toast.saveFailed')}: ${String(error)}`)
  })
}

/** Coerces numeric/optional fields so string inputs never reach state or SQL. */
function coerceWorkerInput(input: WorkerInput): Required<WorkerInput> {
  return {
    name: input.name?.trim() ?? '',
    phone: input.phone?.trim() ?? '',
    dailyRate: Number(input.dailyRate) || 0,
    status: input.status ?? 'ACTIVE',
  }
}

/** True when the worker's salary for the month of `dateKey` was paid. */
function isMonthPaid(
  salaryPayments: SalaryPaymentRecord[],
  workerId: string,
  dateKey: string
): boolean {
  return salaryPayments.some(
    payment =>
      payment.workerId === workerId && payment.monthYear === dateKey.slice(0, 7)
  )
}

export const usePayrollStore = create<PayrollState>()(
  devtools(
    (set, get) => ({
      workers: initialWorkers,
      attendance: [],
      advances: [],
      salaryPayments: [],

      addWorker: input => {
        const worker: Worker = {
          ...coerceWorkerInput(input),
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        }
        set(
          state => ({ workers: [...state.workers, worker] }),
          undefined,
          'payroll/addWorker'
        )
        persist(() => persistWorker(worker))
        return worker
      },

      updateWorker: (id, updates) => {
        const current = get().workers.find(worker => worker.id === id)
        if (!current) return
        const merged = coerceWorkerInput({
          name: updates.name ?? current.name,
          phone: updates.phone ?? current.phone,
          dailyRate: updates.dailyRate ?? current.dailyRate,
          status: updates.status ?? current.status,
        })
        const worker: Worker = { ...current, ...merged }
        set(
          state => ({
            workers: state.workers.map(item =>
              item.id === id ? worker : item
            ),
          }),
          undefined,
          'payroll/updateWorker'
        )
        persist(() => persistWorker(worker))
      },

      deleteWorker: id => {
        set(
          state => ({
            workers: state.workers.filter(worker => worker.id !== id),
            attendance: state.attendance.filter(
              record => record.workerId !== id
            ),
            advances: state.advances.filter(record => record.workerId !== id),
            salaryPayments: state.salaryPayments.filter(
              payment => payment.workerId !== id
            ),
          }),
          undefined,
          'payroll/deleteWorker'
        )
        persist(() => deleteWorkerRow(id))
      },
      recordAttendance: (workerId, date, input) => {
        // Guard: attendance can never be recorded for a future day.
        if (isFutureDate(date)) {
          toast.error(i18n.t('payroll.errors.futureDate'))
          return
        }
        // Guard: a month whose salary was already paid is frozen.
        if (isMonthPaid(get().salaryPayments, workerId, date)) {
          toast.error(i18n.t('payroll.errors.monthPaid'))
          return
        }
        const existing = get().attendance.find(
          record => record.workerId === workerId && record.date === date
        )
        const record: AttendanceRecord = {
          id: existing?.id ?? crypto.randomUUID(),
          workerId,
          date,
          status: input.status,
          deductionAmount: Number(input.deductionAmount) || 0,
          notes: input.notes?.trim() ?? existing?.notes ?? '',
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        }
        set(
          state => ({
            attendance: [
              ...state.attendance.filter(
                item => !(item.workerId === workerId && item.date === date)
              ),
              record,
            ],
          }),
          undefined,
          'payroll/recordAttendance'
        )
        persist(() => persistAttendance(record))
      },

      addAdvance: (workerId, input) => {
        const date = input.date ?? toDateKey(new Date())
        // Guard: advances can never be granted for a future day.
        if (isFutureDate(date)) {
          toast.error(i18n.t('payroll.errors.futureDate'))
          return null
        }
        // Guard: a month whose salary was already paid is frozen.
        if (isMonthPaid(get().salaryPayments, workerId, date)) {
          toast.error(i18n.t('payroll.errors.monthPaid'))
          return null
        }
        const record: AdvanceRecord = {
          id: crypto.randomUUID(),
          workerId,
          amount: Number(input.amount) || 0,
          date,
          notes: input.notes?.trim() ?? '',
          createdAt: new Date().toISOString(),
        }
        set(
          state => ({ advances: [...state.advances, record] }),
          undefined,
          'payroll/addAdvance'
        )
        persist(() => persistAdvance(record))
        return record
      },

      getMonthlySummary: (workerId, year, month) => {
        const { workers, attendance, advances } = get()
        return buildMonthlySummary({
          worker: workers.find(worker => worker.id === workerId),
          attendance: attendance.filter(record => record.workerId === workerId),
          advances: advances.filter(record => record.workerId === workerId),
          year,
          month,
        })
      },

      paySalary: (workerId, year, month, paidBy) => {
        const worker = get().workers.find(item => item.id === workerId)
        if (!worker) {
          toast.error(i18n.t('payroll.errors.workerNotFound'))
          return null
        }
        // Idempotency guard: a month can only be paid once.
        if (get().isSalaryPaid(workerId, year, month)) {
          toast.error(i18n.t('payroll.errors.alreadyPaid'))
          return null
        }

        const summary = get().getMonthlySummary(workerId, year, month)
        const now = new Date()
        const payment: SalaryPaymentRecord = {
          id: crypto.randomUUID(),
          workerId,
          monthYear: monthYearKey(year, month),
          baseAmount: summary.totalEarnings,
          totalDeductions: summary.totalDeductions,
          totalAdvances: summary.totalAdvances,
          netAmount: summary.netPayable,
          paidAt: now.toISOString(),
          paidBy,
        }

        set(
          state => ({ salaryPayments: [payment, ...state.salaryPayments] }),
          undefined,
          'payroll/paySalary'
        )

        // Fire-and-forget persistence: the payout row plus an operating
        // expense entry so net-profit reports reflect the wage expense.
        persist(() => persistSalaryPayment(payment))
        persist(() =>
          persistOperatingExpense({
            id: crypto.randomUUID(),
            expenseDate: toDateKey(now),
            category: 'SALARY',
            description: i18n.t('payroll.expense.description', {
              name: worker.name,
              period: payment.monthYear,
            }),
            amount: payment.netAmount,
            createdAt: now.toISOString(),
          })
        )
        return payment
      },

      isSalaryPaid: (workerId, year, month) =>
        get().salaryPayments.some(
          payment =>
            payment.workerId === workerId &&
            payment.monthYear === monthYearKey(year, month)
        ),

      hydrate: async () => {
        if (!isTauriRuntime()) return
        try {
          await initializeDatabase()
          const [stored, salaryPayments] = await Promise.all([
            fetchWorkersData(),
            fetchSalaryPayments(),
          ])
          if (stored.workers.length > 0) {
            set(
              {
                workers: stored.workers,
                attendance: stored.attendance,
                advances: stored.advances,
                salaryPayments,
              },
              undefined,
              'payroll/hydrate'
            )
          } else {
            // First launch: persist the seed workers so they survive restarts.
            for (const worker of get().workers) {
              await persistWorker(worker)
            }
          }
        } catch (error) {
          toast.error(`${i18n.t('db.toast.loadFailed')}: ${String(error)}`)
          throw error
        }
      },
    }),
    { name: 'payroll-store' }
  )
)
