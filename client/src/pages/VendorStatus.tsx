import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
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
import type { Order, OrderState } from '../../../shared/types'

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
  const [pending, setPending] = useState<OrderState | null>(null)
  const [declined, setDeclined] = useState(false)

  useEffect(() => {
    setPending((p) => (p && order.state === p ? null : p))
  }, [order.state])

  // Optimistic until the refetch lands, so a tap doesn't sit there looking ignored.
  const state = pending ?? order.state
  const isNew = state === 'ordered'
  const isAccepted = state === 'dispatched'
  const isOnTruck = state === 'in_transit'

  // The VendorPortal.tsx act() pattern: optimistic state, one plain-English receipt, rollback
  // and an error toast when it doesn't land. PortalShell mounts the Toaster this needs.
  async function act(expected: OrderState | null, run: () => Promise<unknown>, done: string, closeEta = false) {
    setBusy(true)
    if (expected) setPending(expected)
    try {
      await run()
      toast.success(done)
      if (closeEta) setShowEta(false)
    } catch {
      setPending(null)
      toast.error("That didn't go through — give it another tap.")
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
          <StatusPill state={state} />
        </div>

        {declined && (
          <p className="rounded-xl border border-border bg-coral-tint px-4 py-3 text-sm leading-relaxed text-[#8a4a2e]">
            Thanks — the hospice is re-routing this one.
          </p>
        )}

        <div className="space-y-2.5">
          {isNew && !declined && (
            <Button
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() =>
                act('dispatched', () => onConfirm(order.id), 'Accepted — the hospice can see it.')
              }
            >
              <Check /> Accept this order
            </Button>
          )}

          {(isAccepted || isNew) && !declined && (
            <Button
              size="lg"
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() =>
                act('in_transit', markOutForDelivery, "The hospice can see you're on the way.")
              }
            >
              <Truck /> On the way
            </Button>
          )}

          {isOnTruck && (
            <Button
              size="lg"
              variant="success"
              className="w-full"
              disabled={busy}
              onClick={() => act('delivered', markDelivered, 'Marked delivered — the hospice has it.')}
            >
              <PackageCheck /> Delivered
            </Button>
          )}

          {!showEta ? (
            <Button size="lg" variant="ghost" className="w-full" disabled={busy} onClick={() => setShowEta(true)}>
              <Clock /> Set an ETA instead
            </Button>
          ) : (
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
              <label className="text-xs font-semibold text-muted-foreground" htmlFor={`eta-${order.id}`}>
                When will it arrive?
              </label>
              <Input
                id={`eta-${order.id}`}
                type="datetime-local"
                className="text-base"
                value={etaValue}
                onChange={(e) => setEtaValue(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" disabled={busy} onClick={() => setShowEta(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={!etaValue || busy}
                  onClick={() =>
                    act(
                      null,
                      () => onSetEta(order.id, new Date(etaValue).toISOString()),
                      'ETA sent to the hospice.',
                      true
                    )
                  }
                >
                  Save ETA
                </Button>
              </div>
            </div>
          )}

          {!declined && (
            <Button
              variant="ghost"
              className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={() => {
                setDeclined(true)
                void act(
                  null,
                  () =>
                    onDecline(order.id).catch((err) => {
                      setDeclined(false)
                      throw err
                    }),
                  "Thanks for saying so — they're re-routing it now."
                )
              }}
            >
              Can't do this one
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
