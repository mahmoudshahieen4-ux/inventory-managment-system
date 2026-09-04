import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePayrollStore } from '@/store/usePayrollStore'
import type { Worker, WorkerInput, WorkerStatus } from '@/types/payroll'

type Translate = ReturnType<typeof useTranslation>['t']

/** Controlled string values backing the form inputs. */
interface WorkerFormValues {
  name: string
  phone: string
  dailyRate: string
  status: WorkerStatus
}

type FormErrors = Partial<Record<'name' | 'phone' | 'dailyRate', string>>

interface WorkerFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Worker being edited, or `null`/`undefined` when creating a new one. */
  worker?: Worker | null
}

const EMPTY_VALUES: WorkerFormValues = {
  name: '',
  phone: '',
  dailyRate: '',
  status: 'ACTIVE',
}

function toFormValues(worker: Worker): WorkerFormValues {
  return {
    name: worker.name,
    phone: worker.phone,
    dailyRate: String(worker.dailyRate),
    status: worker.status,
  }
}

function validate(values: WorkerFormValues, t: Translate): FormErrors {
  const errors: FormErrors = {}
  const required = t('payroll.form.validation.required')
  const notANumber = t('payroll.form.validation.number')
  const negative = t('payroll.form.validation.nonNegative')

  if (!values.name.trim()) errors.name = required
  if (!values.dailyRate.trim()) {
    errors.dailyRate = required
  } else if (Number.isNaN(Number(values.dailyRate))) {
    errors.dailyRate = notANumber
  } else if (Number(values.dailyRate) < 0) {
    errors.dailyRate = negative
  }

  return errors
}
export function WorkerFormModal({
  open,
  onOpenChange,
  worker,
}: WorkerFormModalProps) {
  const { t } = useTranslation()
  const addWorker = usePayrollStore(state => state.addWorker)
  const updateWorker = usePayrollStore(state => state.updateWorker)
  const [values, setValues] = useState<WorkerFormValues>(() =>
    worker ? toFormValues(worker) : EMPTY_VALUES
  )
  const [errors, setErrors] = useState<FormErrors>({})

  const setField = (field: keyof WorkerFormValues) => (value: string) => {
    setValues(current => ({ ...current, [field]: value }))
    setErrors(current => ({ ...current, [field]: undefined }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validate(values, t)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    const input: WorkerInput = {
      name: values.name,
      phone: values.phone,
      dailyRate: Number(values.dailyRate),
      status: values.status,
    }

    if (worker) {
      updateWorker(worker.id, input)
    } else {
      addWorker(input)
    }
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={openChange => {
        if (!openChange) onOpenChange(false)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {worker
              ? t('payroll.form.title.edit')
              : t('payroll.form.title.create')}
          </DialogTitle>
          <DialogDescription>{t('payroll.form.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="worker-name">{t('payroll.form.name')}</Label>
            <Input
              id="worker-name"
              type="text"
              value={values.name}
              onChange={event => setField('name')(event.target.value)}
              aria-invalid={errors.name ? true : undefined}
            />
            {errors.name && (
              <p className="text-destructive text-sm" role="alert">
                {errors.name}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="worker-phone">{t('payroll.form.phone')}</Label>
            <Input
              id="worker-phone"
              type="tel"
              dir="ltr"
              className="text-end"
              value={values.phone}
              onChange={event => setField('phone')(event.target.value)}
              aria-invalid={errors.phone ? true : undefined}
            />
            {errors.phone && (
              <p className="text-destructive text-sm" role="alert">
                {errors.phone}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="worker-daily-rate">
              {t('payroll.form.dailyRate')}
            </Label>
            <Input
              id="worker-daily-rate"
              type="text"
              inputMode="decimal"
              dir="ltr"
              className="text-end"
              value={values.dailyRate}
              onChange={event => setField('dailyRate')(event.target.value)}
              aria-invalid={errors.dailyRate ? true : undefined}
            />
            {errors.dailyRate && (
              <p className="text-destructive text-sm" role="alert">
                {errors.dailyRate}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>{t('payroll.form.status')}</Label>
            <Select
              value={values.status}
              onValueChange={value => setField('status')(value as WorkerStatus)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">
                  {t('payroll.form.status.active')}
                </SelectItem>
                <SelectItem value="INACTIVE">
                  {t('payroll.form.status.inactive')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit">
              {worker ? <Save /> : <UserPlus />}
              {worker ? t('payroll.form.save') : t('payroll.form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
