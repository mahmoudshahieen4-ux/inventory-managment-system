import { describe, expect, it } from 'vitest'

import {
  ATTENDANCE_PAY,
  buildMonthlySummary,
  monthPrefix,
  toDateKey,
} from './payroll'
import type { AdvanceRecord, AttendanceRecord, Worker } from '@/types/payroll'

const worker: Worker = {
  id: 'worker-001',
  name: 'Ali',
  phone: '',
  dailyRate: 200,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
}

const attendance: AttendanceRecord[] = [
  {
    id: 'a1',
    workerId: 'worker-001',
    date: '2026-09-01',
    status: 'PRESENT',
    deductionAmount: 0,
    notes: '',
    createdAt: '2026-09-01T08:00:00.000Z',
  },
  {
    id: 'a2',
    workerId: 'worker-001',
    date: '2026-09-02',
    status: 'PRESENT',
    deductionAmount: 0,
    notes: '',
    createdAt: '2026-09-02T08:00:00.000Z',
  },
  {
    id: 'a3',
    workerId: 'worker-001',
    date: '2026-09-03',
    status: 'HALF_DAY',
    deductionAmount: 0,
    notes: '',
    createdAt: '2026-09-03T08:00:00.000Z',
  },
  // ABSENT with an extra deduction for the day.
  {
    id: 'a4',
    workerId: 'worker-001',
    date: '2026-09-04',
    status: 'ABSENT',
    deductionAmount: 20,
    notes: 'Damaged stock',
    createdAt: '2026-09-04T08:00:00.000Z',
  },
  // Inside the same year but a different month — must be excluded.
  {
    id: 'a5',
    workerId: 'worker-001',
    date: '2026-10-01',
    status: 'PRESENT',
    deductionAmount: 0,
    notes: '',
    createdAt: '2026-10-01T08:00:00.000Z',
  },
]

const advances: AdvanceRecord[] = [
  {
    id: 'adv-1',
    workerId: 'worker-001',
    amount: 150,
    date: '2026-09-10',
    notes: '',
    createdAt: '2026-09-10T09:00:00.000Z',
  },
  // Outside the queried month — must be excluded.
  {
    id: 'adv-2',
    workerId: 'worker-001',
    amount: 50,
    date: '2026-10-01',
    notes: '',
    createdAt: '2026-10-01T09:00:00.000Z',
  },
]

describe('payroll helpers', () => {
  it('formats dates as YYYY-MM-DD', () => {
    expect(toDateKey(new Date(2026, 8, 4))).toBe('2026-09-04')
    expect(toDateKey(new Date(2026, 0, 1))).toBe('2026-01-01')
  })

  it('builds a month prefix for filtering', () => {
    expect(monthPrefix(2026, 9)).toBe('2026-09-')
    expect(monthPrefix(2026, 11)).toBe('2026-11-')
  })

  it('assigns the attendance pay weights', () => {
    expect(ATTENDANCE_PAY.PRESENT).toBe(1)
    expect(ATTENDANCE_PAY.HALF_DAY).toBe(0.5)
    expect(ATTENDANCE_PAY.ABSENT).toBe(0)
  })

  it('computes a full monthly summary', () => {
    const summary = buildMonthlySummary({
      worker,
      attendance,
      advances,
      year: 2026,
      month: 9,
    })

    expect(summary).toMatchObject({
      workerId: 'worker-001',
      workerName: 'Ali',
      dailyRate: 200,
      presentDays: 2,
      halfDays: 1,
      daysAttended: 2.5,
      totalEarnings: 500,
      totalDeductions: 20,
      totalAdvances: 150,
      netPayable: 330,
    })
  })

  it('returns a zeroed summary when the worker is missing', () => {
    const summary = buildMonthlySummary({
      worker: undefined,
      attendance,
      advances,
      year: 2026,
      month: 9,
    })

    expect(summary).toMatchObject({
      workerId: '',
      dailyRate: 0,
      totalEarnings: 0,
      netPayable: -170, // deductions + advances still counted
    })
  })
})
