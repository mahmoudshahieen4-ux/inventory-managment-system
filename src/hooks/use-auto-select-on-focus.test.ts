import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAutoSelectOnFocus } from './use-auto-select-on-focus'

/** Builds a fake mouse event over the input at a given viewport X. */
function mouseEventAt(
  input: HTMLInputElement,
  clientX: number
): React.MouseEvent<HTMLInputElement> {
  return {
    clientX,
    currentTarget: input,
    preventDefault: vi.fn(),
  } as unknown as React.MouseEvent<HTMLInputElement>
}

describe('useAutoSelectOnFocus', () => {
  let input: HTMLInputElement

  beforeEach(() => {
    input = document.createElement('input')
    input.type = 'number'
    document.body.appendChild(input)
  })

  it('prevents default over the text area (keeps the focus selection)', () => {
    // Text-area click: rect 0..200, pointer at x=100 (middle).
    vi.spyOn(
      HTMLInputElement.prototype,
      'getBoundingClientRect'
    ).mockReturnValue({
      left: 0,
      right: 200,
    } as DOMRect)

    const { onMouseUp } = useAutoSelectOnFocus()
    const event = mouseEventAt(input, 100)

    onMouseUp(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('does NOT prevent default over the right-edge spinner (LTR) so the auto-repeat is released', () => {
    // Spinner sits at the inline-end edge: x >= 200 - 17 = 183.
    vi.spyOn(
      HTMLInputElement.prototype,
      'getBoundingClientRect'
    ).mockReturnValue({
      left: 0,
      right: 200,
    } as DOMRect)

    const { onMouseUp } = useAutoSelectOnFocus()
    const event = mouseEventAt(input, 190)

    onMouseUp(event)

    // Releasing the spinner must run the browser's default handling —
    // otherwise the value keeps stepping after the mouse is released.
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('does NOT prevent default over the left-edge spinner (RTL)', () => {
    // RTL inputs render the spinner at the inline-end = left edge.
    vi.spyOn(
      HTMLInputElement.prototype,
      'getBoundingClientRect'
    ).mockReturnValue({
      left: 0,
      right: 200,
    } as DOMRect)
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      direction: 'rtl',
    } as CSSStyleDeclaration)

    const { onMouseUp } = useAutoSelectOnFocus()
    const event = mouseEventAt(input, 5)

    onMouseUp(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('still prevents default for non-number inputs at any position', () => {
    const textInput = document.createElement('input')
    textInput.type = 'text'
    document.body.appendChild(textInput)
    vi.spyOn(
      HTMLInputElement.prototype,
      'getBoundingClientRect'
    ).mockReturnValue({
      left: 0,
      right: 200,
    } as DOMRect)

    const { onMouseUp } = useAutoSelectOnFocus()
    const event = mouseEventAt(textInput, 190)

    onMouseUp(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('selects the input content on focus (deferred one frame)', async () => {
    const selectSpy = vi.spyOn(input, 'select')

    const { onFocus } = useAutoSelectOnFocus()
    onFocus({ target: input } as React.FocusEvent<HTMLInputElement>)

    await vi.waitFor(() => expect(selectSpy).toHaveBeenCalledOnce())
  })
})
