import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

const PULSE_MS = 1600

interface Highlight {
  pulse: (orderId: number) => void
  /** Board rows group several orders under one patient, so membership is the question, not identity. */
  isPulsing: (orderIds: number[]) => boolean
}

const HighlightContext = createContext<Highlight>({ pulse: () => {}, isPulsing: () => false })

export function HighlightProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<number[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const pulse = useCallback((orderId: number) => {
    const running = timers.current.get(orderId)
    if (running) clearTimeout(running)
    timers.current.set(
      orderId,
      setTimeout(() => {
        timers.current.delete(orderId)
        setLive((ids) => ids.filter((id) => id !== orderId))
      }, PULSE_MS),
    )
    setLive((ids) => (ids.includes(orderId) ? ids : [...ids, orderId]))
  }, [])

  const value = useMemo<Highlight>(
    () => ({ pulse, isPulsing: (orderIds) => orderIds.some((id) => live.includes(id)) }),
    [pulse, live],
  )

  return <HighlightContext.Provider value={value}>{children}</HighlightContext.Provider>
}

export function useHighlight(): Highlight {
  return useContext(HighlightContext)
}
