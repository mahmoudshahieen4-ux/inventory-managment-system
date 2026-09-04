import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Banknote, Printer, Receipt } from 'lucide-react'

import i18n from '@/i18n/config'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { monthName, monthYearKey } from '@/lib/payroll'
import { formatMoney } from '@/lib/money'
import { formatTransactionTimestamp } from '@/lib/date-time'
import { useAuthStore } from '@/store/useAuthStore'
import { usePayrollStore } from '@/store/usePayrollStore'
import type {
  MonthlyPayrollSummary,
  SalaryPaymentRecord,
} from '@/types/payroll'

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Summary being paid, or `null` when the dialog is closed. */
  summary: MonthlyPayrollSummary | null
  year: number
  month: number
  onConfirm: () => void
}

/** Review + print dialog shown when the admin finalizes a monthly salary. */
function PaymentDialog({
  open,
  onOpenChange,
  summary,
  year,
  month,
  onConfirm,
}: PaymentDialogProps) {
  const { t } = useTranslation()
  // Cash acknowledgement — confirm stays disabled until the admin checks it.
  const [cashConfirmed, setCashConfirmed] = useState(false)
  if (!summary) return null
  const period = `${monthName(year, month, i18n.resolvedLanguage ?? 'en')} ${year}`

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        // Reset the cash acknowledgement whenever the dialog is dismissed.
        if (!nextOpen) setCashConfirmed(false)
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('payroll.summary.paymentDetails')}</DialogTitle>
          <DialogDescription>
            {t('payroll.summary.paymentDescription', {
              name: summary.workerName,
              period,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-muted-foreground">
              {t('payroll.summary.daysAttended')}
            </span>
            <span className="tabular-nums font-medium">
              {summary.daysAttended}{' '}
              <span className="text-muted-foreground text-xs">
                ({summary.presentDays} {t('payroll.attendance.present')} ·{' '}
                {summary.halfDays} {t('payroll.attendance.halfDay')})
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-muted-foreground">
              {t('payroll.summary.totalEarnings')}
            </span>
            <span className="tabular-nums font-medium">
              {formatMoney(summary.totalEarnings)}
            </span>
          </div>
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-muted-foreground">
              {t('payroll.summary.totalDeductions')}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {formatMoney(summary.totalDeductions)}
            </span>
          </div>
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-muted-foreground">
              {t('payroll.summary.totalAdvances')}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {formatMoney(summary.totalAdvances)}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="font-semibold">
              {t('payroll.summary.netPayable')}
            </span>
            <span className="text-lg font-bold tabular-nums">
              {formatMoney(summary.netPayable)}
            </span>
          </div>
        </div>

        {/* Cash confirmation (تأكيد استلام العامل للمبلغ نقداً). */}
        <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
          <Checkbox
            checked={cashConfirmed}
            onCheckedChange={checked => setCashConfirmed(checked === true)}
            aria-label={t('payroll.summary.cashConfirmation')}
          />
          <span>{t('payroll.summary.cashConfirmation')}</span>
        </label>

        <DialogFooter className="mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
          >
            <Printer />
            {t('payroll.summary.print')}
          </Button>
          <Button
            type="button"
            disabled={!cashConfirmed}
            onClick={() => {
              onConfirm()
              setCashConfirmed(false)
              onOpenChange(false)
            }}
          >
            <Banknote />
            {t('payroll.summary.confirmPayment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
export function MonthlyPayrollSummary() {
  const { t } = useTranslation()
  const workers = usePayrollStore(state => state.workers)
  const attendance = usePayrollStore(state => state.attendance)
  const advances = usePayrollStore(state => state.advances)
  // Persisted payouts: drives the PAID badges and receipt printing.
  const salaryPayments = usePayrollStore(state => state.salaryPayments)

  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)
  const [payingSummary, setPayingSummary] =
    useState<MonthlyPayrollSummary | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  /** Last finalized payout — drives the printable receipt dialog. */
  const [receiptPayment, setReceiptPayment] =
    useState<SalaryPaymentRecord | null>(null)

  const years = useMemo(() => {
    const available = new Set<number>([year])
    for (const record of [...attendance, ...advances]) {
      const recordYear = Number(record.date.slice(0, 4))
      if (!Number.isNaN(recordYear)) available.add(recordYear)
    }
    return [...available].sort((a, b) => b - a)
  }, [attendance, advances, year])

  const period = `${monthName(year, month, i18n.resolvedLanguage ?? 'en')} ${year}`

  // All workers (active + inactive) so old months remain visible.
  const summaries = workers.map(worker =>
    usePayrollStore.getState().getMonthlySummary(worker.id, year, month)
  )
  const totals = summaries.reduce(
    (acc, summary) => ({
      totalEarnings: acc.totalEarnings + summary.totalEarnings,
      totalDeductions: acc.totalDeductions + summary.totalDeductions,
      totalAdvances: acc.totalAdvances + summary.totalAdvances,
      netPayable: acc.netPayable + summary.netPayable,
    }),
    { totalEarnings: 0, totalDeductions: 0, totalAdvances: 0, netPayable: 0 }
  )

  const handleOpenPay = (summary: MonthlyPayrollSummary) => {
    setPayingSummary(summary)
    setDialogOpen(true)
  }

  const handleConfirmPayment = () => {
    if (!payingSummary) return
    // ADMIN-only screen — the active role doubles as the "paid by" stamp.
    const payment = usePayrollStore
      .getState()
      .paySalary(
        payingSummary.workerId,
        year,
        month,
        useAuthStore.getState().currentUser?.displayName ?? 'ADMIN'
      )
    if (!payment) return
    toast.success(
      t('payroll.summary.paidToast', {
        name: payingSummary.workerName,
        period,
      })
    )
    // Open the printable receipt for the finalized payout.
    setReceiptPayment(payment)
  }

  const headClass =
    'text-[11px] font-semibold tracking-wider text-muted-foreground uppercase'
  const headClassEnd = `${headClass} text-end`

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <CardTitle className="text-xl font-bold tracking-tight">
          {t('payroll.summary.title')}
        </CardTitle>
        <CardDescription>{t('payroll.summary.description')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid w-full gap-1.5 sm:max-w-[10rem]">
            <Label>{t('payroll.summary.month')}</Label>
            <Select
              value={String(month)}
              onValueChange={value => setMonth(Number(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, index) => index + 1).map(
                  monthNumber => (
                    <SelectItem key={monthNumber} value={String(monthNumber)}>
                      {monthName(
                        year,
                        monthNumber,
                        i18n.resolvedLanguage ?? 'en'
                      )}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid w-full gap-1.5 sm:max-w-[8rem]">
            <Label>{t('payroll.summary.year')}</Label>
            <Select
              value={String(year)}
              onValueChange={value => setYear(Number(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(yearNumber => (
                  <SelectItem key={yearNumber} value={String(yearNumber)}>
                    {yearNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={headClass}>
                  {t('payroll.summary.worker')}
                </TableHead>
                <TableHead className={headClassEnd}>
                  {t('payroll.summary.dailyRate')}
                </TableHead>
                <TableHead className={headClassEnd}>
                  {t('payroll.summary.daysAttended')}
                </TableHead>
                <TableHead className={headClassEnd}>
                  {t('payroll.summary.totalEarnings')}
                </TableHead>
                <TableHead className={headClassEnd}>
                  {t('payroll.summary.deductionsAndAdvances')}
                </TableHead>
                <TableHead className={headClassEnd}>
                  {t('payroll.summary.netPayable')}
                </TableHead>
                <TableHead className={headClassEnd}>
                  {t('common.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map(summary => {
                // PAID status comes from the persisted salary_payments rows.
                const paidPayment = salaryPayments.find(
                  payment =>
                    payment.workerId === summary.workerId &&
                    payment.monthYear === monthYearKey(year, month)
                )
                const isPaid = paidPayment !== undefined
                const deductionsAndAdvances =
                  summary.totalDeductions + summary.totalAdvances
                return (
                  <TableRow key={summary.workerId}>
                    <TableCell className="font-medium">
                      {summary.workerName}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatMoney(summary.dailyRate)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {summary.daysAttended}
                      <span className="text-muted-foreground ms-1 text-xs">
                        ({summary.presentDays} {t('payroll.attendance.present')}{' '}
                        · {summary.halfDays} {t('payroll.attendance.halfDay')})
                      </span>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatMoney(summary.totalEarnings)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatMoney(deductionsAndAdvances)}
                      <span className="text-muted-foreground block text-xs">
                        {t('payroll.summary.totalDeductions')}{' '}
                        {formatMoney(summary.totalDeductions)} ·{' '}
                        {t('payroll.summary.totalAdvances')}{' '}
                        {formatMoney(summary.totalAdvances)}
                      </span>
                    </TableCell>
                    <TableCell className="text-end font-semibold tabular-nums">
                      {formatMoney(summary.netPayable)}
                    </TableCell>
                    <TableCell className="text-end">
                      {isPaid ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Badge className="border-green-200 bg-green-100 text-green-800 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-[#34D399]">
                            {t('payroll.summary.paidBadge')}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={t('payroll.summary.printReceipt')}
                            aria-label={t('payroll.summary.printReceipt')}
                            onClick={() =>
                              setReceiptPayment(paidPayment ?? null)
                            }
                          >
                            <Receipt />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenPay(summary)}
                        >
                          <Banknote />
                          {t('payroll.summary.paySalary')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}

              {summaries.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={7}
                    className="text-muted-foreground h-32 text-center"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Receipt className="size-8" />
                      <p>{t('payroll.summary.empty')}</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {summaries.length > 0 && (
          <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {t('payroll.summary.periodLabel', { period })}
            </span>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span className="flex gap-2">
                <span className="text-muted-foreground">
                  {t('payroll.summary.totalEarnings')}
                </span>
                <span className="font-medium tabular-nums">
                  {formatMoney(totals.totalEarnings)}
                </span>
              </span>
              <span className="flex gap-2">
                <span className="text-muted-foreground">
                  {t('payroll.summary.netPayable')}
                </span>
                <span className="font-bold tabular-nums">
                  {formatMoney(totals.netPayable)}
                </span>
              </span>
            </div>
          </div>
        )}
      </CardContent>

      <PaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        summary={payingSummary}
        year={year}
        month={month}
        onConfirm={handleConfirmPayment}
      />

      {/* Printable salary receipt (إيصال صرف الراتب). */}
      <Dialog
        open={receiptPayment !== null}
        onOpenChange={open => {
          if (!open) setReceiptPayment(null)
        }}
      >
        {receiptPayment && (
          <DialogContent className="sm:max-w-sm print:border-0 print:shadow-none">
            <DialogHeader>
              <DialogTitle>{t('payroll.summary.receiptTitle')}</DialogTitle>
              <DialogDescription>
                {t('payroll.summary.paymentDescription', {
                  name:
                    workers.find(
                      worker => worker.id === receiptPayment.workerId
                    )?.name ?? receiptPayment.workerId,
                  period: receiptPayment.monthYear,
                })}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 text-sm">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-muted-foreground">
                  {t('payroll.summary.worker')}
                </span>
                <span className="font-medium">
                  {workers.find(worker => worker.id === receiptPayment.workerId)
                    ?.name ?? receiptPayment.workerId}
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-muted-foreground">
                  {t('payroll.summary.netPayable')}
                </span>
                <span className="text-lg font-bold tabular-nums">
                  {formatMoney(receiptPayment.netAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-muted-foreground">
                  {t('payroll.summary.paidByLabel')}
                </span>
                <span className="font-medium">{receiptPayment.paidBy}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t('payroll.summary.paidAtLabel')}
                </span>
                <span className="tabular-nums">
                  {formatTransactionTimestamp(receiptPayment.paidAt)}
                </span>
              </div>
            </div>

            <DialogFooter className="mt-2">
              <Button type="button" onClick={() => window.print()}>
                <Printer />
                {t('payroll.summary.printReceipt')}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  )
}
