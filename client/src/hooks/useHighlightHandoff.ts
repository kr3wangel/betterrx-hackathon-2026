import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useHighlight } from '../lib/highlight'

/** What an action leaves in location state when it sends you to the page its work landed on. */
export interface HighlightHandoff {
  orderIds: number[]
  at: number
}

const FRESH_MS = 10_000
const SCROLL_TRIES = 12
const SCROLL_INTERVAL_MS = 120

/** The row the handoff points at may still be loading, or behind a collapse the page just opened. */
function scrollToRow(orderId: number, reducedMotion: boolean): ReturnType<typeof setInterval> {
  let tries = 0
  const timer = setInterval(() => {
    const el = document.querySelector(`[data-order-ids~="${orderId}"]`)
    if (el) el.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
    if (el || ++tries >= SCROLL_TRIES) clearInterval(timer)
  }, SCROLL_INTERVAL_MS)
  return timer
}

/**
 * Consumes the one-shot `{ highlight }` location state an action handoff left behind: rings each
 * row and scrolls the first into view. `onArrive` runs before the scroll, for a page that has to
 * reveal the target first (the board's "show" collapse).
 */
export function useHighlightHandoff(onArrive?: (orderIds: number[]) => void): void {
  const location = useLocation()
  const navigate = useNavigate()
  const { pulse } = useHighlight()
  const arrive = useRef(onArrive)
  arrive.current = onArrive
  const consumed = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), [])

  useEffect(() => {
    const handoff = (location.state as { highlight?: HighlightHandoff } | null)?.highlight
    if (!handoff?.orderIds?.length || consumed.current === handoff.at) return
    // Back/forward restores history state, so without this the rows re-ring every time you
    // navigate back to the board.
    if (Date.now() - handoff.at > FRESH_MS) return
    consumed.current = handoff.at
    navigate(location.pathname, { replace: true, state: null })

    for (const id of handoff.orderIds) pulse(id)
    arrive.current?.(handoff.orderIds)

    if (timer.current) clearInterval(timer.current)
    timer.current = scrollToRow(
      handoff.orderIds[0],
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    )
  }, [location, navigate, pulse])
}
