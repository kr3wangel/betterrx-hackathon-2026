import { useCallback, useEffect, useMemo, useState } from 'react'
import { Camera, CheckCircle2, PackageCheck, Truck, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useLive, fmt } from '../lib/useLive'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { ConditionChecklist, ALL_ATTESTED, type ConditionState } from '@/components/ConditionChecklist'
import { SignaturePad } from '../components/SignaturePad'
import { PhotoInput } from '../components/PhotoInput'
import { PersonaHeader } from '@/components/PersonaHeader'
import { useHighlight } from '../lib/highlight'
import { useHighlightHandoff } from '../hooks/useHighlightHandoff'
import { expectOwn } from '../lib/expectedEvents'
import { STATE_STATUS_TONE, SPINE_CLASS } from '../lib/domain'
import type { Order, OrderEvent, Patient, Pod, PodKind, Vendor } from '../../../shared/types'

interface CompletedJob {
  order: Order
  kind: PodKind
  patientName: string
  pod?: Pod
  familyText: string | null
}

// The states GET /api/driver/jobs hands back — mirrored here only to pick a sane opening vendor.
const DRIVER_STATES: Order['state'][] = ['dispatched', 'in_transit', 'pickup_pending', 'pickup_overdue']

export default function Driver() {
  const [vendorId, setVendorId] = useState<number | null>(null)
  const [completed, setCompleted] = useState<CompletedJob | null>(null)
  const { data: vendors, failed: vendorsFailed, reload: reloadVendors } = useLive(() => api.get<Vendor[]>('/api/vendors'))
  const { data: allOrders, failed: ordersFailed, reload: reloadOrders } = useLive(() => api.get<Order[]>('/api/orders'))
  const { data: jobs, failed: jobsFailed, reload: reloadJobs } = useLive(
    () =>
      vendorId === null
        ? Promise.resolve<Order[]>([])
        : api.get<Order[]>(`/api/driver/jobs?vendor_id=${vendorId}`),
    [vendorId],
  )
  const { data: patients } = useLive(() => api.get<Patient[]>('/api/patients'))
  const [handoffIds, setHandoffIds] = useState<number[]>([])

  useHighlightHandoff(useCallback((ids: number[]) => setHandoffIds(ids), []))

  // A handoff names the orders it wants shown, so it picks the route. Otherwise open on a
  // vendor that has work, settled once — finishing the last job must not slide the page
  // over to somebody else's route mid-demo.
  useEffect(() => {
    if (!allOrders || !vendors) return
    const wanted = handoffIds.length ? allOrders.find((o) => handoffIds.includes(o.id)) : undefined
    if (wanted) {
      setVendorId(wanted.vendor_id)
      setHandoffIds([])
      return
    }
    if (vendorId !== null) return
    setVendorId(allOrders.find((o) => DRIVER_STATES.includes(o.state))?.vendor_id ?? vendors[0]?.id ?? 1)
  }, [allOrders, vendors, vendorId, handoffIds])

  const patientById = useMemo(() => new Map((patients ?? []).map((p) => [p.id, p])), [patients])

  const failed = vendorsFailed || ordersFailed || jobsFailed
  const routeJobs = vendorId === null ? null : jobs

  const retry = () => {
    reloadVendors()
    reloadOrders()
    reloadJobs()
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <PersonaHeader
        persona="Driver"
        title="Today's route"
        description="Deliveries and pickups, in order. Snap a photo, grab a signature, done."
      />

      {failed && !vendors ? (
        <EmptyState
          icon={<Truck />}
          title="Couldn't load your route"
          description="We can't reach the server right now. Nothing is lost — try again in a moment."
          action={
            <Button variant="outline" className="rounded-xl" onClick={retry}>
              Try again
            </Button>
          }
        />
      ) : !vendors ? (
        <DriverSkeleton />
      ) : (
        <>
          {failed && (
            <div
              role="alert"
              className="rounded-[14px] bg-destructive/10 px-5 py-4 text-sm font-semibold text-destructive"
            >
              Can't reach the server — this route may be out of date. Still trying.
            </div>
          )}

          <Select
            value={vendorId != null ? String(vendorId) : undefined}
            onValueChange={(v) => setVendorId(Number(v))}
          >
            <SelectTrigger aria-label="Which vendor's route?" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={String(v.id)}>
                  {v.name} — driver view
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* A pickup can appear here on its own, over SSE, while nobody is looking at the screen. */}
          <p className="sr-only" aria-live="polite">
            {!routeJobs
              ? ''
              : routeJobs.length === 0
                ? 'No deliveries or pickups on your route.'
                : `${routeJobs.length} ${routeJobs.length === 1 ? 'stop' : 'stops'} on your route.`}
          </p>

          {completed && <JobCompleteCard completed={completed} onDismiss={() => setCompleted(null)} />}

          {!routeJobs ? (
            failed ? (
              <EmptyState
                icon={<Truck />}
                title="Couldn't load your stops"
                description="We can't reach the server right now. Nothing is lost — try again in a moment."
                action={
                  <Button variant="outline" className="rounded-xl" onClick={retry}>
                    Try again
                  </Button>
                }
              />
            ) : (
              <DriverSkeleton />
            )
          ) : routeJobs.length === 0 ? (
            <EmptyState
              icon={<Truck />}
              title="Route's clear"
              description="No deliveries or pickups assigned right now."
            />
          ) : (
            routeJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                patient={patientById.get(job.patient_id)}
                onComplete={setCompleted}
              />
            ))
          )}
        </>
      )}
    </div>
  )
}

function DriverSkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 2 }, (_, i) => (
        <Skeleton key={i} className="h-44 rounded-2xl" />
      ))}
    </div>
  )
}

function familyNotifiedText(events: OrderEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.type !== 'family_notified') continue
    const text = event.payload?.text
    if (typeof text === 'string') return text
  }
  return null
}

function JobCard({
  job,
  patient,
  onComplete,
}: {
  job: Order
  patient?: Patient
  onComplete: (completed: CompletedJob) => void
}) {
  const [capturing, setCapturing] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [condition, setCondition] = useState<ConditionState>(ALL_ATTESTED)
  const [submitting, setSubmitting] = useState(false)
  const [starting, setStarting] = useState(false)
  const isPickup = job.state === 'pickup_pending' || job.state === 'pickup_overdue'
  const { pulse, isPulsing } = useHighlight()
  const acked = isPulsing([job.id])

  async function startDelivery() {
    setStarting(true)
    expectOwn([`order:${job.id}`])
    try {
      await api.post(`/api/orders/${job.id}/events`, { type: 'out_for_delivery', actor: 'driver' })
      pulse(job.id)
      // Deliberately no reset on success: the card only swaps to "Complete delivery" once the SSE
      // refetch lands, and re-enabling before then lets a second tap 409 on an in-transit order.
    } catch {
      setStarting(false)
      toast.error("That didn't go through — give it another tap.")
    }
  }

  async function submitPod() {
    setSubmitting(true)
    const kind: PodKind = isPickup ? 'pickup' : 'delivery'
    expectOwn([`order:${job.id}`])
    try {
      await api.post(`/api/orders/${job.id}/pod`, {
        kind,
        photo_data_url: photo,
        signature_data_url: signature,
        // On a pickup the equipment is leaving the home, so the checklist is delivery-only.
        condition: isPickup ? null : condition,
      })
      const { events, pods } = await api.get<{ events: OrderEvent[]; pods: Pod[] }>(`/api/orders/${job.id}`)
      setCapturing(false)
      onComplete({
        order: job,
        kind,
        patientName: patient?.name ?? '',
        pod: pods.at(-1),
        familyText: familyNotifiedText(events),
      })
    } catch {
      toast.error("That didn't go through — give it another tap.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card data-order-ids={job.id} className={`relative ${acked ? 'row-ack' : ''}`}>
      <span
        aria-hidden="true"
        className={`absolute bottom-2.5 left-0 top-2.5 w-1.5 rounded-full ${SPINE_CLASS[STATE_STATUS_TONE[job.state]]}`}
      />
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
              {isPickup ? 'Pick up' : 'Deliver'}
            </div>
            <div className="mt-1 font-display text-lg font-bold text-foreground">{job.equipment_name}</div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              {patient?.name}
              {patient?.address ? ` · ${patient.address}` : ''}
            </div>
            {job.target_at && (
              <div className="mt-0.5 text-sm text-muted-foreground tabular-nums">by {fmt(job.target_at)}</div>
            )}
          </div>
          <StatusPill state={job.state} />
        </div>

        {isPickup && (
          <p className="rounded-xl border border-border bg-coral-tint px-4 py-3 text-sm leading-relaxed text-[#8a4a2e]">
            <b>The family is grieving.</b> Call ahead, be brief and kind.
          </p>
        )}

        <div className="space-y-2 pt-1">
          {job.state === 'dispatched' && (
            <Button className="w-full" disabled={starting} onClick={startDelivery}>
              <Truck /> {starting ? 'Starting…' : 'Start delivery'}
            </Button>
          )}

          {(job.state === 'in_transit' || isPickup) && !capturing && (
            <Button className="w-full" onClick={() => setCapturing(true)}>
              <PackageCheck /> {isPickup ? 'Complete pickup' : 'Complete delivery'}
            </Button>
          )}

          {capturing && (
            <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-3">
              {/* Captions, not labels: each control below is a sibling, not a labelable child. */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Camera className="size-3.5" /> Photo of the equipment
                </div>
                <PhotoInput onCapture={setPhoto} />
              </div>

              {!isPickup && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Condition attestation — uncheck anything that isn't true
                  </div>
                  <ConditionChecklist value={condition} onChange={setCondition} />
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground">Signature</div>
                <SignaturePad onCapture={setSignature} />
              </div>

              <div className="space-y-1.5">
                <Button className="w-full" disabled={!signature || submitting} onClick={submitPod}>
                  {submitting ? 'Submitting…' : isPickup ? 'Confirm pickup' : 'Confirm delivery'}
                </Button>
                {!signature && (
                  <p className="text-center text-xs text-muted-foreground">
                    Sign in the box above to finish.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function JobCompleteCard({ completed, onDismiss }: { completed: CompletedJob; onDismiss: () => void }) {
  const { order, kind, patientName, pod, familyText } = completed
  const proof = [pod?.photo_path && 'photo', pod?.signature_path && 'signature'].filter(Boolean).join(' + ')
  return (
    <Card className="relative">
      <span aria-hidden="true" className="absolute bottom-2.5 left-0 top-2.5 w-1.5 rounded-full bg-status-done" />
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-success">
              <CheckCircle2 className="size-3.5" /> {kind === 'pickup' ? 'Picked up' : 'Delivered'}
            </div>
            <div className="mt-1 font-display text-lg font-bold text-foreground">{order.equipment_name}</div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              {[patientName, proof && `${proof} on file`].filter(Boolean).join(' · ')}
            </div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={onDismiss}>
            <X />
          </Button>
        </div>

        {familyText && (
          <div className="rounded-xl border border-border bg-coral-tint px-4 py-3 text-[#8a4a2e]">
            <div className="text-xs font-semibold">Family notified</div>
            <p className="mt-1 text-sm leading-relaxed">“{familyText}”</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
