import { useEffect, useState } from 'react'
import type { ServerEvent } from '../../../shared/types'

export function useEventStream(url = '/api/events') {
  const [connected, setConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<ServerEvent | null>(null)

  useEffect(() => {
    const es = new EventSource(url)
    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.onmessage = (e) => setLastEvent(JSON.parse(e.data))
    return () => es.close()
  }, [url])

  return { connected, lastEvent }
}
