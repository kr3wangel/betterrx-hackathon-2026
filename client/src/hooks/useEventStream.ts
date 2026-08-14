import { useEffect, useState } from 'react'
import type { ServerEvent } from '../../../shared/types'

/**
 * One EventSource for the whole app, shared by every caller.
 *
 * This used to open a connection per hook call, and since every useLive() calls it, a page
 * with five live queries held five permanently-open streams. Browsers allow six concurrent
 * connections per origin on HTTP/1.1, and Vite proxies /api through the same origin — so
 * modules, fetches and streams all compete for the same six. Pages whose modules were
 * already cached survived; a cold page load starved and hung forever.
 *
 * Ref-counted: the stream opens on the first subscriber and closes when the last one
 * unmounts. The returned shape is unchanged, so callers needed no edits.
 */

type Listener = (lastEvent: ServerEvent | null, connected: boolean) => void

interface Stream {
  es: EventSource
  listeners: Set<Listener>
  connected: boolean
  last: ServerEvent | null
}

const streams = new Map<string, Stream>()

function notify(s: Stream) {
  for (const fn of s.listeners) fn(s.last, s.connected)
}

function acquire(url: string, listener: Listener): Stream {
  let s = streams.get(url)
  if (!s) {
    const es = new EventSource(url)
    s = { es, listeners: new Set(), connected: false, last: null }
    streams.set(url, s)
    const stream = s
    es.onopen = () => {
      stream.connected = true
      notify(stream)
    }
    es.onerror = () => {
      stream.connected = false
      notify(stream)
    }
    es.onmessage = (e) => {
      stream.last = JSON.parse(e.data) as ServerEvent
      notify(stream)
    }
  }
  s.listeners.add(listener)
  return s
}

function release(url: string, listener: Listener) {
  const s = streams.get(url)
  if (!s) return
  s.listeners.delete(listener)
  if (s.listeners.size === 0) {
    s.es.close()
    streams.delete(url)
  }
}

export function useEventStream(url = '/api/events') {
  const [state, setState] = useState(() => {
    const s = streams.get(url)
    return { connected: s?.connected ?? false, lastEvent: s?.last ?? null }
  })

  useEffect(() => {
    const listener: Listener = (lastEvent, connected) => setState({ lastEvent, connected })
    const s = acquire(url, listener)
    setState({ connected: s.connected, lastEvent: s.last })
    return () => release(url, listener)
  }, [url])

  return state
}
