/** Copy inside the active dialog so focus traps do not block the fallback. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Restricted WebViews may not expose the modern API.
  }
  const previous = document.activeElement
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.cssText = 'position:fixed;top:0;opacity:0;pointer-events:none'
  const parent = previous?.closest('[role="dialog"]') ?? document.body
  try {
    parent.appendChild(textarea)
    textarea.focus()
    textarea.select()
    return (
      typeof document.execCommand === 'function' && document.execCommand('copy')
    )
  } catch {
    return false
  } finally {
    textarea.remove()
    if (previous instanceof HTMLElement) previous.focus({ preventScroll: true })
  }
}
