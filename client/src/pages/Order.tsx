import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { CATALOG, BED_CODE } from '../lib/domain'
import type { CatalogItem } from '../lib/domain'
import type { Order, Patient, Urgency, Vendor } from '../../../shared/types'
import { PersonaHeader } from '@/components/PersonaHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import type { ComboboxOption } from '@/components/ui/combobox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type VendorWithStats = Vendor & { avg_on_time_rate: number | null }

const URGENCY_OPTIONS: { value: Urgency; label: string }[] = [
  { value: 'stat', label: 'STAT' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'routine', label: 'Routine' },
]

/** Plain-English one-liner about what each urgency promises, shown under the segmented control. */
const URGENCY_NOTE: Record<Urgency, string> = {
  stat: 'Same day — we’ll push the vendor hard and flag it the second it slips.',
  urgent: 'Same day where possible. Watched closely against its deadline.',
  routine: 'Within about a day. Still tracked end-to-end, no calls needed.',
}

/** The four demo-scenario items lead the equipment list; the bed defaults first. */
const DEFAULT_CODE = BED_CODE

export default function Order() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<Patient[]>([])
  const [vendors, setVendors] = useState<VendorWithStats[]>([])
  const [loadError, setLoadError] = useState(false)

  const [patientId, setPatientId] = useState('')
  const [hcpcs, setHcpcs] = useState(DEFAULT_CODE)
  const [quantity, setQuantity] = useState('1')
  const [urgency, setUrgency] = useState<Urgency>('urgent')
  const [neededBy, setNeededBy] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [submitting, setSubmitting] = useState(false)

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

  const activePatients = useMemo(
    () => patients.filter((p) => p.status === 'active'),
    [patients],
  )
  const patientOptions = useMemo<ComboboxOption[]>(
    () => activePatients.map((p) => ({ value: String(p.id), label: p.name, hint: p.market })),
    [activePatients],
  )
  const vendorOptions = useMemo<ComboboxOption[]>(
    () =>
      vendors.map((v) => ({
        value: String(v.id),
        label: v.name,
        hint: <OnTime rate={v.avg_on_time_rate} />,
      })),
    [vendors],
  )
  const item = useMemo<CatalogItem | undefined>(
    () => CATALOG.find((c) => c.hcpcs_code === hcpcs),
    [hcpcs],
  )
  const patient = useMemo(
    () => patients.find((p) => String(p.id) === patientId),
    [patients, patientId],
  )
  const vendor = useMemo(
    () => vendors.find((v) => String(v.id) === vendorId),
    [vendors, vendorId],
  )

  const canSubmit = patientId !== '' && vendorId !== '' && !!item && !submitting

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || !item) return
    setSubmitting(true)
    try {
      const order = await api.post<Order>('/api/orders', {
        patient_id: Number(patientId),
        vendor_id: Number(vendorId),
        hcpcs_code: item.hcpcs_code,
        equipment_name: item.equipment_name,
        quantity: Number(quantity) || 1,
        urgency,
        target_at: neededBy ? new Date(neededBy).toISOString() : null,
      })
      toast.success('Order placed — vendor texted', {
        description: `${item.equipment_name} for ${patient?.name ?? 'the patient'} is on the board.`,
        action: { label: 'View board', onClick: () => navigate('/hospice') },
      })
      // Reset for the next admission, keeping equipment/urgency defaults.
      setPatientId('')
      setQuantity('1')
      setNeededBy('')
      setVendorId('')
      void order
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
      <PersonaHeader
        persona="Admissions Nurse"
        title="Place an order"
        description="Phone or desktop, finishable in under a minute. We text the vendor the moment you place it."
      />

      {loadError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Couldn’t load patients and vendors. Refresh to try again.
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={submit} className="grid gap-9 lg:grid-cols-[1fr_300px]">
          <div className="space-y-7">
            <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
              New DME order
            </div>
            <h2 className="-mt-3 font-display text-2xl font-extrabold tracking-tight">
              What does the patient need?
            </h2>

            <Field label="Patient" htmlFor="order-patient">
              <Combobox
                id="order-patient"
                options={patientOptions}
                value={patientId}
                onValueChange={setPatientId}
                placeholder="Type a patient’s name…"
                emptyMessage="No one matches"
                clearLabel="Clear patient"
              />
            </Field>

            <Field label="Equipment">
              <Select value={hcpcs} onValueChange={setHcpcs}>
                <SelectTrigger>
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
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Quantity">
                <Input
                  type="number"
                  min={1}
                  className="tabular-nums"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </Field>
              <Field label="Needed by">
                <Input
                  type="datetime-local"
                  value={neededBy}
                  onChange={(e) => setNeededBy(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Urgency" note={URGENCY_NOTE[urgency]}>
              <div className="flex gap-2">
                {URGENCY_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setUrgency(o.value)}
                    aria-pressed={urgency === o.value}
                    className={cn(
                      'h-11 flex-1 rounded-md border text-sm font-semibold transition-colors',
                      urgency === o.value
                        ? o.value === 'stat'
                          ? 'border-transparent bg-destructive text-destructive-foreground'
                          : 'border-transparent bg-secondary text-secondary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Vendor" htmlFor="order-vendor">
              <Combobox
                id="order-vendor"
                options={vendorOptions}
                value={vendorId}
                onValueChange={setVendorId}
                placeholder="Type a vendor’s name…"
                emptyMessage="No vendor matches"
                clearLabel="Clear vendor"
              />
            </Field>

            <div className="pt-1">
              <Button type="submit" size="lg" disabled={!canSubmit}>
                {submitting ? 'Placing…' : 'Place order'}
              </Button>
            </div>
          </div>

          <WhyItMatters patient={patient} item={item} vendor={vendor} neededBy={neededBy} />
        </form>
      )}
    </div>
  )
}

function Field({
  label,
  note,
  htmlFor,
  children,
}: {
  label: string
  note?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  const caption = (
    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
      {label}
    </span>
  )
  const body = (
    <>
      {htmlFor ? <label htmlFor={htmlFor}>{caption}</label> : caption}
      {children}
      {note && <span className="mt-2 block text-xs text-muted-foreground">{note}</span>}
    </>
  )
  return htmlFor ? <div className="block">{body}</div> : <label className="block">{body}</label>
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

/** The context rail — plain-English stakes so the nurse knows why this order gets watched. */
function WhyItMatters({
  patient,
  item,
  vendor,
  neededBy,
}: {
  patient?: Patient
  item?: CatalogItem
  vendor?: VendorWithStats
  neededBy: string
}) {
  const when = neededBy
    ? new Date(neededBy).toLocaleString(undefined, {
        weekday: 'long',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null

  return (
    <aside className="h-fit rounded-2xl border border-[#f3ddd2] bg-coral-tint p-5 lg:sticky lg:top-6">
      <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
        Why it matters
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-[#8a4a2e]">
        {patient ? <b className="text-foreground">{patient.name}</b> : 'This patient'} needs{' '}
        {item ? <b className="text-foreground">{item.equipment_name.toLowerCase()}</b> : 'equipment'}
        {when ? (
          <>
            {' '}
            by <b className="text-foreground">{when}</b>
          </>
        ) : (
          ''
        )}
        . We’ll text {vendor ? <b className="text-foreground">{vendor.name}</b> : 'the vendor'} the
        moment you place this and flag it the second it’s at risk — you won’t have to call to check.
      </p>
      {item?.rental && (
        <p className="mt-3 text-xs text-muted-foreground">
          This is rented equipment, so a late pickup later costs money — we track it all the way to
          return.
        </p>
      )}
    </aside>
  )
}
