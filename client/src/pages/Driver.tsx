import { useMemo, useState } from 'react'
import { Camera, PackageCheck, Truck } from 'lucide-react'
import { api } from '../lib/api'
import { useLive, fmt } from '../lib/useLive'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/StatusPill'
import { EmptyState } from '@/components/EmptyState'
import { ConditionChecklist, EMPTY_CONDITION, type ConditionState } from '@/components/ConditionChecklist'
import { SignaturePad } from '../components/SignaturePad'
import { PhotoInput } from '../components/PhotoInput'
import { PersonaHeader } from '@/components/PersonaHeader'
import type { Order, Patient, Vendor } from '../../../shared/types'

export default function Driver() {
  const [vendorId, setVendorId] = useState(1)
  const { data: vendors } = useLive(() => api.get<Vendor[]>('/api/vendors'))
  const { data: jobs } = useLive(() => api.get<Order[]>(`/api/driver/jobs?vendor_id=${vendorId}`))
  const { data: patients } = useLive(() => api.get<Patient[]>('/api/patients'))

  const patientById = useMemo(() => new Map((patients ?? []).map((p) => [p.id, p])), [patients])

  return (
    <div className="mx-auto max-w-md space-y-5">
      <PersonaHeader
        persona="Driver"
        title="Today's route"
        description="Deliveries and pickups, in order. Snap a photo, grab a signature, done."
      />

      <select
        className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        value={vendorId}
        onChange={(e) => setVendorId(Number(e.target.value))}
      >
        {(vendors ?? []).map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} — driver view
          </option>
        ))}
      </select>

      {(jobs ?? []).map((job) => (
        <JobCard key={job.id} job={job} patient={patientById.get(job.patient_id)} />
      ))}
      {jobs && jobs.length === 0 && (
        <EmptyState
          icon={<Truck />}
          title="Route's clear"
          description="No deliveries or pickups assigned right now."
        />
      )}
    </div>
  )
}

function JobCard({ job, patient }: { job: Order; patient?: Patient }) {
  const [capturing, setCapturing] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [condition, setCondition] = useState<ConditionState>(EMPTY_CONDITION)
  const [submitting, setSubmitting] = useState(false)
  const isPickup = job.state === 'pickup_pending' || job.state === 'pickup_overdue'

  async function submitPod() {
    setSubmitting(true)
    try {
      await api.post(`/api/orders/${job.id}/pod`, {
        kind: isPickup ? 'pickup' : 'delivery',
        photo_data_url: photo,
        signature_data_url: signature,
        // The three delivery attestations (PodCondition). On a pickup the equipment is
        // leaving the home, so the checklist is a delivery-only capture.
        condition: isPickup ? null : condition,
      })
      setCapturing(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
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
            <Button
              className="w-full"
              onClick={() => api.post(`/api/orders/${job.id}/events`, { type: 'out_for_delivery', actor: 'driver' })}
            >
              <Truck /> Start delivery
            </Button>
          )}

          {(job.state === 'in_transit' || isPickup) && !capturing && (
            <Button className="w-full" onClick={() => setCapturing(true)}>
              <PackageCheck /> {isPickup ? 'Complete pickup' : 'Complete delivery'}
            </Button>
          )}

          {capturing && (
            <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-3">
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Camera className="size-3.5" /> Photo of the equipment
                </label>
                <PhotoInput onCapture={setPhoto} />
              </div>

              {!isPickup && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Condition attestation</label>
                  <ConditionChecklist value={condition} onChange={setCondition} />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Signature</label>
                <SignaturePad onCapture={setSignature} />
              </div>

              <Button className="w-full" disabled={!signature || submitting} onClick={submitPod}>
                {submitting ? 'Submitting…' : isPickup ? 'Confirm pickup' : 'Confirm delivery'}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
