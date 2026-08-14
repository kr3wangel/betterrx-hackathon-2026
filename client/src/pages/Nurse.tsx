import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ChevronLeft } from 'lucide-react'
import { api } from '../lib/api'
import type { Patient, PatientStatus } from '../../../shared/types'
import { PersonaHeader } from '@/components/PersonaHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type StatusChoice = Exclude<PatientStatus, 'active'>

/** Respectful, plain-English framing for each status change the nurse can trigger. */
const CHOICES: {
  value: StatusChoice
  label: string
  helper: string
  confirmTitle: (name: string) => string
  confirmBody: string
  confirmCta: string
  tone: 'discharge' | 'passing'
}[] = [
  {
    value: 'discharged',
    label: 'Went home / discharged',
    helper: 'The patient has left our care and is home or elsewhere.',
    confirmTitle: (name) => `Mark ${name} as discharged?`,
    confirmBody:
      'We’ll arrange to collect the rented equipment. No calls needed — the pickup shows up for the driver automatically.',
    confirmCta: 'Yes, they went home',
    tone: 'discharge',
  },
  {
    value: 'deceased',
    label: 'Passed away',
    helper: 'The patient has passed. We’ll handle pickup gently.',
    confirmTitle: (name) => `Confirm ${name} has passed away`,
    confirmBody:
      'We’ll schedule the equipment pickup with care and a note for the family. Take your time — this is the only step you need to do.',
    confirmCta: 'Confirm, with care',
    tone: 'passing',
  },
]

export default function Nurse() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState<Patient | null>(null)

  function load() {
    api
      .get<Patient[]>('/api/patients')
      .then(setPatients)
      .catch(() => setLoadError(true))
  }
  useEffect(load, [])

  const activePatients = useMemo(
    () => patients.filter((p) => p.status === 'active'),
    [patients],
  )

  async function apply(choice: StatusChoice) {
    if (!selected) return
    const patient = selected
    try {
      await api.post(`/api/patients/${patient.id}/status`, { status: choice })
      toast.success(
        choice === 'deceased' ? 'Recorded, with care' : 'Recorded — patient discharged',
        {
          description:
            choice === 'deceased'
              ? `Pickup for ${patient.name}’s equipment is scheduled. The family will be handled gently.`
              : `Pickup for ${patient.name}’s equipment is on the driver’s list.`,
        },
      )
      setSelected(null)
      load()
    } catch {
      toast.error('Couldn’t save that', {
        description: 'Something went wrong reaching the server. Try again in a moment.',
      })
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PersonaHeader
        persona="Field Nurse"
        title="Patient status"
        description="One tap when a patient goes home or passes away — the equipment pickup follows on its own."
      />

      {loadError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Couldn’t load your patients. Refresh to try again.
          </CardContent>
        </Card>
      ) : selected ? (
        <StatusConfirm patient={selected} onBack={() => setSelected(null)} onApply={apply} />
      ) : activePatients.length === 0 ? (
        <EmptyState
          title="No active patients"
          description="Everyone in your care is already accounted for. New admissions will appear here."
        />
      ) : (
        <PatientPicker patients={activePatients} onPick={setSelected} />
      )}
    </div>
  )
}

function PatientPicker({
  patients,
  onPick,
}: {
  patients: Patient[]
  onPick: (p: Patient) => void
}) {
  return (
    <div className="space-y-2.5">
      <p className="px-1 text-sm text-muted-foreground">Who has a change to report?</p>
      {patients.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onPick(p)}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left shadow-[0_1px_2px_rgba(38,50,64,.04)] transition-colors hover:bg-muted"
        >
          <Avatar name={p.name} />
          <span className="min-w-0">
            <span className="block truncate font-display text-base font-bold tracking-tight">
              {p.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{p.address}</span>
          </span>
          <span className="ml-auto text-muted-foreground">›</span>
        </button>
      ))}
    </div>
  )
}

function StatusConfirm({
  patient,
  onBack,
  onApply,
}: {
  patient: Patient
  onBack: () => void
  onApply: (choice: StatusChoice) => void
}) {
  const [pending, setPending] = useState<StatusChoice | null>(null)
  const choice = CHOICES.find((c) => c.value === pending)

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> All patients
      </button>

      <Card>
        <CardContent className="flex items-center gap-3 py-5">
          <Avatar name={patient.name} large />
          <div>
            <div className="font-display text-xl font-extrabold tracking-tight">{patient.name}</div>
            <div className="text-xs text-muted-foreground">{patient.address}</div>
          </div>
        </CardContent>
      </Card>

      {choice ? (
        <Card
          className={cn(
            'border',
            choice.tone === 'passing' ? 'border-[#f3ddd2] bg-coral-tint' : 'border-border',
          )}
        >
          <CardContent className="space-y-4 py-5">
            <div className="font-display text-lg font-bold tracking-tight">
              {choice.confirmTitle(patient.name)}
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{choice.confirmBody}</p>
            <div className="flex flex-col gap-2.5">
              <Button
                size="lg"
                className="w-full"
                variant={choice.tone === 'passing' ? 'secondary' : 'default'}
                onClick={() => onApply(choice.value)}
              >
                {choice.confirmCta}
              </Button>
              <Button size="lg" variant="ghost" className="w-full" onClick={() => setPending(null)}>
                Not yet
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          <p className="px-1 text-sm text-muted-foreground">What changed for {patient.name}?</p>
          {CHOICES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setPending(c.value)}
              className="block w-full rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:bg-muted"
            >
              <span className="font-display text-base font-bold tracking-tight">{c.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{c.helper}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Avatar({ name, large }: { name: string; large?: boolean }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-secondary font-display font-bold text-secondary-foreground',
        large ? 'size-12 text-base' : 'size-10 text-sm',
      )}
    >
      {initials}
    </span>
  )
}
