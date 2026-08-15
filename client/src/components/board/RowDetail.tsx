import { api } from '../../lib/api'
import { fmt, useLive } from '../../lib/useLive'
import { eventLabel, eventSourceNote } from '../../lib/domain'
import { isPickup, plainItem } from '../../lib/board'
import { mockEvidenceSource, isVerifiedEvidence } from '../../lib/mocks'
import { EvidenceBadge } from '@/components/EvidenceBadge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Escalation, Message, Order, OrderEvent, Pod, PodCondition, Vendor } from '../../../../shared/types'

export interface OrderDetail {
  order: Order
  events: OrderEvent[]
  messages: Message[]
  escalations: Escalation[]
  pods: Pod[]
}

const CONDITION_LABEL: Record<keyof PodCondition, string> = {
  clean: 'Clean',
  functional: 'Functional',
  patient_ready: 'Patient-ready',
}

const NUDGE_TEMPLATES = ['v_ack_nag', 'v_eta_check', 'v_pickup_request']

function ago(iso: string, now: Date): string {
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hours = mins / 60
  if (hours < 24) return `${Math.round(hours)}h ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function RowDetail({ order, vendor }: { order: Order; vendor?: Vendor }) {
  const { data: detail } = useLive(() => api.get<OrderDetail>(`/api/orders/${order.id}`), [order.id])

  if (!detail) return <div className="px-1 py-3 text-sm text-muted-foreground">Opening…</div>

  const now = new Date()
  const promiseMissesNeed =
    !!order.target_at && !!order.eta_at && new Date(order.eta_at) > new Date(order.target_at)
  const lastHeard = [...detail.messages].reverse().find((m) => m.direction === 'in')
  const nudges = detail.messages.filter((m) => m.direction === 'out' && m.template && NUDGE_TEMPLATES.includes(m.template))
  const verified = order.state === 'picked_up' ? order.pickup_verified : order.delivery_verified

  return (
    <div className="space-y-5 border-t border-border pt-4 text-sm" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="font-semibold">{vendor?.name ?? `Vendor ${order.vendor_id}`}</span>
        <span className="tabular-nums text-faint">#{order.id}</span>
        <span className="text-muted-foreground">{plainItem(order.equipment_name)}</span>
        <EvidenceBadge verified={verified} className="ml-auto" />
      </div>

      <div className="flex flex-wrap gap-x-12 gap-y-3">
        <Field label="Needed by" value={order.target_at ? fmt(order.target_at) : 'No deadline set'} />
        <Field
          label="Vendor promised"
          value={order.eta_at ? fmt(order.eta_at) : 'Nothing promised yet'}
          alarm={promiseMissesNeed}
        />
      </div>

      <div className="text-muted-foreground">
        {lastHeard ? `Last heard from the vendor ${ago(lastHeard.created_at, now)}` : 'The vendor has not replied yet'}
        {nudges.length > 0 && ` · nudged ${nudges.map((n) => ago(n.created_at, now)).join(' · ')}`}
      </div>

      {isPickup(order) && vendor && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted px-4 py-3">
          <span className="font-display text-base font-bold tabular-nums tracking-tight">{vendor.phone}</span>
          <span className="text-muted-foreground">{vendor.contact_name}</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() =>
              api
                .post('/api/messages/send', { order_id: order.id, template: 'v_pickup_request' })
                .catch(console.error)
            }
          >
            Send another nudge
          </Button>
        </div>
      )}

      {order.risk_reasons && order.risk_reasons.length > 0 && (
        <ul className="space-y-1 text-muted-foreground">
          {order.risk_reasons.map((r, i) => (
            <li key={i}>· {r[0].toUpperCase() + r.slice(1)}.</li>
          ))}
        </ul>
      )}

      {detail.pods.length > 0 && <PodProof pods={detail.pods} />}

      <ul className="space-y-1.5 text-xs">
        {detail.events.map((e) => {
          const podBacked = e.type === 'delivered' || e.type === 'picked_up' ? podVerified(detail, e) : undefined
          const note = eventSourceNote(e)
          const verified = note
            ? podBacked === true
            : isVerifiedEvidence(mockEvidenceSource({ verified: podBacked, actor: e.actor }))
          return (
            <li key={e.id} className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="tabular-nums text-faint">{fmt(e.created_at)}</span>{' '}
                <span className="text-foreground">{eventLabel(e.type)}</span>
                {note && <span className="text-faint"> · {note}</span>}
              </span>
              {evidenceRelevant(e.type) && <EvidenceBadge verified={verified} className="shrink-0" />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Field({ label, value, alarm }: { label: string; value: string; alarm?: boolean }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-[0.08em] text-faint">{label}</div>
      <div className={cn('mt-0.5 tabular-nums', alarm ? 'text-destructive' : 'text-foreground')}>{value}</div>
    </div>
  )
}

function PodProof({ pods }: { pods: Pod[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {pods.map((pod) => (
        <div key={pod.id} className="rounded-xl border border-border bg-muted/40 p-2">
          <div className="flex gap-2">
            {pod.photo_path && (
              <img
                src={`/${pod.photo_path.replace(/^data\//, 'api/')}`}
                alt="Delivery photo"
                className="size-20 rounded-lg object-cover"
              />
            )}
            {pod.signature_path && (
              <img
                src={`/${pod.signature_path.replace(/^data\//, 'api/')}`}
                alt="Signature"
                className="size-20 rounded-lg border border-border bg-white object-contain"
              />
            )}
          </div>
          <div className="mt-1.5 tabular-nums text-[11px] text-muted-foreground">
            {pod.kind === 'pickup' ? 'Picked up' : 'Delivered'} · {fmt(pod.captured_at)}
          </div>
          {pod.condition && (
            <div className="mt-1 flex flex-wrap gap-1">
              {(Object.keys(CONDITION_LABEL) as (keyof PodCondition)[]).map((key) => (
                <span
                  key={key}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    pod.condition![key] ? 'bg-success/15 text-[#24734f]' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {pod.condition![key] ? '✓' : '—'} {CONDITION_LABEL[key]}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function evidenceRelevant(type: OrderEvent['type']): boolean {
  return ['vendor_accepted', 'eta_set', 'out_for_delivery', 'delivered', 'picked_up'].includes(type)
}

function podVerified(detail: OrderDetail, e: OrderEvent): boolean {
  const kind = e.type === 'picked_up' ? 'pickup' : 'delivery'
  return detail.pods.some((p) => p.kind === kind)
}
