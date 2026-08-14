import { BarChart3 } from 'lucide-react'
import { PersonaHeader } from '@/components/PersonaHeader'
import { EmptyState } from '@/components/EmptyState'

/** Stub — Lane D (FE-D.x) builds vendor scorecards + cost-of-care here. */
export default function Reports() {
  return (
    <div className="space-y-6">
      <PersonaHeader
        persona="Director of Nursing"
        title="Reports"
        description="Vendor scorecards, cost of care, and the calls that never had to happen."
      />
      <EmptyState
        icon={<BarChart3 />}
        title="Reports coming soon"
        description="On-time by equipment and weekday, DME spend beside med spend, and pickup latency."
      />
    </div>
  )
}
