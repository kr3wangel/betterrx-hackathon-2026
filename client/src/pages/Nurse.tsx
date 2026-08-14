import { HeartHandshake } from 'lucide-react'
import { PersonaHeader } from '@/components/PersonaHeader'
import { EmptyState } from '@/components/EmptyState'

/** Stub — Lane B (FE-B.3) builds the nurse pickup surface here. */
export default function Nurse() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <PersonaHeader
        persona="Field Nurse"
        title="Patient status"
        description="One tap when a patient is discharged or has passed away — pickups follow automatically."
      />
      <EmptyState
        icon={<HeartHandshake />}
        title="Pickup surface coming soon"
        description="Pick a patient, confirm status with respectful copy, and pickups appear on the board."
      />
    </div>
  )
}
