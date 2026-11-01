import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * A dialog over the page: a title, a one-line description, its content, then the actions. Focus
 * moves into it and comes back when it closes; Escape closes it; Tab stays inside it. It is put
 * directly in the page: inside a card with a blur it would be centred on the card, not the window.
 */
export function Dialog({
  title,
  description,
  icon,
  tone = 'tone-sky',
  onClose,
  children,
  actions,
  width,
}: {
  title: string
  description?: string
  icon: ReactNode
  tone?: string
  onClose: () => void
  children?: ReactNode
  actions: ReactNode
  width?: number
}) {
  const titleId = useId()
  const descriptionId = useId()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const first = box.current?.querySelector<HTMLElement>('input, select, textarea, button:not([disabled])')
    first?.focus()
    return () => before?.focus()
  }, [])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !box.current) return
    const focusable = [...box.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={box}
        className="dialog rise-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onKeyDown={onKeyDown}
        style={width ? ({ '--dialog-width': `${width}px` } as React.CSSProperties) : undefined}
      >
        <div className="flex items-start gap-3 border-b border-line p-5">
          <span className={`icon-tile ${tone}`} aria-hidden="true">
            {icon}
          </span>
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="m-0 text-base font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="m-0 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
        </div>
        {children && <div className="flex min-h-0 flex-col gap-3 overflow-auto p-5">{children}</div>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4">{actions}</div>
      </div>
    </div>,
    document.body,
  )
}
