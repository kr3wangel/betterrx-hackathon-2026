import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { expectOwn } from '../lib/expectedEvents'
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

export interface DemoLink {
  vendor_id: number
  name: string
  portal_link: string
}

export interface Stop {
  label: string
  to?: string
  external?: boolean
  portalVendorId?: number
}

interface Scenario {
  n: string
  seed: string
  name: string
  stops: Stop[]
}

const SCENARIOS: Scenario[] = [
  {
    n: '1',
    seed: 'scenario1',
    name: 'Scenario 1 — the case worker’s save',
    stops: [
      { label: 'Board — Margaret Osei in Needs you; open the row, then Swap vendor', to: '/hospice' },
      {
        label: 'Vendor phone — the new vendor’s thread; tap the magic link, then Confirm',
        to: '/vendor-phone',
        external: true,
      },
      {
        label: 'Driver — switch the picker to the new vendor, then Start → Complete delivery, sign',
        to: '/driver',
      },
    ],
  },
  {
    n: '2',
    seed: 'scenario2',
    name: 'Scenario 2 — the nurse in the home',
    stops: [
      { label: 'Nurse — Ruth Nakamura → Passed away → Confirm, with care', to: '/nurse' },
      { label: 'Board — the two pickups arrive as one grouped row', to: '/hospice' },
      {
        label: 'Vendor phone — Wasatch’s thread; type the digit the text itself names',
        to: '/vendor-phone',
        external: true,
      },
      { label: 'Driver — the two PICK UP cards → Complete pickup, sign', to: '/driver' },
      {
        label: 'Caregiver phone — the family’s sentence (optional)',
        to: '/caregiver',
        external: true,
      },
    ],
  },
  {
    n: '3',
    seed: 'scenario3',
    name: 'Scenario 3 — the cold-start vendor',
    stops: [
      { label: 'Board — open Frank Delgado’s row (#1060, the vendor with no history)', to: '/hospice' },
      { label: 'Vendor phone — Timpanogos’ thread, one outbound text', to: '/vendor-phone', external: true },
      { label: 'Timpanogos portal — Confirm', portalVendorId: 4 },
      { label: 'Vendor phone — Beehive’s thread, the nag that fires on its own', to: '/vendor-phone', external: true },
      { label: 'Board — Eleanor Vance jumps into Needs you; open the row for the red sentence', to: '/hospice' },
      { label: 'Reports — the directing nurse’s screen (the reporting beat that follows)', to: '/reports' },
    ],
  },
]

export function useDemoLinks() {
  const [links, setLinks] = useState<DemoLink[]>([])

  useEffect(() => {
    api
      .get<DemoLink[]>('/api/demo/links')
      .then(setLinks)
      .catch(() => setLinks([]))
  }, [])

  return links
}

export default function Demo() {
  const { data: patients } = useLive(() => api.get<Patient[]>('/api/patients'))
  const { data: orders } = useLive(() => api.get<Order[]>('/api/orders'))
  const links = useDemoLinks()

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

      <DemoFlows links={links} />

      <EmrFeed patients={patients ?? []} />
      <TemplateSend orders={orders ?? []} patients={patients ?? []} />
    </div>
  )
}

function DemoFlows({ links }: { links: DemoLink[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
          Demo flows
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every stop in the script, in order. In-app stops open here; phones and vendor portals
          open in a new tab.
        </p>
      </div>

      <DemoSeedBlock />

      {SCENARIOS.map((s) => (
        <ScenarioCard key={s.seed} scenario={s} links={links} />
      ))}

      <VendorRail links={links} />
    </section>
  )
}

function ScenarioCard({ scenario, links }: { scenario: Scenario; links: DemoLink[] }) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <CardTitle>{scenario.name}</CardTitle>
        <Link
          to={`/demo/scenario/${scenario.n}`}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          Open scenario page <ArrowRight className="size-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-1.5">
          {scenario.stops.map((stop, i) => (
            <li key={stop.label} className="flex gap-2 text-sm">
              <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">
                {i + 1}.
              </span>
              <StopLink stop={stop} links={links} />
            </li>
          ))}
        </ol>

        {scenario.n === '3' && <StageSilence />}
      </CardContent>
    </Card>
  )
}

export const DEMO_SEED_COMMAND = 'npm run db:reset && npm run seed demo'

export function DemoSeedBlock({ fallbackSeed }: { fallbackSeed?: string }) {
  return (
    <div className="space-y-2">
      <SeedCommand command={DEMO_SEED_COMMAND} />
      <p className="text-xs text-muted-foreground">
        One seed for the whole demo — all three scenarios are staged at once, on different
        patients, so nothing is reseeded between them. Scenario 3’s silence beat is the one
        exception: its clock starts when you tap “Stage the silence”.
      </p>
      <p className="text-xs text-muted-foreground">
        Fallback: isolated seeds, for rehearsing one scenario on its own —{' '}
        {fallbackSeed ? (
          <code className="font-mono">npm run db:reset &amp;&amp; npm run seed {fallbackSeed}</code>
        ) : (
          <>
            <code className="font-mono">npm run seed scenario1</code> ·{' '}
            <code className="font-mono">scenario2</code> ·{' '}
            <code className="font-mono">scenario3</code>
          </>
        )}
        .
      </p>
    </div>
  )
}

export function StageSilence() {
  const [staging, setStaging] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function stage() {
    setStaging(true)
    try {
      const order = await api.post<Order>('/api/demo/stage/silence')
      setResult(`Staged #${order.id} — the watchdog nags within 30s, escalates the tick after`)
      toast.success('Eleanor’s order is staged', {
        description: 'The watchdog nags within 30s and escalates the tick after.',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('→ 409')) {
        setResult('Already staged — Eleanor already has an open order')
        toast.info('Already staged', { description: 'Eleanor already has an open order.' })
      } else {
        setResult(null)
        toast.error('Staging didn’t go through', { description: message || 'Try again in a moment.' })
      }
    } finally {
      setStaging(false)
    }
  }

  return (
    <div className="rounded-[10px] border border-border bg-muted/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-foreground">
          Stage the silence (Eleanor → Beehive)
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Tap as you start this scenario — it places her order backdated 5h, so the ladder runs
            live.
          </span>
        </p>
        <Button size="sm" variant="secondary" className="shrink-0" disabled={staging} onClick={stage}>
          {staging ? 'Staging…' : 'Stage'}
        </Button>
      </div>
      {result && <p className="mt-1.5 text-xs font-medium text-primary">{result}</p>}
    </div>
  )
}

export function SeedCommand({ command }: { command: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-muted/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <code className="min-w-0 truncate font-mono text-xs text-foreground">{command}</code>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0"
          onClick={() => {
            navigator.clipboard
              .writeText(command)
              .then(() => toast.success('Seed command copied'))
              .catch(() => toast.error('Copy it by hand', { description: command }))
          }}
        >
          Copy
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        …then hard-refresh every open tab. Seeding writes straight to SQLite and broadcasts nothing.
      </p>
    </div>
  )
}

export function StopLink({ stop, links }: { stop: Stop; links: DemoLink[] }) {
  const className = 'text-foreground underline-offset-4 hover:text-primary hover:underline'

  if (stop.to === undefined && stop.portalVendorId === undefined) {
    return <span className="text-foreground">{stop.label}</span>
  }

  if (stop.portalVendorId !== undefined) {
    const href = links.find((l) => l.vendor_id === stop.portalVendorId)?.portal_link
    if (!href) return <span className="text-muted-foreground">{stop.label}</span>
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {stop.label}
        <ExternalLink className="ml-1 inline size-3 align-[-1px] text-muted-foreground" />
      </a>
    )
  }

  if (stop.external) {
    return (
      <a href={stop.to} target="_blank" rel="noopener noreferrer" className={className}>
        {stop.label}
        <ExternalLink className="ml-1 inline size-3 align-[-1px] text-muted-foreground" />
      </a>
    )
  }

  return (
    <Link to={stop.to!} className={className}>
      {stop.label}
    </Link>
  )
}

function VendorRail({ links }: { links: DemoLink[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendor portals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The same magic links the vendors are texted — for when a link in a thread won’t open.
        </p>
        {links.length === 0 ? (
          <EmptyState title="No vendors seeded" description="Run the seed, then reload." className="py-8" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {links.map((l) => (
              <a
                key={l.vendor_id}
                href={l.portal_link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-[10px] border border-border bg-card px-3 py-2 text-sm transition-colors hover:border-primary"
              >
                <span className="min-w-0 truncate text-foreground">{l.name}</span>
                <ExternalLink className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EmrFeed({ patients }: { patients: Patient[] }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<number | null>(null)

  async function setStatus(patient: Patient, status: Exclude<PatientStatus, 'active'>) {
    if (busy !== null) return
    setBusy(patient.id)
    // Narrowed to the pickups this fires, so a vendor accepting inside the window still speaks.
    expectOwn([`patient:${patient.id}`], { types: ['pickup_triggered'] })
    try {
      const result = await api.post<PatientStatusResult>('/api/emr/patient-status', {
        patient_id: patient.id,
        status,
      })
      const pickups = result.pickups_triggered
      const count = pickups.length
      toast.success(
        `EMR says ${patient.name} is ${PATIENT_STATUS_LABEL[status].toLowerCase()}`,
        {
          description:
            count === 0
              ? 'No delivered equipment on file, so no pickup was triggered.'
              : `${count} pickup${count === 1 ? '' : 's'} triggered: order${count === 1 ? '' : 's'} ${pickups.map((id) => `#${id}`).join(', ')}.`,
          action:
            count > 0
              ? {
                  label: 'See the pickups',
                  onClick: () =>
                    navigate('/driver', { state: { highlight: { orderIds: pickups, at: Date.now() } } }),
                }
              : undefined,
        },
      )
    } catch (err) {
      toast.error('The EMR feed didn’t go through', {
        description: err instanceof Error ? err.message : 'Try again in a moment.',
      })
    } finally {
      setBusy(null)
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
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => setStatus(p, 'discharged')}
                    >
                      Discharged
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy !== null}
                      onClick={() => setStatus(p, 'deceased')}
                    >
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
