import { useState } from 'react'
import { Check, CircleSlash, Clock3, MapPin } from 'lucide-react'
import type { Order, OrderState } from '../../../shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DeadlineBadge } from '@/components/DeadlineBadge'
import { StatusPill } from '@/components/StatusPill'
import { STATE_STATUS_TONE, type StatusTone } from '@/lib/domain'
import { unitLocationLabel, type InventoryUnit } from '@/lib/mocks'
import { cn } from '@/lib/utils'

const SPINE: Record<StatusTone, string> = {
  ordered: 'bg-status-ordered',
  motion: 'bg-status-motion',
  done: 'bg-status-done',
  risk: 'bg-status-risk',
}

const CAN_SET_ETA: OrderState[] = ['dispatched', 'in_transit', 'pickup_pending', 'pickup_overdue']
const CAN_DECLINE: OrderState[] = ['ordered', 'dispatched', 'in_transit']

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function defaultEta(order: Order): string {
  if (order.eta_at) return toLocalInput(new Date(order.eta_at))
  return toLocalInput(new Date(Date.now() + 4 * 60 * 60 * 1000))
}

export interface PortalOrderCardProps {
  order: Order
  /** Optimistic state so a tap reads as done before the SSE refetch lands. */
  displayState: OrderState
  now: number
  unit?: InventoryUnit
  busy: boolean
  declined: boolean
  onConfirm: (etaIso?: string) => void
  onSetEta: (etaIso: string) => void
  onDecline: (reason?: string) => void
}

export function PortalOrderCard({
  order,
  displayState,
  now,
  unit,
  busy,
  declined,
  onConfirm,
  onSetEta,
  onDecline,
}: PortalOrderCardProps) {
  const [etaOpen, setEtaOpen] = useState(false)
  const [etaValue, setEtaValue] = useState(() => defaultEta(order))
  const [declineOpen, setDeclineOpen] = useState(false)
  const [reason, setReason] = useState('')

  const canConfirm = displayState === 'ordered' && !declined
  const canSetEta = CAN_SET_ETA.includes(displayState)
  const canDecline = CAN_DECLINE.includes(displayState) && !declined
  const shown = { ...order, state: displayState }

  const openEta = () => {
    setEtaValue(defaultEta(order))
    setEtaOpen(true)
  }

  const submitEta = () => {
    if (!etaValue) return
    const iso = new Date(etaValue).toISOString()
    setEtaOpen(false)
    if (canConfirm) onConfirm(iso)
    else onSetEta(iso)
  }

  return (
    <Card className="flex-row gap-0 overflow-hidden p-0">
      <div className={cn('w-1.5 flex-none', SPINE[STATE_STATUS_TONE[displayState]])} />
      <div className="flex-1 space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-bold text-foreground">{order.equipment_name}</h3>
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">
              Order #{order.id} · {order.hcpcs_code}
              {order.quantity > 1 && ` · qty ${order.quantity}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {order.urgency !== 'routine' && (
              <Badge variant={order.urgency === 'stat' ? 'destructive' : 'default'}>
                {order.urgency === 'stat' ? 'STAT' : 'Urgent'}
              </Badge>
            )}
            <StatusPill state={displayState} />
          </div>
        </div>

        <DeadlineBadge order={shown} now={now} />

        {order.eta_at && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
            <Clock3 className="size-4 shrink-0" />
            You said {new Date(order.eta_at).toLocaleString(undefined, {
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        )}

        {unit && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
            <MapPin className="size-4 shrink-0" />
            Unit {unit.serial} · {unitLocationLabel(unit.location)} · {unit.where}
          </p>
        )}

        {declined && (
          <p className="rounded-lg bg-coral-tint px-3 py-2 text-sm font-semibold text-foreground">
            Thanks — the hospice is re-routing this one. Nothing else needed from you.
          </p>
        )}

        {(canConfirm || canSetEta || canDecline) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {canConfirm && (
              <Button onClick={() => onConfirm()} disabled={busy}>
                <Check />
                Yes, we can fill it
              </Button>
            )}
            {(canConfirm || canSetEta) && (
              <Button variant={canConfirm ? 'outline' : 'secondary'} onClick={openEta} disabled={busy}>
                <Clock3 />
                {canConfirm ? 'Accept with an ETA' : order.eta_at ? 'Update ETA' : 'Set an ETA'}
              </Button>
            )}
            {canDecline && (
              <Button
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setDeclineOpen(true)}
                disabled={busy}
              >
                <CircleSlash />
                Can't fill it
              </Button>
            )}
          </div>
        )}
      </div>

      <Dialog open={etaOpen} onOpenChange={setEtaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>When can you get there?</DialogTitle>
            <DialogDescription>
              {order.equipment_name} · order #{order.id}. The hospice sees this the second you save it.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="datetime-local"
            value={etaValue}
            onChange={(e) => setEtaValue(e.target.value)}
            className="tabular-nums"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEtaOpen(false)}>
              Never mind
            </Button>
            <Button onClick={submitEta} disabled={!etaValue}>
              {canConfirm ? 'Accept with this ETA' : 'Save ETA'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Can't fill this one?</DialogTitle>
            <DialogDescription>
              We'll tell the hospice right away so they can find another vendor. A reason helps, but it's
              optional.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Out of stock until Monday"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeclineOpen(false)}>
              Never mind
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDeclineOpen(false)
                onDecline(reason.trim() || undefined)
              }}
            >
              Tell the hospice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
