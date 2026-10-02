import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

import { initialProducts, useInventoryStore } from '@/store/useInventoryStore'
import { render, screen } from '@/test/test-utils'
import { ShipmentReceivingModal } from './ShipmentReceivingModal'

const onOpenChange = vi.fn()

describe('ShipmentReceivingModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useInventoryStore.setState({ products: [...initialProducts] })
  })

  it('replaces default numeric values and removes leading zeroes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ShipmentReceivingModal
        open={false}
        onOpenChange={onOpenChange}
        product={initialProducts[0]}
      />
    )
    rerender(
      <ShipmentReceivingModal
        open
        onOpenChange={onOpenChange}
        product={initialProducts[0]}
      />
    )

    const quantity = screen.getByRole('spinbutton', { name: 'Quantity Added' })
    const purchasePrice = screen.getByRole('spinbutton', {
      name: 'Purchase Price per Unit',
    })

    await user.type(quantity, '0010')
    await user.type(purchasePrice, '0012.50')

    expect(quantity).toHaveValue(10)
    expect(purchasePrice).toHaveValue(12.5)
  })
})
