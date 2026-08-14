import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useLive, fmt } from '../lib/useLive'
import { Badge, Button, Card } from '../components/ui'
import { STATE_LABEL, STATE_TONE } from '../lib/domain'
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
    <div className="mx-auto max-w-md space-y-3">
      <PersonaHeader persona="Driver" title="Today's route" />
      <select
        className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
        value={vendorId}
        onChange={(e) => setVendorId(Number(e.target.value))}
      >
        {(vendors ?? []).map((v) => (
          <option key={v.id} value={v.id}>{v.name} — driver view</option>
        ))}
      </select>

      {(jobs ?? []).map((job) => (
        <JobCard key={job.id} job={job} patient={patientById.get(job.patient_id)} />
      ))}
      {jobs && jobs.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
          No jobs on the route.
        </div>
      )}
    </div>
  )
}

function JobCard({ job, patient }: { job: Order; patient?: Patient }) {
  const [capturing, setCapturing] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const isPickup = job.state === 'pickup_pending' || job.state === 'pickup_overdue'

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold">
            {isPickup ? 'PICK UP' : 'DELIVER'} · {job.equipment_name}
          </div>
          <div className="text-xs text-slate-500">
            {patient?.name} · {patient?.address}
          </div>
          {job.target_at && <div className="text-xs text-slate-500">by {fmt(job.target_at)}</div>}
        </div>
        <Badge tone={STATE_TONE[job.state]}>{STATE_LABEL[job.state]}</Badge>
      </div>

      {isPickup && (
        <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
          The family is grieving. Call ahead, be brief and kind.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {job.state === 'dispatched' && (
          <Button className="w-full" onClick={() => api.post(`/api/orders/${job.id}/events`, { type: 'out_for_delivery', actor: 'driver' })}>
            Start delivery
          </Button>
        )}

        {(job.state === 'in_transit' || isPickup) && !capturing && (
          <Button className="w-full" onClick={() => setCapturing(true)}>
            {isPickup ? 'Complete pickup' : 'Complete delivery'}
          </Button>
        )}

        {capturing && (
          <div className="space-y-3 rounded-md border border-slate-200 p-2">
            <PhotoInput onCapture={setPhoto} />
            <SignaturePad onCapture={setSignature} />
            <Button
              className="w-full"
              disabled={!signature}
              onClick={async () => {
                await api.post(`/api/orders/${job.id}/pod`, {
                  kind: isPickup ? 'pickup' : 'delivery',
                  photo_data_url: photo,
                  signature_data_url: signature,
                })
                setCapturing(false)
              }}
            >
              Submit proof {isPickup ? 'of pickup' : 'of delivery'}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
