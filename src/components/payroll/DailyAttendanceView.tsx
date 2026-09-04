import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, Coins, Lock, UsersRound } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { isFutureDate, toDateKey } from '@/lib/payroll'
import { usePayrollStore } from '@/store/usePayrollStore'
import type {
  AttendanceRecord,
  AttendanceStatus,
  Worker,
} from '@/types/payroll'

interface AttendanceRowProps {
  worker: Worker
  /** `YYYY-MM-DD` day this row edits/saves. */
  dateKey: string
  /** Already-saved attendance for this worker/day, when present. */
  existing?: AttendanceRecord
  /**
   * Why the row is read-only: the day is in the future, or the month's
   * salary was already paid (frozen). `null` when editing is allowed.
   */
  lockReason: 'future' | 'paid' | null
}

/** One worker's status toggle, deduction and advance controls for a day. */
function AttendanceRow({
  worker,
  dateKey,
  existing,
  lockReason,
}: AttendanceRowProps) {
  const { t } = useTranslation()
  const recordAttendance = usePayrollStore(state => state.recordAttendance)
  const addAdvance = usePayrollStore(state => state.addAdvance)
  const [status, setStatus] = useState<AttendanceStatus>(
    existing?.status ?? 'ABSENT'
  )
  const [deduction, setDeduction] = useState(
    existing ? String(existing.deductionAmount) : ''
  )
  const [advance, setAdvance] = useState('')

  const locked = lockReason !== null
  const lockedLabel =
    lockReason === 'paid'
      ? t('payroll.attendance.lockedPaid')
      : t('payroll.attendance.lockedFuture')

  const handleSave = () => {
    // Mirrors the store guards so invalid clicks fail fast in the UI.
    if (lockReason === 'future') {
      toast.error(t('payroll.errors.futureDate'))
      return
    }
    if (lockReason === 'paid') {
      toast.error(t('payroll.errors.monthPaid'))
      return
    }
    recordAttendance(worker.id, dateKey, {
      status,
      deductionAmount: deduction === '' ? undefined : Number(deduction),
    })
    toast.success(t('payroll.attendance.saved', { name: worker.name }))
  }

  const handleAdvance = () => {
    if (lockReason === 'future' || lockReason === 'paid') {
      toast.error(
        lockReason === 'future'
          ? t('payroll.errors.futureDate')
          : t('payroll.errors.monthPaid')
      )
      return
    }
    const amount = Number(advance)
    if (!Number.isFinite(amount) || amount <= 0) return
    addAdvance(worker.id, { amount, date: dateKey })
    toast.success(t('payroll.attendance.advanceGiven', { name: worker.name }))
    setAdvance('')
  }

  return (
    <TableRow data-status={status}>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{worker.name}</span>
          {worker.phone && (
            <span className="text-muted-foreground text-xs" dir="ltr">
              {worker.phone}
            </span>
          )}
        </div>
      </TableCell>

      <TableCell>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={status}
          disabled={locked}
          onValueChange={value => {
            if (
              value === 'PRESENT' ||
              value === 'HALF_DAY' ||
              value === 'ABSENT'
            ) {
              setStatus(value)
            }
          }}
          aria-label={t('payroll.attendance.statusLabel', {
            name: worker.name,
          })}
        >
          <ToggleGroupItem
            value="PRESENT"
            className="text-green-600 dark:text-green-400"
          >
            {t('payroll.attendance.present')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="HALF_DAY"
            className="text-amber-600 dark:text-amber-400"
          >
            {t('payroll.attendance.halfDay')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="ABSENT"
            className="text-red-600 dark:text-red-400"
          >
            {t('payroll.attendance.absent')}
          </ToggleGroupItem>
        </ToggleGroup>
      </TableCell>

      <TableCell>
        <Input
          type="number"
          min={0}
          step="0.01"
          dir="ltr"
          className="h-8 w-28 text-end"
          value={deduction}
          onChange={event => setDeduction(event.target.value)}
          placeholder="0.00"
          disabled={locked}
          aria-label={t('payroll.attendance.deductionAria', {
            name: worker.name,
          })}
        />
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={0}
            step="0.01"
            dir="ltr"
            className="h-8 w-28 text-end"
            value={advance}
            onChange={event => setAdvance(event.target.value)}
            placeholder="0.00"
            disabled={locked}
            aria-label={t('payroll.attendance.advanceAria', {
              name: worker.name,
            })}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            title={t('payroll.attendance.addAdvance', { name: worker.name })}
            onClick={handleAdvance}
            disabled={locked}
          >
            <Coins />
          </Button>
        </div>
      </TableCell>

      <TableCell className="text-end">
        {locked ? (
          <span
            className="text-muted-foreground inline-flex items-center gap-1 text-xs"
            title={lockedLabel}
          >
            <Lock className="size-3.5" />
            {lockedLabel}
          </span>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSave}
          >
            <Check />
            {t('payroll.attendance.save')}
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}
export function DailyAttendanceView() {
  const { t } = useTranslation()
  const workers = usePayrollStore(state => state.workers)
  const attendance = usePayrollStore(state => state.attendance)
  const salaryPayments = usePayrollStore(state => state.salaryPayments)
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())

  const dateKey = toDateKey(selectedDate)
  // "workerId:YYYY-MM" lookup — a hit means the month is paid (frozen).
  const paidMonths = useMemo(
    () =>
      new Set(
        salaryPayments.map(
          payment => `${payment.workerId}:${payment.monthYear}`
        )
      ),
    [salaryPayments]
  )
  const lockReasonFor = (workerId: string): 'future' | 'paid' | null => {
    if (isFutureDate(dateKey)) return 'future'
    return paidMonths.has(`${workerId}:${dateKey.slice(0, 7)}`) ? 'paid' : null
  }

  const activeWorkers = workers.filter(worker => worker.status === 'ACTIVE')
  const dayRecords = attendance.filter(record => record.date === dateKey)
  const presentCount = dayRecords.filter(
    record => record.status === 'PRESENT'
  ).length
  const halfCount = dayRecords.filter(
    record => record.status === 'HALF_DAY'
  ).length
  const absentCount = dayRecords.filter(
    record => record.status === 'ABSENT'
  ).length

  const headClass =
    'text-[11px] font-semibold tracking-wider text-muted-foreground uppercase'

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <CardTitle className="text-xl font-bold tracking-tight">
          {t('payroll.attendance.title')}
        </CardTitle>
        <CardDescription>{t('payroll.attendance.description')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid w-full gap-1.5 sm:max-w-xs">
            <Label>{t('payroll.attendance.dateLabel')}</Label>
            <DatePicker
              value={selectedDate}
              onChange={date => {
                if (!date) return
                // Future days can never be selected for attendance.
                if (isFutureDate(toDateKey(date))) {
                  toast.error(t('payroll.errors.futureDate'))
                  return
                }
                setSelectedDate(date)
              }}
              disabled={date => date > new Date()}
            />
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <Badge
              variant="outline"
              className="border-green-200 bg-green-50 text-green-800 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-[#34D399]"
            >
              {t('payroll.attendance.present')}: {presentCount}
            </Badge>
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-[#FBBF24]"
            >
              {t('payroll.attendance.halfDay')}: {halfCount}
            </Badge>
            <Badge
              variant="outline"
              className="border-red-200 bg-red-50 text-red-800 dark:border-rose-800/40 dark:bg-rose-950/40 dark:text-[#FB7185]"
            >
              {t('payroll.attendance.absent')}: {absentCount}
            </Badge>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={headClass}>
                  {t('payroll.attendance.worker')}
                </TableHead>
                <TableHead className={headClass}>
                  {t('payroll.attendance.status')}
                </TableHead>
                <TableHead className={headClass}>
                  {t('payroll.attendance.deduction')}
                </TableHead>
                <TableHead className={headClass}>
                  {t('payroll.attendance.advance')}
                </TableHead>
                <TableHead className={headClass}>
                  {t('common.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeWorkers.map(worker => (
                <AttendanceRow
                  key={`${worker.id}-${dateKey}`}
                  worker={worker}
                  dateKey={dateKey}
                  existing={dayRecords.find(
                    record => record.workerId === worker.id
                  )}
                  lockReason={lockReasonFor(worker.id)}
                />
              ))}

              {activeWorkers.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={5}
                    className="text-muted-foreground h-32 text-center"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UsersRound className="size-8" />
                      <p>{t('payroll.attendance.empty')}</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
