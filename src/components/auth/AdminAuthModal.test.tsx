import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test/test-utils'
import { ADMIN_PASSCODE, AdminAuthModal } from './AdminAuthModal'

describe('AdminAuthModal', () => {
  it('rejects an incorrect passcode and keeps the dialog open', async () => {
    const user = userEvent.setup()
    const onAuthenticated = vi.fn()
    render(
      <AdminAuthModal
        open
        onOpenChange={vi.fn()}
        onAuthenticated={onAuthenticated}
      />
    )

    await user.type(screen.getByLabelText('Admin passcode'), '0000')
    await user.click(screen.getByRole('button', { name: 'Unlock as Admin' }))

    expect(screen.getByText('Incorrect admin passcode.')).toBeInTheDocument()
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it('accepts the master passcode and notifies the caller', async () => {
    const user = userEvent.setup()
    const onAuthenticated = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <AdminAuthModal
        open
        onOpenChange={onOpenChange}
        onAuthenticated={onAuthenticated}
      />
    )

    await user.type(screen.getByLabelText('Admin passcode'), ADMIN_PASSCODE)
    await user.click(screen.getByRole('button', { name: 'Unlock as Admin' }))

    expect(onAuthenticated).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
