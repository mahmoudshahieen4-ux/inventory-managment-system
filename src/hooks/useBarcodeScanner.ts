import { useEffect, useRef } from 'react'

/**
 * Bridge for USB/Bluetooth HID "keyboard wedge" barcode scanners.
 *
 * Most hardware scanners emulate a keyboard: the code's characters arrive as
 * `keydown` events a few milliseconds apart, followed by the `Enter` key. The
 * hook listens on `window` in the capture phase, buffers characters that arrive
 * in a rapid burst, and calls `onScan(barcode)` as soon as `Enter` is pressed.
 *
 * Because it runs before React's own handlers, scanner keystrokes can also be
 * swallowed (`interceptInput`) so they never pollute focused search boxes or
 * quantity inputs while the cashier works hands-free.
 */

export interface UseBarcodeScannerOptions {
  /** Minimum number of characters a scan must contain before it is accepted. */
  minLength?: number
  /**
   * Maximum gap (ms) between two keystrokes for them to still count as a single
   * scanner burst. Human typing is typically much slower than this boundary.
   */
  maxGapMs?: number
  /** Hard cap on the buffer so a held key can never grow memory unboundedly. */
  maxLength?: number
  /** Prevent scanner keystrokes from being inserted into focused inputs. */
  interceptInput?: boolean
  /** Detach the listener entirely (e.g. when the POS panel is not visible). */
  enabled?: boolean
}

const DEFAULT_OPTIONS: Required<UseBarcodeScannerOptions> = {
  minLength: 3,
  maxGapMs: 40,
  maxLength: 64,
  interceptInput: true,
  enabled: true,
}

/** Keys that terminate a scan burst (the scanner's usual suffix + numpad key). */
const TERMINATOR_KEYS = new Set(['Enter', 'NumpadEnter', '\n', '\r'])

export function useBarcodeScanner(
  onScan: (barcode: string) => void,
  options: UseBarcodeScannerOptions = {}
): void {
  const { minLength, maxGapMs, maxLength, interceptInput, enabled } = {
    ...DEFAULT_OPTIONS,
    ...options,
  }

  // Keep the newest callback without re-attaching the DOM listener on every
  // render. The ref is updated in an effect so it never runs during a render.
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  })

  useEffect(() => {
    if (!enabled) return

    let buffer = ''
    let lastKeyAt = 0
    // Becomes true as soon as a second keystroke arrives inside the burst
    // window; only trusted bursts are flushed on `Enter`.
    let inBurst = false

    const reset = (): void => {
      buffer = ''
      lastKeyAt = 0
      inBurst = false
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      // IME composition and OS/modifier combos are never scanner payloads.
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
        reset()
        return
      }
      // Held keys repeat the same event; treat them as noise.
      if (event.repeat || event.key === 'Escape') {
        reset()
        return
      }

      // Terminator: flush the buffered burst and swallow the key so it cannot
      // submit forms or trigger default actions on focused inputs.
      if (TERMINATOR_KEYS.has(event.key)) {
        const barcode = buffer.trim()
        const shouldFlush = inBurst && barcode.length >= minLength
        reset()
        if (!shouldFlush) return
        event.preventDefault()
        onScanRef.current(barcode)
        return
      }

      // Only printable single characters contribute to a scan payload.
      if (event.key.length !== 1) {
        reset()
        return
      }

      const now = performance.now()
      const isBurstKeystroke = lastKeyAt !== 0 && now - lastKeyAt <= maxGapMs

      if (!isBurstKeystroke) {
        // Possible first character of a scan (or ordinary typing) — wait for a
        // fast follow-up before treating it as a hardware scanner burst.
        buffer = event.key
        lastKeyAt = now
        return
      }

      inBurst = true
      // Hardware bursts are intercepted so digits never land in search boxes,
      // quantity inputs or other focused form fields.
      if (interceptInput) event.preventDefault()
      if (buffer.length >= maxLength) {
        reset()
        return
      }
      buffer += event.key
      lastKeyAt = now
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [enabled, interceptInput, maxGapMs, maxLength, minLength])
}
