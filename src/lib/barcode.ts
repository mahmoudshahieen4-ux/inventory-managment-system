/**
 * Barcode utilities used by the inventory form and the POS screen.
 *
 * Pure helpers (no React, no Tauri): random EAN-13 generation for the
 * "Generate Random Barcode" action, a validity check, and a tiny WebAudio
 * "beep" that gives instant feedback when a scan is accepted.
 */

/**
 * Computes the EAN-13 check digit for the first 12 digits of a barcode.
 * Odd positions (1-indexed) are weighted 1, even positions weight 3.
 */
export function ean13CheckDigit(code: string): number {
  let sum = 0
  for (let i = 0; i < code.length; i++) {
    const digit = Number(code[i] ?? NaN)
    if (!Number.isInteger(digit)) return NaN
    sum += i % 2 === 0 ? digit : digit * 3
  }
  return (10 - (sum % 10)) % 10
}

/** Builds a valid random EAN-13 barcode (12 random digits + check digit). */
export function generateBarcode(): string {
  let leading = ''
  for (let i = 0; i < 12; i++) {
    leading += String(Math.floor(Math.random() * 10))
  }
  return `${leading}${ean13CheckDigit(leading)}`
}

/** True when the code is a 13-digit EAN-13 whose check digit is valid. */
export function isValidEAN13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false
  const checkDigit = ean13CheckDigit(code.slice(0, 12))
  return Number.isInteger(checkDigit) && checkDigit === Number(code[12])
}

export interface ScanBeepOptions {
  /** Oscillator frequency in Hz (a bright 1318 Hz E6 makes a satisfying chirp). */
  frequency?: number
  /** Beep length in milliseconds. */
  durationMs?: number
  /** WebAudio oscillator waveform. */
  type?: OscillatorType
}

/** Plays a short success beep through WebAudio; a silent no-op when audio is unavailable. */
export function playScanBeep(options: ScanBeepOptions = {}): void {
  const { frequency = 1318, durationMs = 90, type = 'sine' } = options
  try {
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AudioContextCtor) return

    const context = new AudioContextCtor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = type
    oscillator.frequency.value = frequency
    oscillator.connect(gain)
    gain.connect(context.destination)

    const now = context.currentTime
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)

    oscillator.start(now)
    oscillator.stop(now + durationMs / 1000)
  } catch {
    // Audio feedback is purely cosmetic — never let a beep break a sale.
  }
}
