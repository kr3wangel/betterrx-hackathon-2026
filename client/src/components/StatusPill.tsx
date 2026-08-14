import type { OrderState } from '../../../shared/types'
import { Badge } from '@/components/ui/badge'
import { STATE_LABEL, STATE_STATUS_TONE, type StatusTone } from '@/lib/domain'
import { cn } from '@/lib/utils'

// Maps our semantic status tone to a Badge variant.
// neutral(ordered) → muted · motion → secondary(navy) · done → success(green) · risk → destructive(red)
const TONE_VARIANT: Record<StatusTone, 'muted' | 'secondary' | 'success' | 'destructive'> = {
  ordered: 'muted',
  motion: 'secondary',
  done: 'success',
  risk: 'destructive',
}

/**
 * StatusPill — plain-English order status as a Badge.
 * Never renders raw state names ("dispatched"); always the human label ("Accepted").
 */
export function StatusPill({ state, className }: { state: OrderState; className?: string }) {
  return (
    <Badge variant={TONE_VARIANT[STATE_STATUS_TONE[state]]} className={cn('tabular-nums', className)}>
      {STATE_LABEL[state]}
    </Badge>
  )
}
