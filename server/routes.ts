import { Router } from 'express'
import { writeFileSync } from 'node:fs'
import { db } from './db'
import { applyEvent, escalate } from './statemachine'
import { getOrder, getVendor, listOrders, listOrderEvents, rowToMessage, rowToPod } from './store'
import { recordPodCondition } from './pods'
import {
  applyParsed,
  deliveredThanksText,
  pickedUpThanksText,
  sendToFamily,
  sendVendorQuestion,
  orderRequestText,
} from './messaging'
import { handleReply, handleVendorInbound, sendTemplate } from './sms'
import { setPatientStatus } from './pickups'
import { resolveTargetAt } from './sla'
import {
  resolveToken,
  resolveOrderToken,
  vendorToken,
  portalOrders,
  portalConfirm,
  portalSetEta,
  portalDecline,
} from './portal'
import {
  handleCaregiverReply,
  recordConditionReport,
  sendConditionCheck,
  vendorConditionStats,
} from './condition'
import { reportSummary, vendorLeverage, vendorScorecards } from './reports'
import {
  ROLE_IDS,
  type ConditionSource,
  type Escalation,
  type MessageTemplate,
  type ParsedMessage,
  type Patient,
  type PatientStatus,
  type RoleId,
  type Vendor,
} from '../shared/types'

export const routes = Router()

/**
 * Which internal persona is acting, from the X-Role header the client attaches on every
 * request. Mock auth — the header is trusted, not verified — but the ledger records it,
 * so "who cancelled this" has an answer. Anything unrecognised (vendors, curl, old
 * clients) is null, never a guess.
 */
function roleFrom(req: { get(name: string): string | undefined }): RoleId | null {
  const role = req.get('x-role')
  return ROLE_IDS.includes(role as RoleId) ? (role as RoleId) : null
}

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
  const resolvedUrgency = urgency ?? 'routine'
  const result = db
    .prepare(
      'INSERT INTO orders (patient_id, vendor_id, hcpcs_code, equipment_name, quantity, urgency, target_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      patient_id,
      vendor_id,
      hcpcs_code,
      equipment_name,
      quantity ?? 1,
      resolvedUrgency,
      resolveTargetAt(target_at, resolvedUrgency),
    )
  const orderId = Number(result.lastInsertRowid)
  const order = applyEvent(orderId, 'order_placed', null, 'hospice', roleFrom(req))

  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patient_id) as Patient | undefined
  sendVendorQuestion(vendor_id, orderId, 'v_order_request', (digits) =>
    orderRequestText(order, patient?.market ?? '', digits),
  )
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
    pods: (db.prepare('SELECT * FROM pods WHERE order_id = ?').all(order.id) as never[]).map(rowToPod),
  })
})

routes.post('/orders/:id/events', (req, res) => {
  const { type, payload, actor } = req.body
  res.json(applyEvent(Number(req.params.id), type, payload ?? null, actor ?? 'hospice', roleFrom(req)))
})

routes.post('/orders/:id/swap-vendor', (req, res) => {
  const orderId = Number(req.params.id)
  const newVendorId = Number(req.body.vendor_id)
  if (!getVendor(newVendorId)) return res.status(400).json({ error: 'unknown vendor' })
  const order = applyEvent(orderId, 'vendor_swapped', { vendor_id: newVendorId }, 'hospice', roleFrom(req))
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(order.patient_id) as Patient | undefined
  sendVendorQuestion(newVendorId, orderId, 'v_order_request', (digits) =>
    orderRequestText(order, patient?.market ?? '', digits),
  )
  db.prepare("UPDATE escalations SET status = 'resolved' WHERE order_id = ? AND status = 'open'").run(orderId)
  res.json(order)
})

routes.post('/orders/:id/cancel', (req, res) => {
  res.json(applyEvent(Number(req.params.id), 'cancelled', null, 'hospice', roleFrom(req)))
})

routes.post('/orders/:id/pod', (req, res) => {
  const orderId = Number(req.params.id)
  const { kind, photo_data_url, signature_data_url, condition } = req.body
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
  db.prepare('INSERT INTO pods (order_id, kind, photo_path, signature_path, condition) VALUES (?, ?, ?, ?, ?)').run(
    orderId,
    kind,
    saved.photo_path,
    saved.signature_path,
    recordPodCondition(orderId, kind, condition),
  )
  const order = applyEvent(orderId, kind === 'pickup' ? 'picked_up' : 'delivered', { pod: true }, 'driver', roleFrom(req))
  const thanks = kind === 'pickup' ? pickedUpThanksText() : deliveredThanksText(order)
  applyEvent(orderId, 'family_notified', { text: thanks }, 'system')
  sendToFamily(order.patient_id, orderId, thanks, kind === 'pickup' ? 'f_picked_up_thanks' : 'f_delivered_thanks')

  // Delivery is the one moment the household can see what actually arrived, so the
  // condition check rides along with proof of delivery. Never on a pickup — the guards
  // in server/condition.ts keep this channel silent once a patient has died. Wrapped so
  // a failure here can never break POD capture in front of a judge.
  let condition_check: { sent: boolean; reason?: string; body?: string } | null = null
  if (kind !== 'pickup') {
    try {
      condition_check = sendConditionCheck(orderId)
    } catch (err) {
      console.error('[condition] check failed:', err)
    }
  }

  res.json({ ...order, condition_check })
})

routes.post('/patients/:id/status', (req, res) => {
  const { status } = req.body as { status: PatientStatus }
  res.json(setPatientStatus(Number(req.params.id), status, 'nurse', roleFrom(req)))
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

/**
 * The order-specific magic link. Returns the vendor token too, so the one-order page can
 * post confirm / eta / decline through the same routes the full portal uses — one set of
 * mutations, one set of ownership checks, rather than a parallel pair that could drift.
 */
routes.get('/portal/order/:token', (req, res) => {
  const order = resolveOrderToken(req.params.token)
  if (!order) return res.status(404).json({ error: 'unknown link' })
  const vendor = getVendor(order.vendor_id)
  if (!vendor) return res.status(404).json({ error: 'unknown link' })
  res.json({ vendor, order, portal_token: vendorToken(vendor.id), open_orders: portalOrders(vendor.id).length })
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

/** What a gateway webhook would post: a sender and a body, nothing else. */
routes.post('/messages/inbound', async (req, res) => {
  const { vendor_id, body } = req.body
  res.json(await handleVendorInbound(Number(vendor_id), String(body)))
})

/** Thread-aware inbound: the caller knows a message id, the server derives everything else. */
routes.post('/messages/reply', async (req, res) => {
  const { reply_to_message_id, digit, body } = req.body
  res.json(await handleReply({ reply_to_message_id: Number(reply_to_message_id), digit, body }))
})

/** Fire any template on demand — the presenter's button for the morning-of ETA check. */
routes.post('/messages/send', (req, res) => {
  const { order_id, template } = req.body as { order_id: number; template: MessageTemplate }
  res.status(201).json(sendTemplate(Number(order_id), template))
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
    // Family rows carry the order's vendor as a join key only. Without this guard the
    // vendor's phone simulator would render household texts inside the vendor thread.
    where.push('vendor_id = ?', "recipient_type = 'vendor'")
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

// --- Caregiver equipment-condition channel -----------------------------------------
// The household is the only party that ever sees what actually arrived. See
// server/condition.ts for the three design constraints these routes enforce.

/** Send the 1-5 condition check to the caregiver. Returns the body so the demo can show it. */
routes.post('/orders/:id/condition-check', (req, res) => {
  const result = sendConditionCheck(Number(req.params.id))
  if (!result.sent) return res.status(409).json({ error: result.reason })
  res.json(result)
})

/** Simulated inbound caregiver SMS. Deterministic parse — no model call. */
routes.post('/orders/:id/condition-reply', (req, res) => {
  const body = String(req.body.body ?? '')
  if (!body.trim()) return res.status(400).json({ error: 'body required' })
  res.json(handleCaregiverReply(Number(req.params.id), body))
})

const CONDITION_SOURCES: ConditionSource[] = ['caregiver', 'nurse', 'driver']

/** Direct entry, for the nurse or driver rather than the household. */
routes.post('/orders/:id/condition', (req, res) => {
  const { score, source, comment } = req.body as { score: number; source?: string; comment?: string }
  if (source && !CONDITION_SOURCES.includes(source as ConditionSource)) {
    return res.status(400).json({ error: `source must be one of ${CONDITION_SOURCES.join(', ')}` })
  }
  res.json(
    recordConditionReport(Number(req.params.id), Number(score), {
      source: source as ConditionSource | undefined,
      comment,
    }),
  )
})

routes.get('/orders/:id/condition', (req, res) => {
  res.json(
    db
      .prepare('SELECT * FROM condition_reports WHERE order_id = ? ORDER BY id DESC')
      .all(Number(req.params.id)),
  )
})

/** Vendor scorecard input — the reason for collecting any of this. */
routes.get('/vendors/condition', (_req, res) => {
  res.json(vendorConditionStats())
})

routes.get('/reports/vendor-scorecards', (_req, res) => {
  res.json(vendorScorecards())
})

routes.get('/reports/summary', (_req, res) => {
  res.json(reportSummary())
})

routes.get('/reports/vendor-leverage', (_req, res) => {
  res.json(vendorLeverage())
})

export { escalate }
