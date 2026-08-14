import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useEventStream } from './useEventStream'
import type { Order, Vendor } from '../../../shared/types'

interface PortalPayload {
  vendor: Vendor
  orders: Order[]
}

export interface UsePortal {
  vendor: Vendor | null
  orders: Order[]
  loading: boolean
  error: string | null
  /** Vendor accepts the order (optionally with an ETA). */
  confirm: (orderId: number, etaIso?: string) => Promise<void>
  /** Vendor sets / updates the ETA on an accepted order. */
  setEta: (orderId: number, etaIso: string) => Promise<void>
  /** Vendor declines the order — raises an escalation on the board. */
  decline: (orderId: number, reason?: string) => Promise<void>
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef(token)
  tokenRef.current = token

  const load = useCallback(() => {
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
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load portal'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load, token, lastEvent])

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

  return { vendor, orders, loading, error, confirm, setEta, decline, reload: load }
}
