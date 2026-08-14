import { useEffect, useRef, useState } from 'react'
import { useEventStream } from '../hooks/useEventStream'

export function useLive<T>(load: () => Promise<T>): { data: T | null; reload: () => void } {
  const { lastEvent } = useEventStream()
  const [data, setData] = useState<T | null>(null)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    loadRef.current().then(setData).catch(console.error)
  }, [lastEvent])

  return { data, reload: () => loadRef.current().then(setData).catch(console.error) }
}

export function fmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
