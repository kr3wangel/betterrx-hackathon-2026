import type { Request, Response } from 'express'
import type { ServerEvent } from '../shared/types'

const clients = new Set<Response>()

export function sseHandler(req: Request, res: Response) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.flushHeaders()
  res.write('retry: 3000\n\n')
  clients.add(res)
  req.on('close', () => clients.delete(res))
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export function broadcast(event: DistributiveOmit<ServerEvent, 'at'> & { at?: string }) {
  const payload = `data: ${JSON.stringify({ ...event, at: event.at ?? new Date().toISOString() })}\n\n`
  for (const res of clients) res.write(payload)
}
