import { useEffect, useRef, useState } from 'react'
import { useEventStream } from '../hooks/useEventStream'

export function useLive<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
): { data: T | null; failed: boolean; reload: () => void } {
  const { lastEvent } = useEventStream()
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)
  const loadRef = useRef(load)
  loadRef.current = load

  const run = () =>
    loadRef
      .current()
      .then((next) => {
        setData(next)
        setFailed(false)
      })
      .catch((err) => {
        console.error(err)
        setFailed(true)
      })

  // Refetch on every SSE event, and whenever a caller-provided input (e.g. a selected
  // vendor id) changes — the load closure captures those, so without them the fetch
  // would stay pinned to the value from first render until the next broadcast.
  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent, ...deps])

  return { data, failed, reload: run }
}

export function fmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
