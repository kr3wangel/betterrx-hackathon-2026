import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useEventStream } from './useEventStream'
import type { Order, Vendor, VendorLoad } from '../../../shared/types'

interface PortalPayload {
  vendor: Vendor
  orders: Order[]
  load: VendorLoad
}

export interface UsePortal {
  vendor: Vendor | null
  orders: Order[]
  /** Today's stop load + the vendor's own capacity declaration. */
  load: VendorLoad | null
  loading: boolean
  error: string | null
  /** Vendor accepts the order (optionally with an ETA). */
  confirm: (orderId: number, etaIso?: string) => Promise<void>
  /** Vendor sets / updates the ETA on an accepted order. */
  setEta: (orderId: number, etaIso: string) => Promise<void>
  /** Vendor declines the order — raises an escalation on the board. */
  decline: (orderId: number, reason?: string) => Promise<void>
  /** Vendor declares how many stops they can take today; resolves with the fresh load. */
  declareCapacity: (stops: number) => Promise<VendorLoad>
  reload: () => void
}

/**
 * usePortal — the no-login vendor status page data source (Lanes C & E).
 * Wraps GET /api/portal/:token plus the confirm/eta/decline POSTs, and refetches
 * on every SSE event so a case-manager action shows up live on the vendor's side.
 */
export function usePortal(token: string | undefined): UsePortal {
  const { lastEvent } = useEventStream()
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [load, setLoad] = useState<VendorLoad | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef(token)
  tokenRef.current = token

  const reload = useCallback(() => {
    const t = tokenRef.current
    if (!t) {
      setError('Missing portal link')
      setLoading(false)
      return
    }
    api
      .get<PortalPayload>(`/api/portal/${t}`)
      .then((payload) => {
        setVendor(payload.vendor)
        setOrders(payload.orders)
        setLoad(payload.load)
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load portal'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(reload, [reload, token, lastEvent])

  const confirm = useCallback(
    async (orderId: number, etaIso?: string) => {
      await api.post(`/api/portal/${tokenRef.current}/orders/${orderId}/confirm`, { eta_iso: etaIso ?? null })
    },
    []
  )
  const setEta = useCallback(async (orderId: number, etaIso: string) => {
    await api.post(`/api/portal/${tokenRef.current}/orders/${orderId}/eta`, { eta_iso: etaIso })
  }, [])
  const decline = useCallback(async (orderId: number, reason?: string) => {
    await api.post(`/api/portal/${tokenRef.current}/orders/${orderId}/decline`, { reason: reason ?? null })
  }, [])
  const declareCapacity = useCallback(
    (stops: number) => api.post<VendorLoad>(`/api/portal/${tokenRef.current}/capacity`, { stops }),
    []
  )

  return { vendor, orders, load, loading, error, confirm, setEta, decline, declareCapacity, reload }
}
