import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Link2Off } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useEventStream } from '@/hooks/useEventStream'
import { EmptyState } from '@/components/EmptyState'
import { PortalOrderCard } from '@/components/PortalOrderCard'
import { Skeleton } from '@/components/ui/skeleton'
import type { Order, Vendor } from '../../../shared/types'

/**
 * What a vendor gets when they tap the link in a text: the one order it was about.
 *
 * The vendor-wide portal (`/portal/:token`) still exists and is still the demo entry. This
 * is the texted door, and it is deliberately narrower — a dispatcher who was asked about
 * order #2123 should land on #2123, not on a list of every open order with #2123 somewhere
 * inside it. The link is per-order and short because it rides in an SMS.
 *
 * Mutations go through the vendor-token routes the full portal uses. The GET hands back
 * that token so there is one set of ownership checks in the server, not two.
 */

interface OrderPortalPayload {
  vendor: Vendor
  order: Order
  portal_token: string
  open_orders: number
}

export default function PortalOrder() {
  const { token } = useParams<{ token: string }>()
  const { lastEvent } = useEventStream()
  const [data, setData] = useState<OrderPortalPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [declined, setDeclined] = useState(false)

  const load = useCallback(() => {
    if (!token) return
    api
      .get<OrderPortalPayload>(`/api/portal/order/${token}`)
      .then((payload) => {
        setData(payload)
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not open this link'))
      .finally(() => setLoading(false))
  }, [token])

  // Refetch on every SSE event, so a case manager swapping the vendor or cancelling the
  // order changes what this page offers while the dispatcher is still looking at it.
  useEffect(load, [load, lastEvent])

  async function act(run: () => Promise<unknown>, done: string) {
    setBusy(true)
    try {
      await run()
      toast.success(done)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That did not go through')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Skeleton className="h-48 w-full rounded-xl" />

  if (error || !data) {
    return (
      <EmptyState
        icon={<Link2Off />}
        title="This link isn't good any more"
        description="Ask the hospice to text you a new one — nothing here is lost."
      />
    )
  }

  const { vendor, order, portal_token, open_orders } = data
  const base = `/api/portal/${portal_token}/orders/${order.id}`
  const others = open_orders - 1

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Order #{order.id}</h1>
        <p className="text-sm text-muted-foreground">{vendor.name}</p>
      </div>

      <PortalOrderCard
        order={order}
        displayState={order.state}
        now={Date.now()}
        busy={busy}
        declined={declined}
        onConfirm={(etaIso) => act(() => api.post(`${base}/confirm`, { eta_iso: etaIso ?? null }), 'Confirmed — thank you')}
        onSetEta={(etaIso) => act(() => api.post(`${base}/eta`, { eta_iso: etaIso }), 'ETA updated')}
        onDecline={(reason) =>
          act(async () => {
            await api.post(`${base}/decline`, { reason: reason ?? null })
            setDeclined(true)
          }, "Thanks — we'll place it elsewhere")
        }
      />

      {others > 0 && (
        <Link
          to={`/portal/${portal_token}`}
          className="block text-center text-sm font-medium text-primary hover:underline"
        >
          You have {others} other open {others === 1 ? 'order' : 'orders'} — see all
        </Link>
      )}
    </div>
  )
}
