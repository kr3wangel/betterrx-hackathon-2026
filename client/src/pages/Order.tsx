import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { expectOwn } from '../lib/expectedEvents'
import { CATALOG, BED_CODE } from '../lib/domain'
import type { CatalogItem } from '../lib/domain'
import type { Order, Patient, Urgency, Vendor } from '../../../shared/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { cn } from '@/lib/utils'

type VendorWithStats = Vendor & { avg_on_time_rate: number | null }

// The three urgency tiers, each with a real delivery window. STAT is a distinct, tighter
// promise than Urgent — picking a tier fills "Needed by" with now + these hours.
const URGENCY_OPTIONS: { value: Urgency; label: string; window: string; hours: number }[] = [
  { value: 'stat', label: 'STAT', window: 'within 4 hours', hours: 4 },
  { value: 'urgent', label: 'Urgent', window: 'same day · ~8h', hours: 8 },
  { value: 'routine', label: 'Routine', window: 'next day · ~24h', hours: 24 },
]
const URGENCY_HOURS: Record<Urgency, number> = { stat: 4, urgent: 8, routine: 24 }

/** How each tier is watched once placed — the honest promise behind the window. */
const URGENCY_TAIL: Record<Urgency, string> = {
  stat: 'We’ll push the vendor hard and flag it the second it slips.',
  urgent: 'Watched closely against its deadline — no calls needed.',
  routine: 'Tracked end-to-end. You’ll only hear about it if it slips.',
}

const DEFAULT_CODE = BED_CODE
const DEFAULT_URGENCY: Urgency = 'urgent'

/** Format a Date for a <input type="datetime-local"> value (local time, minute precision). */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function deadlineFrom(urgency: Urgency): string {
  return toLocalInput(new Date(Date.now() + URGENCY_HOURS[urgency] * 3_600_000))
}
function formatWhen(d: Date): string {
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function Order() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<Patient[]>([])
  const [vendors, setVendors] = useState<VendorWithStats[]>([])
  const [loadError, setLoadError] = useState(false)

  const [patientId, setPatientId] = useState('')
  // One placement can carry many items — an admission is a bundle (bed + oxygen + walker),
  // and the vendor gets ONE text for the lot. Each row is an order; the batching is in the asking.
  const [items, setItems] = useState<{ hcpcs: string; quantity: string }[]>([
    { hcpcs: DEFAULT_CODE, quantity: '1' },
  ])
  const [urgency, setUrgency] = useState<Urgency>(DEFAULT_URGENCY)
  // Seeded from the default urgency so the deadline is never blank; a tier click or a manual
  // edit both flow through here, so the field and the urgency always agree.
  const [neededBy, setNeededBy] = useState(() => deadlineFrom(DEFAULT_URGENCY))
  const [vendorId, setVendorId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // The rolodex rung: add a vendor we already know by phone. They join scoped to the
  // chosen patient's market; their first order text is their invite.
  const [addingVendor, setAddingVendor] = useState(false)
  const [newVendorName, setNewVendorName] = useState('')
  const [newVendorPhone, setNewVendorPhone] = useState('')
  const [newVendorAreas, setNewVendorAreas] = useState<string[]>([])
  const [savingVendor, setSavingVendor] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get<Patient[]>('/api/patients'),
      api.get<VendorWithStats[]>('/api/vendors'),
    ])
      .then(([p, v]) => {
        setPatients(p)
        setVendors(v)
      })
      .catch(() => setLoadError(true))
  }, [])

  const activePatients = useMemo(() => patients.filter((p) => p.status === 'active'), [patients])
  const markets = useMemo(() => [...new Set(patients.map((p) => p.market))].sort(), [patients])
  const catalogItems = useMemo<(CatalogItem | undefined)[]>(
    () => items.map((row) => CATALOG.find((c) => c.hcpcs_code === row.hcpcs)),
    [items],
  )
  const chosenItems = catalogItems.filter((c): c is CatalogItem => !!c)
  const patient = useMemo(() => patients.find((p) => String(p.id) === patientId), [patients, patientId])

  // Only vendors that cover the patient's market, best on-time first. Before a patient is
  // chosen we can't scope, so show them all.
  const coveringVendors = useMemo(() => {
    const list = patient ? vendors.filter((v) => v.service_area.includes(patient.market)) : vendors
    return [...list].sort((a, b) => (b.avg_on_time_rate ?? 0) - (a.avg_on_time_rate ?? 0))
  }, [vendors, patient])
  const vendor = useMemo(() => vendors.find((v) => String(v.id) === vendorId), [vendors, vendorId])

  // Drop a chosen vendor that no longer covers the patient's market after a patient change.
  useEffect(() => {
    if (vendorId && !coveringVendors.some((v) => String(v.id) === vendorId)) setVendorId('')
  }, [coveringVendors, vendorId])

  function chooseUrgency(u: Urgency) {
    setUrgency(u)
    setNeededBy(deadlineFrom(u))
  }

  const canSubmit =
    patientId !== '' && vendorId !== '' && items.length > 0 && catalogItems.every(Boolean) && !submitting

  function setItemRow(index: number, patch: Partial<{ hcpcs: string; quantity: string }>) {
    setItems((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function addVendor() {
    const name = newVendorName.trim()
    const phone = newVendorPhone.trim()
    if (!name || !phone || savingVendor) return
    setSavingVendor(true)
    try {
      // The patient's market is always included — a new vendor that doesn't cover it would
      // vanish from the market-filtered picker the moment it was added.
      const created = await api.post<VendorWithStats & { existed?: boolean }>('/api/vendors', {
        name,
        phone,
        service_area: [...new Set([patient?.market ?? '', ...newVendorAreas])].filter(Boolean).join(', '),
      })
      setVendors((prev) => (prev.some((v) => v.id === created.id) ? prev : [...prev, created]))
      setVendorId(String(created.id))
      setAddingVendor(false)
      setNewVendorName('')
      setNewVendorPhone('')
      setNewVendorAreas([])
      toast.success(created.existed ? 'Already on file — selected' : `${created.name} added`, {
        description: created.existed
          ? 'That phone number belongs to a vendor you already work with.'
          : 'Their first text — with their portal link — goes out when you place this order.',
      })
    } catch {
      toast.error('Couldn’t add the vendor', { description: 'Something went wrong reaching the server. Try again.' })
    } finally {
      setSavingVendor(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    // The order id only comes back in the response, so the suppression key is the patient.
    expectOwn([`patient:${Number(patientId)}`])
    try {
      const created = await api.post<Order | { orders: Order[] }>('/api/orders', {
        patient_id: Number(patientId),
        vendor_id: Number(vendorId),
        urgency,
        target_at: neededBy ? new Date(neededBy).toISOString() : null,
        items: items.map((row, i) => ({
          hcpcs_code: catalogItems[i]!.hcpcs_code,
          equipment_name: catalogItems[i]!.equipment_name,
          quantity: Number(row.quantity) || 1,
        })),
      })
      const orders = 'orders' in created ? created.orders : [created]
      toast.success(
        orders.length === 1 ? 'Order placed — vendor texted' : `Order placed — ${orders.length} items, one text`,
        {
          description:
            orders.length === 1
              ? `${chosenItems[0]?.equipment_name ?? 'The equipment'} for ${patient?.name ?? 'the patient'} is on the board.`
              : `Everything for ${patient?.name ?? 'the patient'} is on the board — the vendor answers one question for the whole bundle.`,
          action: { label: 'Place another', onClick: () => navigate('/order') },
        },
      )
      // Reset for the next admission, keeping equipment/urgency and re-seeding the deadline.
      setPatientId('')
      setItems((prev) => prev.map((row) => ({ ...row, quantity: '1' })))
      setVendorId('')
      setNeededBy(deadlineFrom(urgency))
      navigate('/hospice', { state: { highlight: { orderIds: orders.map((o) => o.id), at: Date.now() } } })
    } catch {
      toast.error('Couldn’t place the order', {
        description: 'Something went wrong reaching the server. Try again.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">Place an order</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          New equipment for a patient. The vendor is texted the moment you place it.
        </p>
      </div>

      {loadError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Couldn’t load patients and vendors. Refresh to try again.
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={submit} className="grid gap-9 lg:grid-cols-[1fr_300px]">
          <div className="space-y-7">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
                Durable medical equipment
              </div>
              <h2 className="mt-0.5 font-display text-2xl font-extrabold tracking-tight">
                What does the patient need?
              </h2>
            </div>

            <Field label="Patient" htmlFor="order-patient">
              <Combobox
                id="order-patient"
                options={activePatients.map((p) => ({
                  value: String(p.id),
                  label: p.name,
                  hint: <span className="text-faint">{p.market}</span>,
                }))}
                value={patientId}
                onValueChange={setPatientId}
                placeholder="Choose a patient…"
              />
            </Field>

            <Field
              label={items.length > 1 ? `Equipment · ${items.length} items, one text` : 'Equipment'}
              htmlFor="order-equipment"
            >
              <div className="space-y-2">
                {items.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select value={row.hcpcs} onValueChange={(v) => setItemRow(i, { hcpcs: v })}>
                      <SelectTrigger id={i === 0 ? 'order-equipment' : undefined} aria-label={`Item ${i + 1}`}>
                        <SelectValue placeholder="Choose equipment…" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATALOG.map((c) => (
                          <SelectItem key={c.hcpcs_code} value={c.hcpcs_code}>
                            {c.equipment_name}{' '}
                            <span className="tabular-nums text-faint">{c.hcpcs_code}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      aria-label={`Item ${i + 1} quantity`}
                      type="number"
                      min={1}
                      className="w-20 shrink-0 tabular-nums"
                      value={row.quantity}
                      onChange={(e) => setItemRow(i, { quantity: e.target.value })}
                    />
                    {items.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove item ${i + 1}`}
                        className="shrink-0 rounded-md px-2 py-1 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="text-xs font-semibold text-primary hover:underline"
                  onClick={() => setItems((prev) => [...prev, { hcpcs: DEFAULT_CODE, quantity: '1' }])}
                >
                  + Add another item — the vendor gets one text for the whole order.
                </button>
              </div>
            </Field>

            <Field label="Needed by" hint="set by urgency" htmlFor="order-needed-by">
              <Input
                id="order-needed-by"
                type="datetime-local"
                value={neededBy}
                onChange={(e) => setNeededBy(e.target.value)}
              />
            </Field>

            <Field label="Urgency" note={urgencyNote(urgency, neededBy)} captionId="order-urgency-label">
              <div className="flex gap-2" role="group" aria-labelledby="order-urgency-label">
                {URGENCY_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => chooseUrgency(o.value)}
                    aria-pressed={urgency === o.value}
                    className={cn(
                      'flex flex-1 flex-col items-center gap-0.5 rounded-md border py-2.5 transition-colors',
                      urgency === o.value
                        ? o.value === 'stat'
                          ? 'border-transparent bg-destructive text-destructive-foreground'
                          : 'border-transparent bg-secondary text-secondary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <span className="text-sm font-bold">{o.label}</span>
                    <span className="text-[11px] font-semibold tabular-nums opacity-85">{o.window}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Vendor" hint={patient ? `covering ${patient.market}` : undefined} htmlFor="order-vendor">
              <Combobox
                id="order-vendor"
                options={coveringVendors.map((v) => ({
                  value: String(v.id),
                  label: v.name,
                  hint: <OnTime rate={v.avg_on_time_rate} />,
                }))}
                value={vendorId}
                onValueChange={setVendorId}
                placeholder="Choose a vendor…"
                emptyMessage="No vendor matches"
              />
              {addingVendor && patient ? (
                <div className="mt-2 space-y-2.5 rounded-md border border-border bg-muted/40 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      aria-label="New vendor name"
                      placeholder="Vendor name"
                      value={newVendorName}
                      onChange={(e) => setNewVendorName(e.target.value)}
                    />
                    <Input
                      aria-label="New vendor phone"
                      type="tel"
                      placeholder="Phone (SMS)"
                      className="tabular-nums"
                      value={newVendorPhone}
                      onChange={(e) => setNewVendorPhone(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Service area">
                    <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      Serves
                    </span>
                    {markets.map((m) => {
                      const locked = m === patient.market
                      const on = locked || newVendorAreas.includes(m)
                      return (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={on}
                          disabled={locked}
                          title={locked ? `${patient.name} lives here — always included` : undefined}
                          onClick={() =>
                            setNewVendorAreas((prev) => (on ? prev.filter((a) => a !== m) : [...prev, m]))
                          }
                          className={cn(
                            'rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                            on
                              ? 'border-transparent bg-secondary text-secondary-foreground'
                              : 'border-border bg-card text-muted-foreground hover:bg-muted',
                            locked && 'cursor-default opacity-90',
                          )}
                        >
                          {m}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={addVendor}
                      disabled={!newVendorName.trim() || !newVendorPhone.trim() || savingVendor}
                    >
                      {savingVendor ? 'Adding…' : 'Add vendor'}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAddingVendor(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:text-faint disabled:no-underline"
                  onClick={() => setAddingVendor(true)}
                  disabled={!patient}
                  title={patient ? undefined : 'Choose a patient first — the vendor joins covering their area'}
                >
                  Not listed? Add a vendor by phone — no signup on their end, their first text does the rest.
                </button>
              )}
            </Field>

            <div className="flex justify-end pt-1">
              <Button type="submit" size="lg" disabled={!canSubmit}>
                {submitting ? 'Placing…' : 'Place order'}
              </Button>
            </div>
          </div>

          <ThisOrder patient={patient} items={chosenItems} vendor={vendor} neededBy={neededBy} />
        </form>
      )}
    </div>
  )
}

/** The urgency helper line: the concrete deadline it resolves to, plus how it's watched. */
function urgencyNote(urgency: Urgency, neededBy: string): string {
  const tail = URGENCY_TAIL[urgency]
  if (!neededBy) return tail
  const due = new Date(neededBy)
  const hoursOut = Math.round((due.getTime() - Date.now()) / 3_600_000)
  const out = hoursOut <= 0 ? 'in the past — double-check the time' : `about ${hoursOut} hours out`
  return `Needed by ${formatWhen(due)} — ${out}. ${tail}`
}

function Field({
  label,
  hint,
  note,
  htmlFor,
  captionId,
  children,
}: {
  label: string
  hint?: string
  note?: string
  htmlFor?: string
  captionId?: string
  children: React.ReactNode
}) {
  const caption = (
    <span
      id={captionId}
      className="mb-2 flex items-baseline justify-between text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
    >
      {label}
      {hint && <span className="font-medium normal-case tracking-normal text-faint">{hint}</span>}
    </span>
  )
  // Never wrap the children in the <label>: it would forward caption and note clicks to the first
  // labelable descendant — a combobox reopen, or on Urgency an actual STAT pick with a new deadline.
  return (
    <div className="block">
      {htmlFor ? <label htmlFor={htmlFor}>{caption}</label> : caption}
      {children}
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

/** Vendor on-time reads green when strong, coral when it needs a second look. */
function OnTime({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-faint">— no history yet</span>
  const pct = Math.round(rate * 100)
  return (
    <span className={cn('tabular-nums font-semibold', pct >= 85 ? 'text-success' : 'text-primary')}>
      {pct}% on-time
    </span>
  )
}

/** The context rail — the operational facts a nurse acts on, not a pitch for the product. */
function ThisOrder({
  patient,
  items,
  vendor,
  neededBy,
}: {
  patient?: Patient
  items: CatalogItem[]
  vendor?: VendorWithStats
  neededBy: string
}) {
  const due = neededBy ? new Date(neededBy) : null
  const hoursOut = due ? Math.round((due.getTime() - Date.now()) / 3_600_000) : null
  const pct = vendor && vendor.avg_on_time_rate != null ? Math.round(vendor.avg_on_time_rate * 100) : null

  return (
    <aside className="h-fit rounded-2xl border border-[#f3ddd2] bg-coral-tint p-5 lg:sticky lg:top-6">
      <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">This order</div>

      <Fact label="Delivering to">
        {patient ? (
          <>
            <b className="text-foreground">{patient.name}</b>
            <span className="block font-normal text-muted-foreground">
              {patient.address} · {patient.market}
            </span>
          </>
        ) : (
          <span className="font-normal text-muted-foreground">Choose a patient</span>
        )}
      </Fact>

      <Fact label="Needed by">
        {due ? (
          <>
            {formatWhen(due)}
            {hoursOut != null && (
              <span className="block font-normal text-muted-foreground">
                {hoursOut <= 0 ? 'in the past' : `about ${hoursOut} hours out`}
              </span>
            )}
          </>
        ) : (
          <span className="font-normal text-muted-foreground">—</span>
        )}
      </Fact>

      <Fact label="Vendor">
        {vendor ? (
          <>
            {vendor.name}
            <span className="block font-normal text-muted-foreground">
              Covers {vendor.service_area}
              {pct != null && (
                <>
                  {' · '}
                  <span className={pct >= 85 ? 'text-success' : 'text-primary'}>
                    {pct}% on-time{pct < 85 ? ' — watch this one' : ''}
                  </span>
                </>
              )}
            </span>
          </>
        ) : (
          <span className="font-normal text-muted-foreground">Choose a vendor</span>
        )}
      </Fact>

      {items.length > 1 && (
        <Fact label={`Items · ${items.length}`}>
          <span className="font-normal text-muted-foreground">
            {items.map((c) => c.equipment_name).join(' · ')}
          </span>
          <span className="block font-normal text-muted-foreground">
            One text to the vendor — one reply covers the whole bundle.
          </span>
        </Fact>
      )}

      {items.some((c) => c.rental) && (
        <p className="mt-3 border-t border-[#f3ddd2] pt-3 text-xs text-muted-foreground">
          Rented equipment — tracked through pickup and return, so a late return can’t cost the hospice.
        </p>
      )}
      {items
        .filter((c) => c.resupply_days)
        .map((c) => (
          <p key={c.hcpcs_code} className="mt-3 border-t border-[#f3ddd2] pt-3 text-xs text-muted-foreground">
            {c.equipment_name} is a consumable — the payer covers a refill every {c.resupply_days} days.
            Once it&rsquo;s delivered, the next order places itself when that window opens. Nobody has to remember.
          </p>
        ))}
    </aside>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3.5 border-t border-[#f3ddd2] pt-3 first:mt-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#b06a4a]">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{children}</div>
    </div>
  )
}
