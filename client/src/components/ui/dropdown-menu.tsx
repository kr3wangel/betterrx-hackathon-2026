import { createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Lightweight, dependency-free dropdown menu for ACTION lists — the account/role
// switcher, vendor swap, row menus. For bound form VALUES (patient, urgency), use the
// Radix Select in ui/select.tsx instead: a menu fires actions, a select holds a value.

type Ctx = { open: boolean; setOpen: (o: boolean) => void }
const DropdownCtx = createContext<Ctx | null>(null)

function useDropdown(): Ctx {
  const ctx = useContext(DropdownCtx)
  if (!ctx) throw new Error('DropdownMenu subcomponents must be used within <DropdownMenu>')
  return ctx
}

export function DropdownMenu({ children, className }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <DropdownCtx.Provider value={{ open, setOpen }}>
      <div className={cn('relative', className)}>{children}</div>
    </DropdownCtx.Provider>
  )
}

export function DropdownMenuTrigger({ className, children, ...props }: ComponentProps<'button'>) {
  const { open, setOpen } = useDropdown()
  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={className}
      {...props}
    >
      {children}
    </button>
  )
}

export function DropdownMenuContent({
  children,
  className,
  align = 'start',
}: {
  children: ReactNode
  className?: string
  align?: 'start' | 'end'
}) {
  const { open, setOpen } = useDropdown()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  return (
    <>
      {/* Click-away backdrop — closes the menu on any outside click. */}
      <button
        className="fixed inset-0 z-40 cursor-default"
        aria-label="Close menu"
        tabIndex={-1}
        onClick={() => setOpen(false)}
      />
      <div
        role="menu"
        className={cn(
          'absolute z-50 mt-2 min-w-[12rem] rounded-xl border border-border bg-card p-1.5 shadow-lg',
          align === 'end' ? 'right-0' : 'left-0',
          className
        )}
      >
        {children}
      </div>
    </>
  )
}

// A row that fires an action and closes the menu. `active` marks the current selection.
export function DropdownMenuItem({
  className,
  children,
  active,
  onClick,
  ...props
}: ComponentProps<'button'> & { active?: boolean }) {
  const { setOpen } = useDropdown()
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        onClick?.(e)
        setOpen(false)
      }}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted',
        active && 'bg-muted',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function DropdownMenuLabel({ className, children }: ComponentProps<'div'>) {
  return (
    <div className={cn('px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)}>
      {children}
    </div>
  )
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div className={cn('my-1 h-px bg-border', className)} />
}
