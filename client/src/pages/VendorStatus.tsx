import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, Truck, PackageCheck, Clock } from 'lucide-react'
import { PersonaHeader } from '@/components/PersonaHeader'
import { EmptyState } from '@/components/EmptyState'
import { StatusPill } from '@/components/StatusPill'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePortal } from '@/hooks/usePortal'
import { api } from '@/lib/api'
import { fmt } from '@/lib/useLive'
import type { Order } from '../../../shared/types'

/**
 * VendorStatus — the no-login vendor status page (gallery screen 02, left).
 * A text link opens this; the whole "onboarding" is one tap. PHI-clean: order #,
 * equipment, and service area only — never a patient name or address on this link.
 */
export default function VendorStatus() {
  const { token } = useParams<{ token: string }>()
  const { vendor, orders, loading, error, confirm, setEta, decline } = usePortal(token)

  return (
    <div className="mx-auto max-w-md space-y-5">
      <PersonaHeader
        persona={vendor ? vendor.name : 'DME Vendor'}
        title="Your orders"
        description={vendor ? vendor.service_area : 'No login required.'}
      />

      {loading && <EmptyState icon={<Truck />} title="Loading…" description="Fetching your live orders." />}

      {!loading && error && (
        <EmptyState
          icon={<Truck />}
          title="Link not recognized"
          description="This status link has expired or isn't valid. Ask your hospice contact to re-send it."
        />
      )}

      {!loading && !error && orders.length === 0 && (
        <EmptyState icon={<PackageCheck />} title="All caught up" description="No open orders on this link right now." />
      )}

      {!loading &&
        !error &&
        orders.map((order) => (
          <OrderRequestCard
            key={order.id}
            order={order}
            onConfirm={confirm}
            onSetEta={setEta}
            onDecline={decline}
          />
        ))}

      {!loading && !error && orders.length > 0 && (
        <p className="px-2 text-center text-xs leading-relaxed text-faint">
          No account needed. Order #, equipment &amp; area only — no patient details on this link.
        </p>
      )}
    </div>
  )
}

function OrderRequestCard({
  order,
  onConfirm,
  onSetEta,
  onDecline,
}: {
  order: Order
  onConfirm: (orderId: number, etaIso?: string) => Promise<void>
  onSetEta: (orderId: number, etaIso: string) => Promise<void>
  onDecline: (orderId: number, reason?: string) => Promise<void>
}) {
  const [showEta, setShowEta] = useState(false)
  const [etaValue, setEtaValue] = useState('')
  const [busy, setBusy] = useState(false)

  const isNew = order.state === 'ordered'
  const isAccepted = order.state === 'dispatched'
  const isOnTruck = order.state === 'in_transit'

  async function run(fn: () => Promise<unknown>, closeEta = false) {
    setBusy(true)
    try {
      await fn()
      if (closeEta) setShowEta(false)
    } finally {
      setBusy(false)
    }
  }

  // "On the way" / "Delivered" have no confirm-equivalent on the portal, so they post the
  // matching lifecycle event directly (same valid transitions the driver flow uses). Accept,
  // Set ETA and Decline go through the shared usePortal hooks.
  const markOutForDelivery = () =>
    api.post(`/api/orders/${order.id}/events`, { type: 'out_for_delivery', actor: 'vendor' })
  const markDelivered = () =>
    api.post(`/api/orders/${order.id}/events`, { type: 'delivered', actor: 'vendor' })

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Order request</div>
            <div className="mt-1 font-display text-xl font-bold text-foreground">{order.equipment_name}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Order <span className="tabular-nums text-foreground">#{order.id}</span>
              {order.target_at && (
                <>
                  {' '}
                  · deliver by <span className="font-semibold text-foreground">{fmt(order.target_at)}</span>
                </>
              )}
            </p>
            {order.eta_at && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                Your ETA: <span className="font-semibold tabular-nums text-foreground">{fmt(order.eta_at)}</span>
              </p>
            )}
          </div>
          <StatusPill state={order.state} />
        </div>

        <div className="space-y-2.5">
          {isNew && (
            <Button size="lg" className="w-full" disabled={busy} onClick={() => run(() => onConfirm(order.id))}>
              <Check /> Accept this order
            </Button>
          )}

          {(isAccepted || isNew) && (
            <Button
              size="lg"
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => run(markOutForDelivery)}
            >
              <Truck /> On the way
            </Button>
          )}

          {isOnTruck && (
            <Button size="lg" variant="success" className="w-full" disabled={busy} onClick={() => run(markDelivered)}>
              <PackageCheck /> Delivered
            </Button>
          )}

          {!showEta ? (
            <Button size="lg" variant="ghost" className="w-full" disabled={busy} onClick={() => setShowEta(true)}>
              <Clock /> Set an ETA instead
            </Button>
          ) : (
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
              <label className="text-xs font-semibold text-muted-foreground">When will it arrive?</label>
              <Input type="datetime-local" value={etaValue} onChange={(e) => setEtaValue(e.target.value)} />
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" disabled={busy} onClick={() => setShowEta(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={!etaValue || busy}
                  onClick={() => run(() => onSetEta(order.id, new Date(etaValue).toISOString()), true)}
                >
                  Save ETA
                </Button>
              </div>
            </div>
          )}

          <Button
            variant="ghost"
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            onClick={() => run(() => onDecline(order.id))}
          >
            Can't do this one
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
