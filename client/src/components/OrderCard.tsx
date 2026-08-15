import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'
import { fmt } from '../lib/useLive'
import { eventLabel, eventSourceNote } from '../lib/domain'
import { mockEvidenceSource, isVerifiedEvidence } from '../lib/mocks'
import { StatusPill } from '@/components/StatusPill'
import { RiskBadge, RISK_THRESHOLD } from '@/components/RiskBadge'
import { EvidenceBadge } from '@/components/EvidenceBadge'
import { cn } from '@/lib/utils'
import type { Escalation, Message, Order, OrderEvent, Pod, PodCondition } from '../../../shared/types'
import { STATE_STATUS_TONE, type StatusTone } from '../lib/domain'

/** Full order detail as returned by GET /api/orders/:id. */
export type OrderDetail = {
  order: Order
  events: OrderEvent[]
  messages: Message[]
  escalations: Escalation[]
  pods: Pod[]
}

// The 6px status spine color, keyed off the same semantic tone as the StatusPill.
const SPINE_CLASS: Record<StatusTone, string> = {
  ordered: 'bg-status-ordered',
  motion: 'bg-status-motion',
  done: 'bg-status-done',
  risk: 'bg-status-risk',
}

const CONDITION_LABEL: Record<keyof PodCondition, string> = {
  clean: 'Clean',
  functional: 'Functional',
  patient_ready: 'Patient-ready',
}

export function OrderCard({
  order,
  patientName,
  vendorName,
  actions,
  variant = 'full',
  deadlineNote,
  reason,
}: {
  order: Order
  patientName?: string
  vendorName?: string
  actions?: React.ReactNode
  /** `mini` is the compact board-column card; `full` is the expandable at-risk/detail card. */
  variant?: 'full' | 'mini'
  /** A human deadline line ("Home discharge tomorrow, 9:00 AM"). */
  deadlineNote?: React.ReactNode
  /** A human risk/urgency sentence, shown in the coral/red reason strip. */
  reason?: React.ReactNode
}) {
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const atRisk = (order.risk_score ?? 0) >= RISK_THRESHOLD
  // The status spine reads risk first, then the order's own state.
  const spineTone: StatusTone = atRisk ? 'risk' : STATE_STATUS_TONE[order.state]

  const verified =
    order.state === 'delivered' ? order.delivery_verified : order.state === 'picked_up' ? order.pickup_verified : null

  const toggle = () =>
    detail ? setDetail(null) : api.get<OrderDetail>(`/api/orders/${order.id}`).then(setDetail).catch(console.error)

  const mini = variant === 'mini'

  return (
    <article
      className={cn(
        'flex cursor-pointer overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(38,50,64,.04),0_14px_34px_-20px_rgba(38,50,64,.20)] transition-shadow hover:shadow-[0_1px_2px_rgba(38,50,64,.06),0_18px_40px_-20px_rgba(38,50,64,.28)]',
        atRisk ? 'border-destructive/40 ring-1 ring-destructive/20' : 'border-border'
      )}
      onClick={toggle}
    >
      <div className={cn('w-1.5 flex-none', SPINE_CLASS[spineTone])} aria-hidden="true" />
      <div className={cn('min-w-0 flex-1', mini ? 'p-4' : 'p-5')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn('truncate font-display font-bold tracking-tight', mini ? 'text-base' : 'text-lg')}>
                {patientName ?? `Patient ${order.patient_id}`}
              </span>
              <span className="tabular-nums text-xs font-semibold text-faint">#{order.id}</span>
            </div>
            <div className={cn('mt-1 text-muted-foreground', mini ? 'text-xs' : 'text-sm')}>
              {order.equipment_name} <span className="tabular-nums text-faint">· {order.hcpcs_code}</span>
              {vendorName && !mini && <span> · {vendorName}</span>}
              {order.urgency === 'stat' && (
                <span className="ml-1.5 font-bold uppercase tracking-wide text-[#d2694c]">STAT</span>
              )}
            </div>
          </div>
          <StatusPill state={order.state} className="shrink-0" />
        </div>

        {deadlineNote && !mini && (
          <div className="mt-3 text-sm text-muted-foreground [&_b]:font-bold [&_b]:text-foreground">{deadlineNote}</div>
        )}

        {reason && !mini && (
          <div
            className={cn(
              'mt-4 flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm leading-snug',
              atRisk ? 'bg-destructive/10 text-[#8e2a27]' : 'bg-coral-tint text-[#9a4a2e]'
            )}
          >
            <AlertTriangle className="mt-0.5 size-4 flex-none" />
            <span className="[&_b]:font-bold">{reason}</span>
          </div>
        )}

        <div
          className={cn(
            'flex flex-wrap items-center gap-x-3 gap-y-1.5 text-muted-foreground',
            mini ? 'mt-3.5 justify-between text-xs' : 'mt-3 text-xs'
          )}
        >
          {order.urgency !== 'routine' && order.urgency !== 'stat' && (
            <span className="font-semibold uppercase tracking-wide text-primary">{order.urgency}</span>
          )}
          {verified !== null && <EvidenceBadge verified={verified} />}
          {order.target_at && !deadlineNote && <span className="tabular-nums">Due {fmt(order.target_at)}</span>}
          {order.eta_at && <span className="tabular-nums text-faint">ETA {fmt(order.eta_at)}</span>}
          {!mini && order.risk_score !== null && <RiskBadge score={order.risk_score} />}
        </div>

        {atRisk && !reason && order.risk_reasons && order.risk_reasons.length > 0 && !mini && (
          <ul className="mt-3 space-y-1 text-xs text-[#8e2a27]">
            {order.risk_reasons.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        )}

        {actions && (
          <div className="mt-4 flex flex-wrap gap-2.5" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}

        {detail && <OrderDetailPane detail={detail} />}
      </div>
    </article>
  )
}

/** The expanded pane: proof-of-delivery thumbnails, then the evidence-tagged timeline. */
function OrderDetailPane({ detail }: { detail: OrderDetail }) {
  const atRisk = (detail.order.risk_score ?? 0) >= RISK_THRESHOLD
  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4" onClick={(e) => e.stopPropagation()}>
      {detail.pods.length > 0 && <PodProof pods={detail.pods} />}

      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-faint">Activity</div>
        <ul className="space-y-2">
          {detail.events.map((e) => {
            const podBacked = e.type === 'delivered' || e.type === 'picked_up' ? podVerified(detail, e) : undefined
            const note = eventSourceNote(e)
            const verified = note
              ? podBacked === true
              : isVerifiedEvidence(mockEvidenceSource({ verified: podBacked, actor: e.actor }))
            // The safety rule made visible: while the order is at-risk, a vendor's *text*
            // (reported, not verified) does not clear the flag — only POD or a case-manager action does.
            const inertClaim = atRisk && !verified && e.actor === 'vendor'
            return (
              <li key={e.id} className="flex items-start justify-between gap-3 text-xs">
                <span className="min-w-0">
                  <span className="tabular-nums text-faint">{fmt(e.created_at)}</span>{' '}
                  <span className="text-foreground">{eventLabel(e.type)}</span>{' '}
                  <span className="text-faint">({e.actor})</span>
                  {note && <span className="text-faint"> · {note}</span>}
                  {inertClaim && (
                    <span className="ml-1 text-faint italic">— reported by text; doesn’t clear the risk flag</span>
                  )}
                </span>
                {evidenceRelevant(e.type) && <EvidenceBadge verified={verified} className="shrink-0" />}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function PodProof({ pods }: { pods: Pod[] }) {
  return (
    <div>
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-faint">Proof of delivery</div>
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
                      pod.condition![key] ? 'bg-success/15 text-[#24734f]' : 'bg-destructive/15 text-[#8e2a27]'
                    )}
                  >
                    {pod.condition![key] ? '✓' : '✗'} {CONDITION_LABEL[key]}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Does this event carry a proof/claim distinction worth badging?
function evidenceRelevant(type: OrderEvent['type']): boolean {
  return ['vendor_accepted', 'eta_set', 'out_for_delivery', 'delivered', 'picked_up'].includes(type)
}

// A delivered/picked_up event is verified only if a POD of the matching kind exists.
function podVerified(detail: OrderDetail, e: OrderEvent): boolean {
  const kind = e.type === 'picked_up' ? 'pickup' : 'delivery'
  return detail.pods.some((p) => p.kind === kind)
}
