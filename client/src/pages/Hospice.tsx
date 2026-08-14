import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { api } from '../lib/api'
import { useLive } from '../lib/useLive'
import { CATALOG, intentLabel, REVIEW_STATUS_LABEL } from '../lib/domain'
import type { OrderState } from '../../../shared/types'
import { selectNeedsAttention, selectBoardOrders, deadlineSentence } from '../lib/atRisk'
import { OrderCard } from '../components/OrderCard'
import { PersonaHeader } from '@/components/PersonaHeader'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { Escalation, Message, Order, Patient, ReportSummary, Vendor } from '../../../shared/types'

type VendorWithStats = Vendor & { avg_on_time_rate: number | null }

export default function Hospice() {
  const { data: orders } = useLive(() => api.get<Order[]>('/api/orders'))
  const { data: patients } = useLive(() => api.get<Patient[]>('/api/patients'))
  const { data: vendors } = useLive(() => api.get<VendorWithStats[]>('/api/vendors'))
  const { data: escalations } = useLive(() => api.get<Escalation[]>('/api/escalations?status=open'))
  const { data: reviewQueue } = useLive(() => api.get<Message[]>('/api/messages?review_status=needs_review'))
  const { data: summary } = useLive(() => api.get<ReportSummary>('/api/reports/summary'))

  const patientName = useMemo(() => new Map((patients ?? []).map((p) => [p.id, p.name])), [patients])
  const vendorName = useMemo(() => new Map((vendors ?? []).map((v) => [v.id, v.name])), [vendors])
  const needsAttention = useMemo(() => selectNeedsAttention(orders ?? []), [orders])
  const boardOrders = useMemo(() => selectBoardOrders(orders ?? []), [orders])

  return (
    <div className="space-y-14">
      <PersonaHeader
        persona="Case Manager"
        title="Hospice board"
        description="The short list that needs a person, then every order — updating itself as vendors reply."
        actions={
          <Button className="rounded-xl" onClick={() => (window.location.href = '/order')}>
            <Plus className="size-4" strokeWidth={2.6} /> New order
          </Button>
        }
      />

      <Glance summary={summary} />

      {escalations && escalations.length > 0 && (
        <EscalationBanner escalations={escalations} orders={orders ?? []} vendors={vendors ?? []} />
      )}

      <NeedsAttention
        orders={needsAttention}
        patientName={patientName}
        vendorName={vendorName}
        vendors={vendors ?? []}
      />

      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        <Board orders={boardOrders} patientName={patientName} vendorName={vendorName} />

        <div className="space-y-6">
          <NewOrderForm patients={patients ?? []} vendors={vendors ?? []} />
          <ReviewQueue queue={reviewQueue ?? []} orders={orders ?? []} />
          <EmrSimulator patients={patients ?? []} />
        </div>
      </div>

      <Legend />
    </div>
  )
}

// --- Glance stats — the human framing of what the coordination layer did today ------

function Glance({ summary }: { summary: ReportSummary | null }) {
  const calls = summary?.calls_avoided ?? 0
  const delivered = summary?.orders_by_state.delivered ?? 0
  const b = summary?.calls_avoided_breakdown
  const handoffs = b ? b.auto_applied_messages + b.vendor_self_service_updates + b.auto_triggered_pickups : 0
  return (
    <div className="flex flex-wrap items-baseline gap-x-11 gap-y-4">
      <Stat n={handoffs} label="handoffs" sub="coordinated today" />
      <Stat n={calls} label={calls === 1 ? 'phone call' : 'phone calls'} sub="the team never had to make" />
      <Stat n={delivered} label={delivered === 1 ? 'delivery' : 'deliveries'} sub="confirmed with a photo" />
    </div>
  )
}

function Stat({ n, label, sub }: { n: number; label: string; sub: string }) {
  return (
    <div className="font-display">
      <span className="text-lg font-bold">
        <span className="tabular-nums text-primary">{n}</span> {label}
      </span>
      <span className="ml-1.5 font-sans text-sm font-normal text-muted-foreground">{sub}</span>
    </div>
  )
}

// --- Escalation banner --------------------------------------------------------------

function EscalationBanner({
  escalations,
  orders,
  vendors,
}: {
  escalations: Escalation[]
  orders: Order[]
  vendors: VendorWithStats[]
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
      <div className="font-display text-base font-bold text-destructive">
        {escalations.length} escalation{escalations.length > 1 ? 's' : ''} need a decision
      </div>
      <div className="space-y-2.5">
        {escalations.map((e) => {
          const order = orders.find((o) => o.id === e.order_id)
          const swappable = order && ['ordered', 'dispatched', 'in_transit'].includes(order.state)
          return (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#8e2a27]">
              <span>
                <b className="font-semibold tabular-nums">#{e.order_id}</b> — {e.reason}
              </span>
              <span className="flex shrink-0 gap-2">
                {swappable && <SwapVendor order={order!} vendors={vendors} />}
                <Button variant="outline" size="sm" onClick={() => api.post(`/api/escalations/${e.id}/ack`)}>
                  Acknowledge
                </Button>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- "Needs attention" band — coral panel with white cards --------------------------

function NeedsAttention({
  orders,
  patientName,
  vendorName,
  vendors,
}: {
  orders: Order[]
  patientName: Map<number, string>
  vendorName: Map<number, string>
  vendors: VendorWithStats[]
}) {
  if (orders.length === 0) {
    return (
      <section className="rounded-3xl border border-[#f3ddd2] bg-coral-tint px-9 py-8">
        <Eyebrow>Needs attention</Eyebrow>
        <p className="mt-4 max-w-md font-display text-2xl font-bold tracking-tight">
          Nothing needs a person right now.
        </p>
        <p className="mt-3 max-w-sm text-sm text-muted-foreground">
          Every order is on track and updating itself. At-risk handoffs surface here first.
        </p>
      </section>
    )
  }

  return (
    <section className="grid gap-11 rounded-3xl border border-[#f3ddd2] bg-coral-tint px-9 py-8 md:grid-cols-[300px_1fr]">
      <div>
        <Eyebrow live>Needs attention</Eyebrow>
        <div className="mt-3.5 font-display text-[7rem] font-extrabold leading-[0.8] tracking-[-0.05em] text-destructive tabular-nums">
          {orders.length}
        </div>
        <p className="mt-5 font-display text-2xl font-bold leading-snug tracking-tight">
          {orders.length === 1
            ? 'One order won’t make its deadline unless someone acts.'
            : `${spell(orders.length)} orders won’t make their deadline unless someone acts.`}
        </p>
        <p className="mt-3 max-w-[260px] text-sm text-muted-foreground">
          Everything else is on track and updating itself. This is the short list that needs a person.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {orders.map((o) => {
          const swappable = ['ordered', 'dispatched', 'in_transit'].includes(o.state)
          return (
            <OrderCard
              key={o.id}
              order={o}
              patientName={patientName.get(o.patient_id)}
              vendorName={vendorName.get(o.vendor_id)}
              deadlineNote={deadlineSentence(o)}
              reason={o.risk_reasons && o.risk_reasons.length > 0 ? o.risk_reasons.join(' · ') : undefined}
              actions={swappable ? <SwapVendor order={o} vendors={vendors} primary /> : undefined}
            />
          )
        })}
      </div>
    </section>
  )
}

function Eyebrow({ children, live }: { children: React.ReactNode; live?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
      {live && <span className="size-2 animate-pulse rounded-full bg-destructive" aria-hidden="true" />}
      {children}
    </div>
  )
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
function spell(n: number): string {
  const w = NUMBER_WORDS[n]
  return w ? w[0].toUpperCase() + w.slice(1) : String(n)
}

// --- The full board -----------------------------------------------------------------

// The board mirrors the design reference's five triage-forward lanes; the plain-English
// column names come straight from the status vocabulary.
const BOARD_LANES: { title: string; states: OrderState[] }[] = [
  { title: 'Ordered', states: ['ordered'] },
  { title: 'Accepted', states: ['dispatched'] },
  { title: 'On the truck', states: ['in_transit'] },
  { title: 'Delivered', states: ['delivered'] },
  { title: 'Pickup', states: ['pickup_pending', 'pickup_overdue', 'picked_up'] },
]

function Board({
  orders,
  patientName,
  vendorName,
}: {
  orders: Order[]
  patientName: Map<number, string>
  vendorName: Map<number, string>
}) {
  return (
    <div>
      <div className="flex items-center gap-3.5">
        <h2 className="font-display text-xl font-extrabold tracking-tight">All orders</h2>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
        {BOARD_LANES.map((col) => {
          const inCol = orders.filter((o) => col.states.includes(o.state))
          return (
            <div key={col.title} className="space-y-3.5">
              <div className="flex items-center gap-2 px-0.5 font-display text-sm font-bold">
                {col.title} <span className="font-sans text-xs font-semibold tabular-nums text-muted-foreground">{inCol.length}</span>
              </div>
              {inCol.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  variant="mini"
                  patientName={patientName.get(o.patient_id)}
                  vendorName={vendorName.get(o.vendor_id)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-4 border-t border-border pt-6 text-sm text-muted-foreground">
      <Swatch color="bg-status-risk" label="Will miss a deadline" />
      <Swatch color="bg-status-motion" label="In motion" />
      <Swatch color="bg-status-done" label="Done, with proof" />
      <span className="inline-flex items-center gap-2">
        <Badge variant="success">Verified</Badge> = driver photo + signature
      </span>
      <span className="inline-flex items-center gap-2">
        <Badge variant="muted">Reported</Badge> = the vendor said so by text
      </span>
    </div>
  )
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={`h-1.5 w-6 rounded-full ${color}`} />
      {label}
    </span>
  )
}

// --- Vendor swap --------------------------------------------------------------------

function SwapVendor({ order, vendors, primary }: { order: Order; vendors: VendorWithStats[]; primary?: boolean }) {
  const alternatives = vendors.filter((v) => v.id !== order.vendor_id)
  return (
    <select
      className={`h-9 rounded-md border px-3 text-sm font-semibold ${
        primary
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground'
      }`}
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) api.post(`/api/orders/${order.id}/swap-vendor`, { vendor_id: Number(e.target.value) })
      }}
    >
      <option value="" disabled>
        Swap vendor…
      </option>
      {alternatives.map((v) => (
        <option key={v.id} value={v.id} className="text-foreground">
          {v.name} ({Math.round((v.avg_on_time_rate ?? 0) * 100)}% on-time)
        </option>
      ))}
    </select>
  )
}

// --- Right rail: new order, review queue, EMR simulator -----------------------------

function NewOrderForm({ patients, vendors }: { patients: Patient[]; vendors: VendorWithStats[] }) {
  const [form, setForm] = useState({ patient_id: '', vendor_id: '', catalog: '0', urgency: 'routine', target_at: '' })
  const selectCls =
    'w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

  return (
    <Card>
      <CardHeader>
        <CardTitle>New order</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-2.5"
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
          <select required className={selectCls} value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })}>
            <option value="">Patient…</option>
            {patients.filter((p) => p.status === 'active').map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select required className={selectCls} value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}>
            <option value="">Vendor…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({Math.round((v.avg_on_time_rate ?? 0) * 100)}% on-time)
              </option>
            ))}
          </select>
          <select className={selectCls} value={form.catalog} onChange={(e) => setForm({ ...form, catalog: e.target.value })}>
            {CATALOG.map((c, i) => (
              <option key={c.hcpcs_code} value={i}>{c.equipment_name} ({c.hcpcs_code})</option>
            ))}
          </select>
          <div className="flex gap-2">
            <select className={selectCls} value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}>
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="stat">STAT</option>
            </select>
            <Input type="datetime-local" value={form.target_at} onChange={(e) => setForm({ ...form, target_at: e.target.value })} />
          </div>
          <Button type="submit" className="w-full">Place order</Button>
        </form>
      </CardContent>
    </Card>
  )
}

function ReviewQueue({ queue, orders }: { queue: Message[]; orders: Order[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI review queue{queue.length > 0 && <span className="ml-1.5 tabular-nums text-muted-foreground">· {queue.length}</span>}</CardTitle>
      </CardHeader>
      <CardContent>
        {queue.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing needs a look — confident vendor replies apply themselves.
          </p>
        ) : (
          <div className="space-y-3">
            {queue.map((m) => (
              <ReviewItem key={m.id} message={m} orders={orders} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ReviewItem({ message, orders }: { message: Message; orders: Order[] }) {
  const [orderId, setOrderId] = useState<string>(message.order_id ? String(message.order_id) : '')
  const active = orders.filter((o) => o.vendor_id === message.vendor_id && !['picked_up', 'cancelled'].includes(o.state))

  return (
    <div className="rounded-xl border border-[#f3ddd2] bg-coral-tint p-3 text-sm">
      <div className="font-medium text-foreground">“{message.body}”</div>
      {message.parsed ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Reads as <Badge variant="secondary">{intentLabel(message.parsed.intent)}</Badge>
          <span className="tabular-nums">· {Math.round((message.parsed.confidence ?? 0) * 100)}% sure</span>
          {message.review_status && (
            <Badge variant="muted">{REVIEW_STATUS_LABEL[message.review_status]}</Badge>
          )}
          {message.parsed.eta_iso && <span className="tabular-nums">· ETA {new Date(message.parsed.eta_iso).toLocaleString()}</span>}
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
            <option key={o.id} value={o.id}>#{o.id} {o.equipment_name}</option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={!message.parsed || !orderId}
          onClick={() => api.post(`/api/messages/${message.id}/confirm`, { order_id: Number(orderId) })}
        >
          Apply
        </Button>
        <Button size="sm" variant="outline" onClick={() => api.post(`/api/messages/${message.id}/reject`)}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}

function EmrSimulator({ patients }: { patients: Patient[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>EMR simulator</CardTitle>
      </CardHeader>
      <CardContent>
        {patients.length === 0 ? (
          <EmptyState title="No patients seeded" className="py-8" />
        ) : (
          <div className="space-y-2">
            {patients.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  {p.name}
                  <Badge variant={p.status === 'active' ? 'success' : 'muted'}>
                    {p.status === 'active' ? 'Active' : p.status === 'discharged' ? 'Discharged' : 'Deceased'}
                  </Badge>
                </span>
                {p.status === 'active' && (
                  <span className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => api.post('/api/emr/patient-status', { patient_id: p.id, status: 'discharged' })}>
                      Discharge
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => api.post('/api/emr/patient-status', { patient_id: p.id, status: 'deceased' })}>
                      Deceased
                    </Button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
