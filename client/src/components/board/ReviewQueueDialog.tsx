import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { expectOwn } from '../../lib/expectedEvents'
import { useHighlight } from '../../lib/highlight'
import { intentLabel, REVIEW_STATUS_LABEL } from '../../lib/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Message, Order } from '../../../../shared/types'

export function ReviewQueueDialog({
  queue,
  orders,
  open,
  onOpenChange,
}: {
  queue: Message[]
  orders: Order[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vendor replies that need a person</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {queue.map((m) => (
            <ReviewItem key={m.id} message={m} orders={orders} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ReviewItem({ message, orders }: { message: Message; orders: Order[] }) {
  const [orderId, setOrderId] = useState<string>(message.order_id ? String(message.order_id) : '')
  const [busy, setBusy] = useState(false)
  const { pulse } = useHighlight()
  const active = orders.filter((o) => o.vendor_id === message.vendor_id && !['picked_up', 'cancelled'].includes(o.state))

  // The dialog stays open on purpose — there may be more replies waiting behind this one.
  async function apply() {
    const id = Number(orderId)
    setBusy(true)
    expectOwn([`order:${id}`])
    try {
      await api.post(`/api/messages/${message.id}/confirm`, { order_id: id })
      toast.success(`Applied to order #${id}`, {
        description: message.parsed ? intentLabel(message.parsed.intent) : undefined,
      })
      pulse(id)
    } catch {
      toast.error("That didn't go through — give it another tap.")
    } finally {
      setBusy(false)
    }
  }

  async function dismiss() {
    setBusy(true)
    try {
      await api.post(`/api/messages/${message.id}/reject`)
      toast.success('Dismissed')
    } catch {
      toast.error("That didn't go through — give it another tap.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-accent p-3.5 text-sm">
      <div className="font-medium text-foreground">“{message.body}”</div>
      {message.parsed ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Reads as <Badge variant="secondary">{intentLabel(message.parsed.intent)}</Badge>
          <span className="tabular-nums">· {Math.round((message.parsed.confidence ?? 0) * 100)}% sure</span>
          {message.review_status && <Badge variant="muted">{REVIEW_STATUS_LABEL[message.review_status]}</Badge>}
        </div>
      ) : (
        <div className="mt-1.5 text-xs text-muted-foreground">Couldn’t be read — needs a person.</div>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-border bg-card px-2 text-xs"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
        >
          <option value="">Which order?</option>
          {active.map((o) => (
            <option key={o.id} value={o.id}>
              #{o.id} {o.equipment_name}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={!message.parsed || !orderId || busy} onClick={apply}>
          Apply
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={dismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}
