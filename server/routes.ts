import { Router } from 'express'
import { writeFileSync } from 'node:fs'
import { db } from './db'
import { applyEvent, escalate } from './statemachine'
import { getOrder, getVendor, listOrders, listOrderEvents, rowToMessage } from './store'
import { handleInbound, applyParsed, sendToVendor, orderRequestText } from './messaging'
import { setPatientStatus } from './pickups'
import { resolveToken, portalOrders, portalConfirm, portalSetEta, portalDecline } from './portal'
import type { Escalation, ParsedMessage, Patient, PatientStatus, Vendor } from '../shared/types'

export const routes = Router()

routes.get('/patients', (_req, res) => {
  res.json(db.prepare('SELECT * FROM patients ORDER BY name').all())
})

routes.get('/vendors', (_req, res) => {
  const vendors = db.prepare('SELECT * FROM vendors ORDER BY name').all() as Vendor[]
  const withStats = vendors.map((v) => ({
    ...v,
    avg_on_time_rate: (
      db.prepare('SELECT AVG(on_time_rate) AS r FROM vendor_stats WHERE vendor_id = ?').get(v.id) as { r: number | null }
    ).r,
  }))
  res.json(withStats)
})

routes.post('/orders', (req, res) => {
  const { patient_id, vendor_id, hcpcs_code, equipment_name, quantity, urgency, target_at } = req.body
  const result = db
    .prepare(
      'INSERT INTO orders (patient_id, vendor_id, hcpcs_code, equipment_name, quantity, urgency, target_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(patient_id, vendor_id, hcpcs_code, equipment_name, quantity ?? 1, urgency ?? 'routine', target_at ?? null)
  const orderId = Number(result.lastInsertRowid)
  const order = applyEvent(orderId, 'order_placed', null, 'hospice')

  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patient_id) as Patient | undefined
  sendToVendor(vendor_id, orderId, orderRequestText(order, patient?.market ?? ''))
  res.status(201).json(order)
})

routes.get('/orders', (req, res) => {
  res.json(listOrders(req.query.state as string | undefined))
})

routes.get('/orders/:id', (req, res) => {
  const order = getOrder(Number(req.params.id))
  if (!order) return res.status(404).json({ error: 'order not found' })
  res.json({
    order,
    events: listOrderEvents(order.id),
    messages: (db.prepare('SELECT * FROM messages WHERE order_id = ? ORDER BY id').all(order.id) as never[]).map(rowToMessage),
    escalations: db.prepare('SELECT * FROM escalations WHERE order_id = ?').all(order.id),
    pods: db.prepare('SELECT * FROM pods WHERE order_id = ?').all(order.id),
  })
})

routes.post('/orders/:id/events', (req, res) => {
  const { type, payload, actor } = req.body
  res.json(applyEvent(Number(req.params.id), type, payload ?? null, actor ?? 'hospice'))
})

routes.post('/orders/:id/swap-vendor', (req, res) => {
  const orderId = Number(req.params.id)
  const newVendorId = Number(req.body.vendor_id)
  if (!getVendor(newVendorId)) return res.status(400).json({ error: 'unknown vendor' })
  const order = applyEvent(orderId, 'vendor_swapped', { vendor_id: newVendorId }, 'hospice')
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(order.patient_id) as Patient | undefined
  sendToVendor(newVendorId, orderId, orderRequestText(order, patient?.market ?? ''))
  db.prepare("UPDATE escalations SET status = 'resolved' WHERE order_id = ? AND status = 'open'").run(orderId)
  res.json(order)
})

routes.post('/orders/:id/cancel', (req, res) => {
  res.json(applyEvent(Number(req.params.id), 'cancelled', null, 'hospice'))
})

routes.post('/orders/:id/pod', (req, res) => {
  const orderId = Number(req.params.id)
  const { kind, photo_data_url, signature_data_url } = req.body
  const saved: Record<string, string | null> = { photo_path: null, signature_path: null }
  for (const [field, dataUrl] of [
    ['photo_path', photo_data_url],
    ['signature_path', signature_data_url],
  ] as const) {
    if (!dataUrl) continue
    const path = `data/pods/${orderId}-${kind}-${field}.png`
    writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'))
    saved[field] = path
  }
  db.prepare('INSERT INTO pods (order_id, kind, photo_path, signature_path) VALUES (?, ?, ?, ?)').run(
    orderId,
    kind,
    saved.photo_path,
    saved.signature_path,
  )
  const order = applyEvent(orderId, kind === 'pickup' ? 'picked_up' : 'delivered', { pod: true }, 'driver')
  applyEvent(
    orderId,
    'family_notified',
    { text: kind === 'pickup' ? 'Equipment has been picked up. Thank you.' : 'Your equipment has been delivered.' },
    'system',
  )
  res.json(order)
})

routes.post('/patients/:id/status', (req, res) => {
  const { status } = req.body as { status: PatientStatus }
  res.json(setPatientStatus(Number(req.params.id), status, 'nurse'))
})

routes.post('/emr/patient-status', (req, res) => {
  const { patient_id, status } = req.body as { patient_id: number; status: PatientStatus }
  res.json(setPatientStatus(patient_id, status, 'emr'))
})

routes.get('/portal/:token', (req, res) => {
  const vendor = resolveToken(req.params.token)
  if (!vendor) return res.status(404).json({ error: 'unknown link' })
  res.json({ vendor, orders: portalOrders(vendor.id) })
})

routes.post('/portal/:token/orders/:id/confirm', (req, res) => {
  const vendor = resolveToken(req.params.token)
  if (!vendor) return res.status(404).json({ error: 'unknown link' })
  res.json(portalConfirm(vendor.id, Number(req.params.id), req.body?.eta_iso))
})

routes.post('/portal/:token/orders/:id/eta', (req, res) => {
  const vendor = resolveToken(req.params.token)
  if (!vendor) return res.status(404).json({ error: 'unknown link' })
  res.json(portalSetEta(vendor.id, Number(req.params.id), String(req.body.eta_iso)))
})

routes.post('/portal/:token/orders/:id/decline', (req, res) => {
  const vendor = resolveToken(req.params.token)
  if (!vendor) return res.status(404).json({ error: 'unknown link' })
  portalDecline(vendor.id, Number(req.params.id), req.body?.reason)
  res.json({ ok: true })
})

routes.post('/messages/inbound', async (req, res) => {
  const { vendor_id, body } = req.body
  res.json(await handleInbound(Number(vendor_id), String(body)))
})

routes.get('/messages', (req, res) => {
  const status = req.query.review_status as string | undefined
  const vendorId = req.query.vendor_id ? Number(req.query.vendor_id) : undefined
  let sql = 'SELECT * FROM messages'
  const where: string[] = []
  const params: unknown[] = []
  if (status) {
    where.push('review_status = ?')
    params.push(status)
  }
  if (vendorId) {
    where.push('vendor_id = ?')
    params.push(vendorId)
  }
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`
  sql += ' ORDER BY id'
  res.json((db.prepare(sql).all(...params) as never[]).map(rowToMessage))
})

routes.post('/messages/:id/confirm', (req, res) => {
  const id = Number(req.params.id)
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as never
  if (!row) return res.status(404).json({ error: 'message not found' })
  const message = rowToMessage(row)
  const parsed = (req.body.parsed as ParsedMessage | undefined) ?? message.parsed
  const orderId = (req.body.order_id as number | undefined) ?? message.order_id
  if (!parsed || !orderId) return res.status(400).json({ error: 'parsed payload and order_id required' })
  applyParsed(orderId, parsed, 'hospice')
  db.prepare("UPDATE messages SET review_status = 'confirmed', parsed = ?, order_id = ? WHERE id = ?").run(
    JSON.stringify(parsed),
    orderId,
    id,
  )
  res.json({ ok: true })
})

routes.post('/messages/:id/reject', (req, res) => {
  db.prepare("UPDATE messages SET review_status = 'rejected' WHERE id = ?").run(Number(req.params.id))
  res.json({ ok: true })
})

routes.get('/driver/jobs', (req, res) => {
  const vendorId = Number(req.query.vendor_id)
  const jobs = listOrders().filter(
    (o) =>
      o.vendor_id === vendorId &&
      ['dispatched', 'in_transit', 'pickup_pending', 'pickup_overdue'].includes(o.state),
  )
  res.json(jobs)
})

routes.get('/escalations', (req, res) => {
  const status = (req.query.status as string) ?? 'open'
  res.json(db.prepare('SELECT * FROM escalations WHERE status = ? ORDER BY id DESC').all(status) as Escalation[])
})

routes.post('/escalations/:id/ack', (req, res) => {
  db.prepare("UPDATE escalations SET status = 'acked' WHERE id = ?").run(Number(req.params.id))
  res.json({ ok: true })
})

export { escalate }
