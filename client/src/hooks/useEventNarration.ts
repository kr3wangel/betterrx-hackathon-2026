import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { subscribeToEvents } from './useEventStream'
import { api } from '../lib/api'
import { activeExpectations } from '../lib/expectedEvents'
import { collapseNarrations, decideNarration, isNarratableType } from '../lib/narration'
import type { NarrationWorld } from '../lib/narration'
import { useHighlight } from '../lib/highlight'
import type { Escalation, Order, Patient, ServerEvent, Vendor } from '../../../shared/types'

const DEBOUNCE_MS = 250
const RATE_WINDOW_MS = 8000
const RATE_LIMIT = 3
const ALERT_DURATION_MS = 6000
const DURATION_MS = 4000
const QUIET_KEY = 'betterrx.quiet'
const OVERFLOW_ID = 'narration-overflow'

function readQuiet(): boolean {
  const param = new URLSearchParams(window.location.search).get('quiet')
  if (param === '1') sessionStorage.setItem(QUIET_KEY, '1')
  else if (param === '0') sessionStorage.removeItem(QUIET_KEY)
  return sessionStorage.getItem(QUIET_KEY) === '1'
}

/** Mount exactly once, in Shell(), inside HighlightProvider. */
export function useEventNarration() {
  const { pulse } = useHighlight()
  const [quiet] = useState(readQuiet)
  const queue = useRef<ServerEvent[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seen = useRef(new WeakSet<ServerEvent>())
  const stamps = useRef<number[]>([])
  const pulseRef = useRef(pulse)
  pulseRef.current = pulse

  const drain = useCallback(async () => {
    const batch = queue.current
    queue.current = []
    if (batch.length === 0) return

    let world: NarrationWorld
    try {
      const [orders, patients, vendors, escalations] = await Promise.all([
        api.get<Order[]>('/api/orders'),
        api.get<Patient[]>('/api/patients'),
        api.get<Vendor[]>('/api/vendors'),
        api.get<Escalation[]>('/api/escalations?status=open'),
      ])
      world = { orders, patients, vendors, escalations }
    } catch (err) {
      console.error(err)
      return
    }

    const now = Date.now()
    const expectations = activeExpectations(now)
    const toasts = collapseNarrations(batch.map((e) => decideNarration(e, world, expectations, now)))

    let overflow = 0
    for (const narration of toasts) {
      for (const id of narration.pulseOrderIds) pulseRef.current(id)
      stamps.current = stamps.current.filter((s) => s > now - RATE_WINDOW_MS)
      if (stamps.current.length >= RATE_LIMIT) {
        overflow++
        continue
      }
      stamps.current.push(now)
      toast(narration.title, {
        description: narration.description ?? undefined,
        duration: narration.tone === 'alert' ? ALERT_DURATION_MS : DURATION_MS,
      })
    }
    if (overflow > 0) {
      toast(`${overflow} more update${overflow === 1 ? '' : 's'} on the board`, {
        id: OVERFLOW_ID,
        duration: DURATION_MS,
      })
    }
  }, [])

  useEffect(() => {
    return subscribeToEvents((event) => {
      // StrictMode double-invokes effects in dev, which would narrate every event twice.
      if (seen.current.has(event)) return
      seen.current.add(event)

      if (!isNarratableType(event)) return

      if (quiet) {
        if ('order_id' in event) pulseRef.current(event.order_id)
        return
      }

      queue.current.push(event)
      if (timer.current) return
      timer.current = setTimeout(() => {
        timer.current = null
        void drain()
      }, DEBOUNCE_MS)
    })
  }, [quiet, drain])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])
}
