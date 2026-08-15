import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useLive } from '../lib/useLive'
import { STATE_LABEL } from '../lib/domain'
import type { MessageTemplate, Order, Patient, PatientStatus } from '../../../shared/types'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface PatientStatusResult {
  patient_id: number
  status: PatientStatus
  pickups_triggered: number[]
}

const PATIENT_STATUS_LABEL: Record<PatientStatus, string> = {
  active: 'Active',
  discharged: 'Discharged',
  deceased: 'Deceased',
}

const TEMPLATES: { value: MessageTemplate; label: string }[] = [
  { value: 'v_order_request', label: 'Vendor — new order, can you fill it?' },
  { value: 'v_ack_nag', label: 'Vendor — nudge for an answer' },
  { value: 'v_eta_check', label: 'Vendor — still on time?' },
  { value: 'v_pickup_request', label: 'Vendor — please collect the equipment' },
  { value: 'f_eta_notice', label: 'Family — delivery is on the way' },
  { value: 'f_delivery_confirm', label: 'Family — did it arrive?' },
  { value: 'f_delivered_thanks', label: 'Family — delivered, thank you' },
  { value: 'f_condition_check', label: 'Family — how is the equipment? (1–5)' },
  { value: 'f_pickup_notice', label: 'Family — pickup is scheduled' },
  { value: 'f_picked_up_thanks', label: 'Family — picked up, thank you' },
]

export default function Demo() {
  const { data: patients } = useLive(() => api.get<Patient[]>('/api/patients'))
  const { data: orders } = useLive(() => api.get<Order[]>('/api/orders'))

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Demo controls
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Presenter tools — simulates the EMR and vendor systems.
        </p>
      </div>

      <EmrFeed patients={patients ?? []} />
      <TemplateSend orders={orders ?? []} patients={patients ?? []} />
    </div>
  )
}

function EmrFeed({ patients }: { patients: Patient[] }) {
  async function setStatus(patient: Patient, status: Exclude<PatientStatus, 'active'>) {
    try {
      const result = await api.post<PatientStatusResult>('/api/emr/patient-status', {
        patient_id: patient.id,
        status,
      })
      const count = result.pickups_triggered.length
      toast.success(
        `EMR says ${patient.name} is ${PATIENT_STATUS_LABEL[status].toLowerCase()}`,
        {
          description:
            count === 0
              ? 'No delivered equipment on file, so no pickup was triggered.'
              : `${count} pickup${count === 1 ? '' : 's'} triggered: order${count === 1 ? '' : 's'} ${result.pickups_triggered.map((id) => `#${id}`).join(', ')}.`,
        },
      )
    } catch (err) {
      toast.error('The EMR feed didn’t go through', {
        description: err instanceof Error ? err.message : 'Try again in a moment.',
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>EMR feed (fallback path)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The nurse tapping on the Nurse surface is the primary trigger. This stands in for the
          hospice EMR sending the same news on its own — the redundant path, so a pickup still
          happens if nobody taps.
        </p>
        {patients.length === 0 ? (
          <EmptyState title="No patients seeded" description="Run the seed, then reload." className="py-8" />
        ) : (
          <div className="divide-y divide-border">
            {patients.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-foreground">{p.name}</span>
                  <Badge variant={p.status === 'active' ? 'success' : 'muted'}>
                    {PATIENT_STATUS_LABEL[p.status]}
                  </Badge>
                </span>
                {p.status === 'active' && (
                  <span className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setStatus(p, 'discharged')}>
                      Discharged
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setStatus(p, 'deceased')}>
                      Passed away
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

function TemplateSend({ orders, patients }: { orders: Order[]; patients: Patient[] }) {
  const [orderId, setOrderId] = useState('')
  const [template, setTemplate] = useState<MessageTemplate | ''>('')
  const [sending, setSending] = useState(false)

  const patientName = useMemo(() => new Map(patients.map((p) => [p.id, p.name])), [patients])
  const sendable = useMemo(() => orders.filter((o) => o.state !== 'cancelled'), [orders])

  async function send() {
    if (!orderId || !template) return
    setSending(true)
    try {
      const result = await api.post<{ message_id: number; body: string }>('/api/messages/send', {
        order_id: Number(orderId),
        template,
      })
      toast.success(`Text sent on order #${orderId}`, { description: result.body })
    } catch (err) {
      toast.error('That text was refused', {
        description: err instanceof Error ? err.message : 'Try again in a moment.',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send a text by hand</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Fires any of the standard texts at an order, the same way the system fires them on its
          own. Household texts still respect the opt-out and timing rules — a refusal shows here.
        </p>
        {sendable.length === 0 ? (
          <EmptyState title="No orders to text about" description="Run the seed, then reload." className="py-8" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Select value={orderId} onValueChange={setOrderId}>
              <SelectTrigger>
                <SelectValue placeholder="Which order?" />
              </SelectTrigger>
              <SelectContent>
                {sendable.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    #{o.id} {o.equipment_name} · {patientName.get(o.patient_id) ?? 'Unknown'} ·{' '}
                    {STATE_LABEL[o.state]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={template} onValueChange={(v) => setTemplate(v as MessageTemplate)}>
              <SelectTrigger>
                <SelectValue placeholder="Which text?" />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={send} disabled={!orderId || !template || sending}>
              Send
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
