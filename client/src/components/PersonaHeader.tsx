import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * PersonaHeader — names the surface and, when there is one, the persona who lives on it.
 * The coral eyebrow (persona) sits above a big rounded-bold title. Omit `persona` on
 * surfaces that name a page rather than a person (e.g. the reports pages).
 */
export function PersonaHeader({
  persona,
  title,
  description,
  actions,
  className,
}: {
  persona?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div>
        {persona && (
          <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">{persona}</div>
        )}
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
