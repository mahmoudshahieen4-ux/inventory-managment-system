import { describe, expect, it } from 'vitest'

import {
  ean13CheckDigit,
  generateBarcode,
  isValidEAN13,
  playScanBeep,
} from './barcode'

/** Known-good EAN-13 sample: 5901234123457. */
const KNOWN_GOOD = '5901234123457'

describe('ean13CheckDigit', () => {
  it('computes the well-known EAN-13 sample check digit', () => {
    expect(ean13CheckDigit('590123412345')).toBe(7)
  })

  it('rejects non-digit input', () => {
    expect(ean13CheckDigit('abc')).toBeNaN()
  })
})

describe('generateBarcode', () => {
  it('always produces a valid 13-digit EAN-13 code', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateBarcode()
      expect(code).toMatch(/^\d{13}$/)
      expect(isValidEAN13(code)).toBe(true)
    }
  })
})

describe('isValidEAN13', () => {
  it('accepts a valid EAN-13 code', () => {
    expect(isValidEAN13(KNOWN_GOOD)).toBe(true)
  })

  it('checks the trailing check digit', () => {
    expect(isValidEAN13('5901234123458')).toBe(false)
  })

  it('rejects malformed lengths and non-digits', () => {
    expect(isValidEAN13('123456')).toBe(false)
    expect(isValidEAN13('59012341234512')).toBe(false)
    expect(isValidEAN13('590123412345a')).toBe(false)
  })
})

describe('playScanBeep', () => {
  it('is a safe no-op when WebAudio is unavailable', () => {
    expect(() => playScanBeep({ frequency: 800 })).not.toThrow()
  })
})
