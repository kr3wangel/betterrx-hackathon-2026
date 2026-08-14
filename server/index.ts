import 'dotenv/config'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import { db } from './db'
import { sseHandler } from './sse'
import { routes } from './routes'
import { startWatchdog, tick } from './watchdog'

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: db.pragma('user_version', { simple: true }), uptime: process.uptime() })
})

app.get('/api/events', sseHandler)
app.use('/api/pods', express.static('data/pods'))
app.use('/api', routes)

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(err.status ?? 500).json({ error: err.message })
})

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  console.log(`server listening on :${port}`)
  tick()
  startWatchdog()
})
