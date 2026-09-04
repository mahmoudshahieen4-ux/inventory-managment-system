import { describe, it, expect, beforeEach } from 'vitest'

import { initialWorkers, usePayrollStore } from './usePayrollStore'
import type { Worker } from '@/types/payroll'

function seedWorker(): Worker {
  const created = usePayrollStore
    .getState()
    .addWorker({ name: 'Test Worker', phone: '0100', dailyRate: 200 })
  return created
}

describe('PayrollStore', () => {
  beforeEach(() => {
    usePayrollStore.setState({
      workers: [...initialWorkers],
      attendance: [],
      advances: [],
    })
  })

  it('is seeded with workers on first load', () => {
    const { workers } = usePayrollStore.getState()
    expect(workers.length).toBeGreaterThan(0)
    for (const worker of workers) {
      expect(worker.dailyRate).toBeGreaterThan(0)
      expect(worker.status).toBe('ACTIVE')
    }
  })

  it('adds a worker and generates an id', () => {
    const created = usePayrollStore
      .getState()
      .addWorker({ name: 'New Worker', phone: '0111', dailyRate: 300 })

    const { workers } = usePayrollStore.getState()
    expect(workers).toHaveLength(initialWorkers.length + 1)
    expect(created.id).toBeTruthy()
    expect(workers.at(-1)).toMatchObject({
      id: created.id,
      name: 'New Worker',
      phone: '0111',
      dailyRate: 300,
      status: 'ACTIVE',
    })
  })

  it('updates a worker while preserving untouched fields', () => {
    const worker = usePayrollStore.getState().workers[0]
    if (!worker) throw new Error('Expected seeded workers')

    usePayrollStore.getState().updateWorker(worker.id, { dailyRate: 999 })

    const updated = usePayrollStore
      .getState()
      .workers.find(item => item.id === worker.id)
    expect(updated).toMatchObject({
      id: worker.id,
      name: worker.name,
      dailyRate: 999,
      status: 'ACTIVE',
    })
  })

  it('records attendance and upserts the same (workerId, date)', () => {
    recordAttendance('worker-001', '2026-09-01', 'PRESENT', 0)
    // Saving again the same day must update instead of duplicating.
    recordAttendance('worker-001', '2026-09-01', 'HALF_DAY', 10)

    const { attendance } = usePayrollStore.getState()
    expect(attendance).toHaveLength(1)
    expect(attendance[0]).toMatchObject({
      workerId: 'worker-001',
      date: '2026-09-01',
      status: 'HALF_DAY',
      deductionAmount: 10,
    })
  })

  it('keeps attendance for the same worker on different days', () => {
    recordAttendance('worker-001', '2026-09-01', 'PRESENT', 0)
    recordAttendance('worker-001', '2026-09-02', 'ABSENT', 0)
    recordAttendance('worker-002', '2026-09-01', 'PRESENT', 0)

    const { attendance } = usePayrollStore.getState()
    expect(attendance).toHaveLength(3)
  })

  it('records a cash advance', () => {
    usePayrollStore
      .getState()
      .addAdvance('worker-001', { amount: 120, date: '2026-09-05' })

    const { advances } = usePayrollStore.getState()
    expect(advances).toHaveLength(1)
    expect(advances[0]).toMatchObject({
      workerId: 'worker-001',
      amount: 120,
      date: '2026-09-05',
    })
  })

  it('computes monthly summaries through the selector', () => {
    const worker = seedWorker()
    const workerId = worker.id

    recordAttendance(workerId, '2026-09-01', 'PRESENT', 0)
    recordAttendance(workerId, '2026-09-02', 'PRESENT', 0)
    recordAttendance(workerId, '2026-09-03', 'HALF_DAY', 10)
    usePayrollStore
      .getState()
      .addAdvance(workerId, { amount: 100, date: '2026-09-10' })

    const summary = usePayrollStore
      .getState()
      .getMonthlySummary(workerId, 2026, 9)

    expect(summary).toMatchObject({
      workerId,
      workerName: 'Test Worker',
      dailyRate: 200,
      presentDays: 2,
      halfDays: 1,
      daysAttended: 2.5,
      totalEarnings: 500,
      totalDeductions: 10,
      totalAdvances: 100,
      netPayable: 390,
    })
  })

  it('deletes a worker and cascades attendance/advances', () => {
    const worker = seedWorker()
    recordAttendance(worker.id, '2026-09-01', 'PRESENT', 0)
    usePayrollStore
      .getState()
      .addAdvance(worker.id, { amount: 50, date: '2026-09-02' })

    usePayrollStore.getState().deleteWorker(worker.id)

    const { workers, attendance, advances } = usePayrollStore.getState()
    expect(workers.find(item => item.id === worker.id)).toBeUndefined()
    expect(attendance.some(record => record.workerId === worker.id)).toBe(false)
    expect(advances.some(record => record.workerId === worker.id)).toBe(false)
  })
})

/** Shortcut helper: records attendance with an optional deduction. */
function recordAttendance(
  workerId: string,
  date: string,
  status: 'PRESENT' | 'HALF_DAY' | 'ABSENT',
  deductionAmount: number
): void {
  usePayrollStore
    .getState()
    .recordAttendance(workerId, date, { status, deductionAmount })
}
