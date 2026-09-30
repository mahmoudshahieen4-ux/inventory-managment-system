import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './copy-text'

const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  'clipboard'
)

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    get: () => undefined,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard)
  } else {
    Reflect.deleteProperty(navigator, 'clipboard')
  }
  Reflect.deleteProperty(document, 'execCommand')
  document.body.replaceChildren()
})

describe('copyText', () => {
  it('uses the modern clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      writeText,
    } as unknown as Clipboard)
    expect(await copyText('device-id')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('device-id')
  })

  it.each([true, false])(
    'returns the fallback result %s and restores focus',
    async result => {
      vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
        writeText: vi.fn().mockRejectedValue(new Error('Unavailable')),
      } as unknown as Clipboard)
      const button = document.createElement('button')
      document.body.appendChild(button)
      button.focus()
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: vi.fn(() => result),
      })
      expect(await copyText('key')).toBe(result)
      expect(document.querySelector('textarea')).toBeNull()
      expect(document.activeElement).toBe(button)
      Reflect.deleteProperty(document, 'execCommand')
    }
  )
})
