import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useLive } from '../lib/useLive'
import { OrderCard } from '../components/OrderCard'
import { Bubble, Linkify } from '../components/PhoneScreen'
import { PersonaHeader } from '@/components/PersonaHeader'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { intentLabel, REVIEW_STATUS_LABEL } from '../lib/domain'
import type { Message, Order, Patient, Vendor } from '../../../shared/types'

const SELECT_CLASS =
  'h-11 rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background'

export default function VendorPage() {
  const [vendorId, setVendorId] = useState(1)
  const { data: vendors } = useLive(() => api.get<Vendor[]>('/api/vendors'))
  const { data: orders } = useLive(() => api.get<Order[]>('/api/orders'))
  const { data: patients } = useLive(() => api.get<Patient[]>('/api/patients'))
  const { data: messages } = useLive(() => api.get<Message[]>(`/api/messages?vendor_id=${vendorId}`), [vendorId])

  const patientName = useMemo(() => new Map((patients ?? []).map((p) => [p.id, p.name])), [patients])
  const vendor = vendors?.find((v) => v.id === vendorId) ?? vendors?.[0]
  const mine = orders
    ? orders.filter((o) => o.vendor_id === (vendor?.id ?? vendorId) && !['picked_up', 'cancelled'].includes(o.state))
    : null

  return (
    <div className="space-y-5">
      <PersonaHeader persona="Dispatcher" title="Dispatcher board" />

      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="vendor-picker">
          Vendor
        </label>
        <select
          id="vendor-picker"
          className={SELECT_CLASS}
          value={vendor?.id ?? vendorId}
          onChange={(e) => setVendorId(Number(e.target.value))}
        >
          {(vendors ?? []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        {vendor && (
          <span className="text-sm text-muted-foreground">
            {vendor.service_area} · {vendor.phone}
          </span>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">
              {mine ? `Open orders (${mine.length})` : 'Open orders'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {!mine ? (
              <>
                <Skeleton className="h-24 rounded-2xl" />
                <Skeleton className="h-24 rounded-2xl" />
              </>
            ) : mine.length === 0 ? (
              <EmptyState
                title="No open orders"
                description="Everything this vendor was sent is delivered or picked up."
                className="py-10"
              />
            ) : (
              mine.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  patientName={patientName.get(o.patient_id)}
                  vendorName={vendor?.name}
                />
              ))
            )}
          </CardContent>
        </Card>

        <PhoneSimulator vendorId={vendor?.id ?? vendorId} vendorName={vendor?.name ?? ''} messages={messages} />
      </div>
    </div>
  )
}

function PhoneSimulator({
  vendorId,
  vendorName,
  messages,
}: {
  vendorId: number
  vendorName: string
  messages: Message[] | null
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages?.length])

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-base text-muted-foreground">
          {vendorName ? `${vendorName}'s phone — reply as the vendor` : 'Vendor phone'}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="max-h-96 flex-1 space-y-2 overflow-y-auto">
          {!messages ? (
            <>
              <Skeleton className="h-10 rounded-2xl" />
              <Skeleton className="h-10 rounded-2xl" />
            </>
          ) : messages.length === 0 ? (
            <EmptyState
              title="No messages yet"
              description="Place an order on the hospice board and the request lands here."
              className="py-10"
            />
          ) : (
            messages.map((m) => (
              <Bubble
                key={m.id}
                side={m.direction === 'in' ? 'sent' : 'received'}
                meta={
                  m.direction === 'in' &&
                  m.parsed && (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {intentLabel(m.parsed.intent)} · {Math.round((m.parsed.confidence ?? 0) * 100)}%
                      {m.review_status && (
                        <Badge variant={m.review_status === 'auto_applied' ? 'success' : 'muted'}>
                          {REVIEW_STATUS_LABEL[m.review_status]}
                        </Badge>
                      )}
                    </span>
                  )
                }
              >
                <Linkify text={m.body} />
              </Bubble>
            ))
          )}
          <div ref={endRef} />
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
            } catch {
              // The parse result lands as a bubble badge here; only the failure needs saying.
              toast.error("That didn't go through — give it another tap.")
            } finally {
              setSending(false)
            }
          }}
        >
          <label className="sr-only" htmlFor="vendor-reply">
            Reply as the vendor
          </label>
          <Input
            id="vendor-reply"
            placeholder='e.g. "yes, bed will be there thursday by 10am"'
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button type="submit" disabled={sending || !draft.trim()}>
            {sending ? 'Parsing…' : 'Send'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
