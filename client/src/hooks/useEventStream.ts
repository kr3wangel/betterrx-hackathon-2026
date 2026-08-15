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
type FrameListener = (event: ServerEvent) => void

interface Stream {
  es: EventSource
  listeners: Set<Listener>
  frameListeners: Set<FrameListener>
  connected: boolean
  last: ServerEvent | null
}

const streams = new Map<string, Stream>()

function notify(s: Stream) {
  for (const fn of s.listeners) fn(s.last, s.connected)
}

function ensure(url: string): Stream {
  const existing = streams.get(url)
  if (existing) return existing
  const es = new EventSource(url)
  const stream: Stream = { es, listeners: new Set(), frameListeners: new Set(), connected: false, last: null }
  streams.set(url, stream)
  es.onopen = () => {
    stream.connected = true
    notify(stream)
  }
  es.onerror = () => {
    stream.connected = false
    notify(stream)
  }
  es.onmessage = (e) => {
    const event = JSON.parse(e.data) as ServerEvent
    stream.last = event
    for (const fn of stream.frameListeners) fn(event)
    notify(stream)
  }
  return stream
}

function closeIfIdle(url: string, s: Stream) {
  if (streams.get(url) !== s) return
  if (s.listeners.size > 0 || s.frameListeners.size > 0) return
  s.es.close()
  streams.delete(url)
}

function acquire(url: string, listener: Listener): Stream {
  const s = ensure(url)
  s.listeners.add(listener)
  return s
}

function release(url: string, listener: Listener) {
  const s = streams.get(url)
  if (!s) return
  s.listeners.delete(listener)
  closeIfIdle(url, s)
}

/**
 * Every frame, synchronously, outside React state. A burst of frames arriving in one task
 * collapses to a single re-render carrying only the last one, so anything that must act on
 * each frame — narration — cannot read them off `lastEvent`.
 */
export function subscribeToEvents(listener: FrameListener, url = '/api/events'): () => void {
  const s = ensure(url)
  s.frameListeners.add(listener)
  return () => {
    s.frameListeners.delete(listener)
    closeIfIdle(url, s)
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
