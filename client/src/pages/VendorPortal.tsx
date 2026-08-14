import { PackageSearch } from 'lucide-react'
import { PersonaHeader } from '@/components/PersonaHeader'
import { EmptyState } from '@/components/EmptyState'

/** Stub — Lane E (FE-E.x) builds the no-login vendor portal here (via usePortal). */
export default function VendorPortal() {
  return (
    <div className="space-y-6">
      <PersonaHeader
        persona="DME Vendor"
        title="Vendor portal"
        description="Every order, every unit, and where each piece of equipment is — no login."
      />
      <EmptyState
        icon={<PackageSearch />}
        title="Portal coming soon"
        description="Open a vendor link (/portal/:token) to see live orders, serialized inventory, and SLA vs actual."
      />
    </div>
  )
}
