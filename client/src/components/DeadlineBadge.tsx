import { AlarmClock, CalendarClock, TriangleAlert } from 'lucide-react'
import type { Order, OrderState } from '../../../shared/types'
import { cn } from '@/lib/utils'

const AT_RISK_MS = 2 * 60 * 60 * 1000

const DEADLINE_STATES: OrderState[] = ['ordered', 'dispatched', 'in_transit']

export type DeadlineTone = 'calm' | 'late'

export interface Deadline {
  tone: DeadlineTone
  /** "Due in 4h" / "Late by 2h" — plain English, no raw timestamps. */
  label: string
  /** The deadline itself, e.g. "Fri 9:00 AM". */
  due: string
  /** Set when the vendor's own ETA lands after the deadline. */
  etaWarning: string | null
}

export function formatGap(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  const restMins = mins % 60
  if (hours < 24) return restMins ? `${hours}h ${restMins}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours ? `${days}d ${restHours}h` : `${days}d`
}

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** SLA vs actual: the order's deadline (target_at is SLA-derived server-side) against the clock. */
export function deadlineFor(order: Order, now: number): Deadline | null {
  if (!order.target_at || !DEADLINE_STATES.includes(order.state)) return null
  const target = new Date(order.target_at).getTime()
  const gap = target - now
  const late = gap < 0
  const etaMs = order.eta_at ? new Date(order.eta_at).getTime() : null
  return {
    tone: late || gap <= AT_RISK_MS ? 'late' : 'calm',
    label: late ? `Late by ${formatGap(-gap)}` : `Due in ${formatGap(gap)}`,
    due: formatWhen(order.target_at),
    etaWarning:
      etaMs && etaMs > target ? `Your ETA lands ${formatGap(etaMs - target)} past the deadline` : null,
  }
}

/**
 * DeadlineBadge — on-time vs late against the order's SLA deadline.
 * Red only when the deadline has passed or is inside the at-risk window.
 */
export function DeadlineBadge({ order, now, className }: { order: Order; now: number; className?: string }) {
  const deadline = deadlineFor(order, now)
  if (!deadline) return null
  const late = deadline.tone === 'late'
  const Icon = late ? AlarmClock : CalendarClock
  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        className={cn(
          'flex items-center gap-2 text-sm tabular-nums',
          late ? 'font-semibold text-destructive' : 'text-muted-foreground'
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span>{deadline.label}</span>
        <span className="text-faint">·</span>
        <span className={late ? 'font-normal' : undefined}>by {deadline.due}</span>
      </div>
      {deadline.etaWarning && (
        <div className="flex items-center gap-2 text-sm font-semibold text-destructive tabular-nums">
          <TriangleAlert className="size-4 shrink-0" />
          <span>{deadline.etaWarning}</span>
        </div>
      )}
    </div>
  )
}
