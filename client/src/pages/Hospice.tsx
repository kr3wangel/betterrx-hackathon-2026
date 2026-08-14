import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useLive } from '../lib/useLive'
import { BOARD_COLUMNS, CATALOG } from '../lib/domain'
import { Badge, Button, Card } from '../components/ui'
import { OrderCard } from '../components/OrderCard'
import type { Escalation, Message, Order, Patient, Vendor } from '../../../shared/types'

type VendorWithStats = Vendor & { avg_on_time_rate: number | null }

export default function Hospice() {
  const { data: orders } = useLive(() => api.get<Order[]>('/api/orders'))
  const { data: patients } = useLive(() => api.get<Patient[]>('/api/patients'))
  const { data: vendors } = useLive(() => api.get<VendorWithStats[]>('/api/vendors'))
  const { data: escalations } = useLive(() => api.get<Escalation[]>('/api/escalations?status=open'))
  const { data: reviewQueue } = useLive(() => api.get<Message[]>('/api/messages?review_status=needs_review'))

  const patientName = useMemo(() => new Map((patients ?? []).map((p) => [p.id, p.name])), [patients])
  const vendorName = useMemo(() => new Map((vendors ?? []).map((v) => [v.id, v.name])), [vendors])

  return (
    <div className="space-y-4">
      {escalations && escalations.length > 0 && (
        <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3">
          <div className="text-sm font-semibold text-red-800">
            {escalations.length} escalation{escalations.length > 1 ? 's' : ''} need attention
          </div>
          {escalations.map((e) => {
            const order = orders?.find((o) => o.id === e.order_id)
            return (
              <div key={e.id} className="flex items-center justify-between gap-3 text-sm text-red-900">
                <span>
                  <b>#{e.order_id}</b> — {e.reason}
                </span>
                <span className="flex shrink-0 gap-2">
                  {order && vendors && ['ordered', 'dispatched', 'in_transit'].includes(order.state) && (
                    <SwapVendor order={order} vendors={vendors} />
                  )}
                  <Button variant="secondary" onClick={() => api.post(`/api/escalations/${e.id}/ack`)}>
                    Ack
                  </Button>
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {BOARD_COLUMNS.map((col) => (
            <div key={col.title} className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{col.title}</div>
              {(orders ?? [])
                .filter((o) => col.states.includes(o.state))
                .map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    patientName={patientName.get(o.patient_id)}
                    vendorName={vendorName.get(o.vendor_id)}
                  />
                ))}
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <NewOrderForm patients={patients ?? []} vendors={vendors ?? []} />
          <ReviewQueue queue={reviewQueue ?? []} orders={orders ?? []} />
          <EmrSimulator patients={patients ?? []} />
        </div>
      </div>
    </div>
  )
}

function SwapVendor({ order, vendors }: { order: Order; vendors: VendorWithStats[] }) {
  const alternatives = vendors.filter((v) => v.id !== order.vendor_id)
  return (
    <select
      className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs"
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) api.post(`/api/orders/${order.id}/swap-vendor`, { vendor_id: Number(e.target.value) })
      }}
    >
      <option value="" disabled>
        Swap vendor…
      </option>
      {alternatives.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name} ({Math.round((v.avg_on_time_rate ?? 0) * 100)}% on-time)
        </option>
      ))}
    </select>
  )
}

const inputCls = 'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm'

function NewOrderForm({ patients, vendors }: { patients: Patient[]; vendors: VendorWithStats[] }) {
  const [form, setForm] = useState({ patient_id: '', vendor_id: '', catalog: '0', urgency: 'routine', target_at: '' })

  return (
    <Card title="New order">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          const item = CATALOG[Number(form.catalog)]
          api.post('/api/orders', {
            patient_id: Number(form.patient_id),
            vendor_id: Number(form.vendor_id),
            ...item,
            urgency: form.urgency,
            target_at: form.target_at ? new Date(form.target_at).toISOString() : null,
          })
          setForm({ patient_id: '', vendor_id: '', catalog: '0', urgency: 'routine', target_at: '' })
        }}
      >
        <select required className={inputCls} value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })}>
          <option value="">Patient…</option>
          {patients.filter((p) => p.status === 'active').map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select required className={inputCls} value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}>
          <option value="">Vendor…</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({Math.round((v.avg_on_time_rate ?? 0) * 100)}% on-time)
            </option>
          ))}
        </select>
        <select className={inputCls} value={form.catalog} onChange={(e) => setForm({ ...form, catalog: e.target.value })}>
          {CATALOG.map((c, i) => (
            <option key={c.hcpcs_code} value={i}>{c.equipment_name} ({c.hcpcs_code})</option>
          ))}
        </select>
        <div className="flex gap-2">
          <select className={inputCls} value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="stat">STAT</option>
          </select>
          <input type="datetime-local" className={inputCls} value={form.target_at} onChange={(e) => setForm({ ...form, target_at: e.target.value })} />
        </div>
        <Button type="submit" className="w-full">Place order</Button>
      </form>
    </Card>
  )
}

function ReviewQueue({ queue, orders }: { queue: Message[]; orders: Order[] }) {
  return (
    <Card title={`AI review queue (${queue.length})`}>
      {queue.length === 0 && <div className="text-xs text-slate-400">Nothing needs review.</div>}
      <div className="space-y-3">
        {queue.map((m) => (
          <ReviewItem key={m.id} message={m} orders={orders} />
        ))}
      </div>
    </Card>
  )
}

function ReviewItem({ message, orders }: { message: Message; orders: Order[] }) {
  const [orderId, setOrderId] = useState<string>(message.order_id ? String(message.order_id) : '')
  const active = orders.filter((o) => o.vendor_id === message.vendor_id && !['picked_up', 'cancelled'].includes(o.state))

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs">
      <div className="font-medium text-slate-800">“{message.body}”</div>
      {message.parsed ? (
        <div className="mt-1 text-slate-600">
          reads as <Badge tone="blue">{message.parsed.intent}</Badge> · confidence{' '}
          {Math.round((message.parsed.confidence ?? 0) * 100)}%
          {message.parsed.eta_iso && <> · ETA {new Date(message.parsed.eta_iso).toLocaleString()}</>}
        </div>
      ) : (
        <div className="mt-1 text-slate-500">could not be parsed</div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <select className="rounded-md border border-slate-300 px-1 py-1" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
          <option value="">Order…</option>
          {active.map((o) => (
            <option key={o.id} value={o.id}>#{o.id} {o.equipment_name}</option>
          ))}
        </select>
        <Button
          disabled={!message.parsed || !orderId}
          onClick={() => api.post(`/api/messages/${message.id}/confirm`, { order_id: Number(orderId) })}
        >
          Apply
        </Button>
        <Button variant="secondary" onClick={() => api.post(`/api/messages/${message.id}/reject`)}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}

function EmrSimulator({ patients }: { patients: Patient[] }) {
  return (
    <Card title="EMR simulator">
      <div className="space-y-1.5">
        {patients.map((p) => (
          <div key={p.id} className="flex items-center justify-between text-xs">
            <span>
              {p.name} <Badge tone={p.status === 'active' ? 'green' : 'gray'}>{p.status}</Badge>
            </span>
            {p.status === 'active' && (
              <span className="flex gap-1">
                <Button variant="secondary" onClick={() => api.post('/api/emr/patient-status', { patient_id: p.id, status: 'discharged' })}>
                  Discharge
                </Button>
                <Button variant="danger" onClick={() => api.post('/api/emr/patient-status', { patient_id: p.id, status: 'deceased' })}>
                  Deceased
                </Button>
              </span>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
