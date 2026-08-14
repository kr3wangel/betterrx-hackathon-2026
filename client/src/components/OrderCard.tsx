import { useState } from 'react'
import { api } from '../lib/api'
import { fmt } from '../lib/useLive'
import { STATE_LABEL, STATE_TONE } from '../lib/domain'
import { Badge } from './ui'
import type { Order, OrderEvent } from '../../../shared/types'

const RISK_THRESHOLD = 70

type Detail = { order: Order; events: OrderEvent[] }

export function OrderCard({
  order,
  patientName,
  vendorName,
  actions,
}: {
  order: Order
  patientName?: string
  vendorName?: string
  actions?: React.ReactNode
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const atRisk = (order.risk_score ?? 0) >= RISK_THRESHOLD
  const verified =
    order.state === 'delivered' ? order.delivery_verified : order.state === 'picked_up' ? order.pickup_verified : null

  return (
    <div
      className={`cursor-pointer rounded-lg border bg-white p-3 shadow-sm ${atRisk ? 'border-red-400 ring-1 ring-red-200' : 'border-slate-200'}`}
      onClick={() =>
        detail ? setDetail(null) : api.get<Detail>(`/api/orders/${order.id}`).then(setDetail).catch(console.error)
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">
            #{order.id} · {order.equipment_name}
          </div>
          <div className="text-xs text-slate-500">
            {patientName ?? `patient ${order.patient_id}`} · {vendorName ?? `vendor ${order.vendor_id}`}
          </div>
        </div>
        <Badge tone={STATE_TONE[order.state]}>{STATE_LABEL[order.state]}</Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        {order.urgency !== 'routine' && <Badge tone="yellow">{order.urgency}</Badge>}
        {verified !== null &&
          (verified ? <Badge tone="green">✓ Verified</Badge> : <Badge tone="gray">Vendor-reported</Badge>)}
        {(order.state === 'dispatched' || order.state === 'in_transit') && (
          <span className="text-slate-400">vendor-reported</span>
        )}
        {order.target_at && <span>due {fmt(order.target_at)}</span>}
        {order.eta_at && <span>ETA {fmt(order.eta_at)}</span>}
        {order.risk_score !== null && (
          <Badge tone={atRisk ? 'red' : 'gray'}>risk {order.risk_score}</Badge>
        )}
      </div>

      {atRisk && order.risk_reasons && (
        <ul className="mt-2 space-y-0.5 text-xs text-red-700">
          {order.risk_reasons.map((r, i) => (
            <li key={i}>• {r}</li>
          ))}
        </ul>
      )}

      {actions && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}

      {detail && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <div className="mb-1 text-xs font-semibold text-slate-500">Activity</div>
          <ul className="space-y-1 text-xs text-slate-600">
            {detail.events.map((e) => (
              <li key={e.id}>
                <span className="text-slate-400">{fmt(e.created_at)}</span> — {e.type.replaceAll('_', ' ')}{' '}
                <span className="text-slate-400">({e.actor})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
