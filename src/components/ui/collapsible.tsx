import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDownIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
  /** Controlled open state. When omitted the component manages its own state. */
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Visible label rendered inside the disclosure trigger. */
  title: string
  /** Optional content rendered after the title (e.g. a "filled" counter). */
  trailing?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * Accessible disclosure section following the WAI-ARIA "disclosure" pattern.
 *
 * - The trigger exposes `aria-expanded` / `aria-controls` and rotates its
 *   chevron to reflect the state.
 * - The content is a `region` labelled by the trigger so screen reader users
 *   can jump to it from the control.
 * - When collapsed the content is `inert`: visually hidden, untabbable, and
 *   removed from the accessibility tree, while the CSS `grid-template-rows`
 *   animation still works in both directions.
 * - All animations respect `prefers-reduced-motion`.
 */
export function CollapsibleSection({
  open,
  defaultOpen = false,
  onOpenChange,
  title,
  trailing,
  className,
  children,
}: CollapsibleSectionProps) {
  const baseId = useId()
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen

  const toggle = () => {
    const next = !isOpen
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  return (
    <div
      data-slot="collapsible-section"
      data-state={isOpen ? 'open' : 'closed'}
      className={cn('group flex flex-col', className)}
    >
      <button
        type="button"
        id={`${baseId}-trigger`}
        aria-expanded={isOpen}
        aria-controls={`${baseId}-content`}
        onClick={toggle}
        className="text-muted-foreground hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex items-center gap-1.5 self-start rounded-md py-1 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50"
      >
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform duration-200 ease-out group-data-[state=open]:rotate-180 motion-reduce:transition-none"
        />
        <span>{title}</span>
        {trailing}
      </button>

      <div
        id={`${baseId}-content`}
        role="region"
        aria-labelledby={`${baseId}-trigger`}
        data-slot="collapsible-content"
        inert={!isOpen}
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  )
}
