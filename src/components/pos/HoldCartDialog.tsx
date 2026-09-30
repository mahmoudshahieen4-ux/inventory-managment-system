import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import { Textarea } from '@/components/ui/textarea'
import { useHeldInvoicesStore } from '@/store/useHeldInvoicesStore'

interface HoldCartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HoldCartDialog({ open, onOpenChange }: HoldCartDialogProps) {
  const { t } = useTranslation()
  const holdCurrentCart = useHeldInvoicesStore(state => state.holdCurrentCart)
  const [customerName, setCustomerName] = useState('')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [previousOpen, setPreviousOpen] = useState(open)

  if (open !== previousOpen) setPreviousOpen(open)
  if (open && !previousOpen) {
    setCustomerName('')
    setNotes('')
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSaving) return
    setIsSaving(true)
    try {
      const saved = await holdCurrentCart(customerName, notes)
      if (!saved) return
      toast.success(t('pos.held.toast.saved'))
      onOpenChange(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={event => void handleSubmit(event)}
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>{t('pos.held.holdTitle')}</DialogTitle>
            <DialogDescription>
              {t('pos.held.holdDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="held-customer">
              {t('pos.held.customerLabel')}{' '}
              <span className="text-muted-foreground font-normal">
                ({t('common.optional')})
              </span>
            </Label>
            <Input
              id="held-customer"
              value={customerName}
              onChange={event => setCustomerName(event.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="held-notes">
              {t('pos.held.notesLabel')}{' '}
              <span className="text-muted-foreground font-normal">
                ({t('common.optional')})
              </span>
            </Label>
            <Textarea
              id="held-notes"
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {t('pos.held.holdAction')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
