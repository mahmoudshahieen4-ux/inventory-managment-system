import { fireEvent, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useBarcodeScanner } from './useBarcodeScanner'

/** Fires a scanner-style burst: rapid single-character keydowns + Enter. */
function scanCode(code: string): void {
  for (const char of code) {
    fireEvent.keyDown(window, { key: char })
  }
  fireEvent.keyDown(window, { key: 'Enter' })
}

describe('useBarcodeScanner', () => {
  it('buffers rapid keystrokes and fires onScan on Enter', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner(onScan))

    scanCode('6291041500213')

    expect(onScan).toHaveBeenCalledTimes(1)
    expect(onScan).toHaveBeenCalledWith('6291041500213')
  })

  it('supports the numpad Enter terminator', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner(onScan))

    for (const char of '123456') {
      fireEvent.keyDown(window, { key: char })
    }
    fireEvent.keyDown(window, { key: 'NumpadEnter' })

    expect(onScan).toHaveBeenCalledTimes(1)
    expect(onScan).toHaveBeenCalledWith('123456')
  })

  it('ignores slow keystrokes that belong to a human typist', async () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner(onScan))

    fireEvent.keyDown(window, { key: 'c' })
    await new Promise(resolve => setTimeout(resolve, 120))
    fireEvent.keyDown(window, { key: 'h' })
    fireEvent.keyDown(window, { key: 'Enter' })

    expect(onScan).not.toHaveBeenCalled()
  })

  it('does not fire for buffers shorter than minLength', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner(onScan, { minLength: 6 }))

    scanCode('12')

    expect(onScan).not.toHaveBeenCalled()
  })

  it('uses the latest callback across re-renders', () => {
    const first = vi.fn()
    const { rerender } = renderHook(
      ({ cb }: { cb: (barcode: string) => void }) => useBarcodeScanner(cb),
      { initialProps: { cb: first } }
    )

    const second = vi.fn()
    rerender({ cb: second })
    scanCode('123456')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('123456')
  })

  it('detaches the listener after unmount', () => {
    const onScan = vi.fn()
    const { unmount } = renderHook(() => useBarcodeScanner(onScan))
    unmount()

    scanCode('123456')

    expect(onScan).not.toHaveBeenCalled()
  })

  it('detaches the listener while disabled', () => {
    const onScan = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useBarcodeScanner(onScan, { enabled }),
      { initialProps: { enabled: true } }
    )

    rerender({ enabled: false })
    scanCode('123456')

    expect(onScan).not.toHaveBeenCalled()
  })

  it('swallows confirmed scanner keystrokes so they never reach inputs', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner(onScan))

    const target = document.createElement('input')
    document.body.appendChild(target)
    try {
      const events: KeyboardEvent[] = []
      for (const char of '123456') {
        const event = new KeyboardEvent('keydown', {
          key: char,
          bubbles: true,
          cancelable: true,
        })
        target.dispatchEvent(event)
        events.push(event)
      }

      // The very first keystroke cannot yet be classified as a scanner burst…
      expect(events[0]?.defaultPrevented).toBe(false)
      // …but every confirmed burst keystroke is intercepted.
      expect(events.slice(1).every(event => event.defaultPrevented)).toBe(true)
      expect(onScan).not.toHaveBeenCalled()
    } finally {
      target.remove()
    }
  })
})
