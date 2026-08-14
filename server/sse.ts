import type { Request, Response } from 'express'

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

export function broadcast(event: unknown) {
  const payload = `data: ${JSON.stringify(event)}\n\n`
  for (const res of clients) res.write(payload)
}
