import { useParams } from 'react-router-dom'
import { Truck } from 'lucide-react'
import { PersonaHeader } from '@/components/PersonaHeader'
import { EmptyState } from '@/components/EmptyState'
import { usePortal } from '@/hooks/usePortal'
import { mockUnitLocations } from '@/lib/mocks'

/** Stub — Lane C (FE-C.4/C.5) builds the no-login vendor status page here. */
export default function VendorStatus() {
  const { token } = useParams<{ token: string }>()
  const { vendor, orders, loading, error } = usePortal(token)
  // Smoke usage of the mock adapter: enrich real orders with serialized per-unit location.
  const unitByOrder = vendor ? mockUnitLocations(vendor.id, orders) : null
  void unitByOrder

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PersonaHeader
        persona={vendor ? vendor.name : 'DME Vendor'}
        title="Order status"
        description={vendor ? `${orders.length} live order${orders.length === 1 ? '' : 's'}` : 'No login required.'}
      />
      <EmptyState
        icon={<Truck />}
        title={loading ? 'Loading…' : error ? 'Link not recognized' : 'Status actions coming soon'}
        description={
          error ??
          'One-tap Accept / On the way / Delivered with ETA entry — wired to the board live.'
        }
      />
    </div>
  )
}
