import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Pencil, Trash2, UsersRound } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { usePayrollStore } from '@/store/usePayrollStore'
import type { Worker } from '@/types/payroll'

interface WorkersTableProps {
  onEdit: (worker: Worker) => void
}

/** Management table for workers: daily rate, status and edit/delete actions. */
export function WorkersTable({ onEdit }: WorkersTableProps) {
  const { t } = useTranslation()
  const workers = usePayrollStore(state => state.workers)
  const deleteWorker = usePayrollStore(state => state.deleteWorker)

  const handleDelete = (worker: Worker) => {
    const confirmed = window.confirm(
      t('payroll.workers.deleteConfirm', { name: worker.name })
    )
    if (!confirmed) return
    deleteWorker(worker.id)
    toast.success(t('payroll.toast.workerDeleted'))
  }

  const headClass =
    'text-[11px] font-semibold tracking-wider text-muted-foreground uppercase'

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <CardTitle className="text-xl font-bold tracking-tight">
          {t('payroll.workers.title')}
        </CardTitle>
        <CardDescription>{t('payroll.workers.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={headClass}>
                  {t('payroll.workers.nameColumn')}
                </TableHead>
                <TableHead className={headClass}>
                  {t('payroll.workers.phone')}
                </TableHead>
                <TableHead className={cn(headClass, 'text-end')}>
                  {t('payroll.workers.dailyRate')}
                </TableHead>
                <TableHead className={headClass}>
                  {t('payroll.workers.status')}
                </TableHead>
                <TableHead className={cn(headClass, 'text-end')}>
                  {t('common.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workers.map(worker => (
                <TableRow key={worker.id}>
                  <TableCell className="font-medium">{worker.name}</TableCell>
                  <TableCell dir="ltr" className="text-end">
                    {worker.phone || '—'}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {formatMoney(worker.dailyRate)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        worker.status === 'ACTIVE'
                          ? 'border-green-200 bg-green-50 text-green-800 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-[#34D399]'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300'
                      }
                    >
                      {worker.status === 'ACTIVE'
                        ? t('payroll.workers.status.active')
                        : t('payroll.workers.status.inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={t('payroll.workers.actions.edit', {
                          name: worker.name,
                        })}
                        title={t('payroll.workers.actions.edit', {
                          name: worker.name,
                        })}
                        onClick={() => onEdit(worker)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-red-500"
                        aria-label={t('payroll.workers.actions.delete', {
                          name: worker.name,
                        })}
                        title={t('payroll.workers.actions.delete', {
                          name: worker.name,
                        })}
                        onClick={() => handleDelete(worker)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {workers.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={5}
                    className="text-muted-foreground h-32 text-center"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UsersRound className="size-8" />
                      <p>{t('payroll.workers.empty')}</p>
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
