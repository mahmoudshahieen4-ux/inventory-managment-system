import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CartItem } from '@/types/sales'
import { useCartStore } from '@/store/useCartStore'

import { usePosShortcuts } from './use-pos-shortcuts'
import { getPosActions } from '@/components/pos/pos-actions'

vi.mock('@/components/pos/pos-actions', () => ({
  registerPosActions: vi.fn(),
  unregisterPosActions: vi.fn(),
  getPosActions: vi.fn(() => null),
}))

const mockGetPosActions = vi.mocked(getPosActions)

function makeItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: 'p-1',
    sku: 'PRD-TEST0001',
    name: 'Test product',
    unitPrice: 10,
    quantity: 2,
    purchasePrice: 5,
    ...overrides,
  }
}

function pressKey(key: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }))
}

describe('usePosShortcuts', () => {
  const onNewSale = vi.fn()
  const onClearCart = vi.fn()
  const onPrintReceipt = vi.fn()
  const checkout = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    useCartStore.setState({ items: [] })
    mockGetPosActions.mockReturnValue({ checkout })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    useCartStore.setState({ items: [] })
  })

  function mount(): { unmount: () => void } {
    const view = renderHook(() =>
      usePosShortcuts({ onNewSale, onClearCart, onPrintReceipt })
    )
    return { unmount: view.unmount }
  }

  it('F1 starts a new sale', () => {
    mount()
    pressKey('F1')
    expect(onNewSale).toHaveBeenCalledTimes(1)
  })

  it('F2 triggers the registered checkout when the cart has items', () => {
    useCartStore.setState({ items: [makeItem()] })
    mount()
    pressKey('F2')
    expect(checkout).toHaveBeenCalledTimes(1)
  })

  it('F2 is a no-op when the cart is empty', () => {
    mount()
    pressKey('F2')
    expect(checkout).not.toHaveBeenCalled()
  })

  it('F2 does nothing when no checkout is registered (cart unmounted)', () => {
    mockGetPosActions.mockReturnValue(null)
    useCartStore.setState({ items: [makeItem()] })
    mount()
    expect(() => pressKey('F2')).not.toThrow()
  })

  it('F12 prints the receipt', () => {
    mount()
    pressKey('F12')
    expect(onPrintReceipt).toHaveBeenCalledTimes(1)
  })

  it('ESC clears a non-empty cart', () => {
    useCartStore.setState({ items: [makeItem()] })
    mount()
    pressKey('Escape')
    expect(onClearCart).toHaveBeenCalledTimes(1)
  })

  it('ESC ignores an empty cart', () => {
    mount()
    pressKey('Escape')
    expect(onClearCart).not.toHaveBeenCalled()
  })

  it('ESC is ignored while a dialog is open (receipt/renewal modals)', () => {
    useCartStore.setState({ items: [makeItem()] })
    document.body.innerHTML =
      '<div role="dialog" data-state="open"><input /></div>'
    mount()
    pressKey('Escape')
    expect(onClearCart).not.toHaveBeenCalled()
  })

  it('ESC is ignored while typing in an input', () => {
    useCartStore.setState({ items: [makeItem()] })
    const input = document.createElement('input')
    document.body.appendChild(input)
    mount()
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
    expect(onClearCart).not.toHaveBeenCalled()
  })

  it('ignores keys with modifier combos (accessibility)', () => {
    mount()
    pressKey('F1', { ctrlKey: true })
    pressKey('F1', { metaKey: true })
    pressKey('F1', { altKey: true })
    expect(onNewSale).not.toHaveBeenCalled()
  })

  it('detaches the listener on unmount', () => {
    const { unmount } = mount()
    unmount()
    pressKey('F1')
    expect(onNewSale).not.toHaveBeenCalled()
  })
})
