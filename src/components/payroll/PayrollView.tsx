import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CalendarCheck,
  ShieldAlert,
  UserPlus,
  UsersRound,
  WalletCards,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthStore } from '@/store/useAuthStore'
import { useUIStore } from '@/store/ui-store'
import type { Worker } from '@/types/payroll'
import { DailyAttendanceView } from './DailyAttendanceView'
import { MonthlyPayrollSummary } from './MonthlyPayrollSummary'
import { WorkerFormModal } from './WorkerFormModal'
import { WorkersTable } from './WorkersTable'

type PayrollTab = 'workers' | 'attendance' | 'summary'

/**
 * Workers Payroll & Attendance screen — ADMIN only.
 *
 * CASHIER users are blocked at both navigation (ViewSwitcher hides the tab)
 * and here (defense-in-depth redirect), so the screen can never be reached
 * by a non-admin account.
 */
export function PayrollView() {
  const { t } = useTranslation()
  const role = useAuthStore(state => state.currentUser?.role)
  const isAdmin = role === 'ADMIN'
  const setActiveView = useUIStore(state => state.setActiveView)
  const [tab, setTab] = useState<PayrollTab>('workers')
  const [formOpen, setFormOpen] = useState(false)
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null)

  if (!isAdmin) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-4 px-4 text-center">
        <ShieldAlert className="text-destructive size-10" />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">{t('payroll.denied.title')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('payroll.denied.description')}
          </p>
        </div>
        <Button onClick={() => setActiveView('inventory')}>
          {t('payroll.denied.backToInventory')}
        </Button>
      </div>
    )
  }

  const handleOpenCreate = () => {
    setEditingWorker(null)
    setFormOpen(true)
  }

  const handleOpenEdit = (worker: Worker) => {
    setEditingWorker(worker)
    setFormOpen(true)
  }

  const handleOpenChange = (open: boolean) => {
    setFormOpen(open)
    if (!open) setEditingWorker(null)
  }

  return (
    <div className="animate-fade-in h-full min-h-0 w-full space-y-4 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{t('payroll.title')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('payroll.description')}
          </p>
        </div>
        {tab === 'workers' && (
          <Button onClick={handleOpenCreate}>
            <UserPlus />
            {t('payroll.workers.add')}
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={value => setTab(value as PayrollTab)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="workers">
            <UsersRound />
            {t('payroll.tabWorkers')}
          </TabsTrigger>
          <TabsTrigger value="attendance">
            <CalendarCheck />
            {t('payroll.tabAttendance')}
          </TabsTrigger>
          <TabsTrigger value="summary">
            <WalletCards />
            {t('payroll.tabSummary')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'workers' && <WorkersTable onEdit={handleOpenEdit} />}
      {tab === 'attendance' && <DailyAttendanceView />}
      {tab === 'summary' && <MonthlyPayrollSummary />}

      <WorkerFormModal
        open={formOpen}
        onOpenChange={handleOpenChange}
        worker={editingWorker}
      />
    </div>
  )
}
