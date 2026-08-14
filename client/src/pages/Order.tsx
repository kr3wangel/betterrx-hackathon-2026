import { ClipboardList } from 'lucide-react'
import { PersonaHeader } from '@/components/PersonaHeader'
import { EmptyState } from '@/components/EmptyState'

/** Stub — Lane B (FE-B.1/B.2) builds the order form here. */
export default function Order() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PersonaHeader persona="Admissions Nurse" title="New order" description="Place a DME order from admission." />
      <EmptyState
        icon={<ClipboardList />}
        title="Order form coming soon"
        description="Patient, equipment, quantity, urgency, target date, and vendor — sub-60s to fill."
      />
    </div>
  )
}
