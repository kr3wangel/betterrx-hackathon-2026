import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useLive } from '../lib/useLive'
import { Badge, Button, Card } from '../components/ui'
import { OrderCard } from '../components/OrderCard'
import { PersonaHeader } from '@/components/PersonaHeader'
import { intentLabel, REVIEW_STATUS_LABEL } from '../lib/domain'
import type { Message, Order, Patient, Vendor } from '../../../shared/types'

export default function VendorPage() {
  const [vendorId, setVendorId] = useState(1)
  const { data: vendors } = useLive(() => api.get<Vendor[]>('/api/vendors'))
  const { data: orders } = useLive(() => api.get<Order[]>('/api/orders'))
  const { data: patients } = useLive(() => api.get<Patient[]>('/api/patients'))
  const { data: messages } = useLive(() => api.get<Message[]>(`/api/messages?vendor_id=${vendorId}`))

  const patientName = useMemo(() => new Map((patients ?? []).map((p) => [p.id, p.name])), [patients])
  const vendor = vendors?.find((v) => v.id === vendorId)
  const mine = (orders ?? []).filter((o) => o.vendor_id === vendorId && !['picked_up', 'cancelled'].includes(o.state))

  return (
    <div className="space-y-4">
      <PersonaHeader persona="Dispatcher" title="Vendor phone" />
      <div className="flex items-center gap-3">
        <select
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          value={vendorId}
          onChange={(e) => setVendorId(Number(e.target.value))}
        >
          {(vendors ?? []).map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        {vendor && <span className="text-sm text-slate-500">{vendor.service_area} · {vendor.phone}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Open orders (${mine.length})`}>
          <div className="space-y-2">
            {mine.map((o) => (
              <OrderCard key={o.id} order={o} patientName={patientName.get(o.patient_id)} vendorName={vendor?.name} />
            ))}
            {mine.length === 0 && <div className="text-xs text-slate-400">No open orders.</div>}
          </div>
        </Card>

        <PhoneSimulator vendorId={vendorId} vendorName={vendor?.name ?? ''} messages={messages ?? []} />
      </div>
    </div>
  )
}

function PhoneSimulator({ vendorId, vendorName, messages }: { vendorId: number; vendorName: string; messages: Message[] }) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  return (
    <Card title={`${vendorName}'s phone — reply as the vendor`} className="flex flex-col">
      <div className="max-h-96 flex-1 space-y-2 overflow-y-auto">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.direction === 'in' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.direction === 'in' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'
              }`}
            >
              {m.body}
              {m.direction === 'in' && m.parsed && (
                <div className="mt-1 text-[10px] opacity-80">
                  → {intentLabel(m.parsed.intent)} · {Math.round((m.parsed.confidence ?? 0) * 100)}% ·{' '}
                  <Badge tone={m.review_status === 'auto_applied' ? 'green' : m.review_status === 'needs_review' ? 'yellow' : 'gray'}>
                    {m.review_status ? REVIEW_STATUS_LABEL[m.review_status] : '—'}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        ))}
        {messages.length === 0 && <div className="text-xs text-slate-400">No messages yet.</div>}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!draft.trim()) return
          setSending(true)
          try {
            await api.post('/api/messages/inbound', { vendor_id: vendorId, body: draft.trim() })
            setDraft('')
          } finally {
            setSending(false)
          }
        }}
      >
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          placeholder='e.g. "yes, bed will be there thursday by 10am"'
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" disabled={sending}>
          {sending ? 'Parsing…' : 'Send'}
        </Button>
      </form>
    </Card>
  )
}
