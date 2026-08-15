import { db } from './db'
import { orderRequestText, sendVendorQuestion } from './messaging'
import { broadcast } from './sse'
import { getOrder } from './store'
import { byCode } from '../shared/catalog'
import type { Order, Patient } from '../shared/types'

/**
 * Beehive is M–F 9–5, so a routine deadline that would land on their weekend is quoted for
 * the Monday. Keeps the staged order off the at-risk panel on every demo date: it has to be
 * flagged by SILENCE, not by a weekend risk score that fires the moment it is staged.
 */
export function nextBusinessDeadline(h: number, from = Date.now()): number {
  const day = new Date(from + h * 3_600_000).getDay()
  return day === 6 ? h + 48 : day === 0 ? h + 24 : h
}

export class DemoStageError extends Error {
  status = 409
}

const SILENCE = {
  order_id: 1061,
  patient: 'Eleanor Vance',
  vendor: 'Beehive DME Co',
  code: 'K0001',
  placed_hours_ago: 5,
  target_hours: 44,
}

const OPEN_STATES = ['ordered', 'dispatched', 'in_transit']

/**
 * Stage scenario 3's silence beat on demand: an order placed five hours ago that nobody
 * answered, so the next watchdog tick nags and the tick after escalates.
 *
 * The seed can't hold this one — the ladder is clock-driven from `order_placed`, so a
 * pre-staged Eleanor would fire her escalation during scenario 1.
 */
export function stageSilence(): Order {
  const patient = db.prepare('SELECT * FROM patients WHERE name = ?').get(SILENCE.patient) as Patient | undefined
  const vendor = db.prepare('SELECT id FROM vendors WHERE name = ?').get(SILENCE.vendor) as
    | { id: number }
    | undefined
  if (!patient || !vendor) {
    throw new DemoStageError(`run the seed first — ${SILENCE.patient} or ${SILENCE.vendor} is missing`)
  }

  const open = db
    .prepare(`SELECT id FROM orders WHERE patient_id = ? AND state IN (${OPEN_STATES.map(() => '?').join(',')})`)
    .get(patient.id, ...OPEN_STATES) as { id: number } | undefined
  if (open) throw new DemoStageError(`already staged — order #${open.id} is still open for ${patient.name}`)

  const item = byCode(SILENCE.code)!
  const placedAt = new Date(Date.now() - SILENCE.placed_hours_ago * 3_600_000).toISOString()
  const targetAt = new Date(Date.now() + nextBusinessDeadline(SILENCE.target_hours) * 3_600_000).toISOString()
  const taken = db.prepare('SELECT id FROM orders WHERE id = ?').get(SILENCE.order_id)

  const result = db
    .prepare(
      'INSERT INTO orders (id, patient_id, vendor_id, hcpcs_code, equipment_name, quantity, urgency, target_at, state, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)',
    )
    .run(
      taken ? null : SILENCE.order_id,
      patient.id,
      vendor.id,
      SILENCE.code,
      item.equipment_name,
      'routine',
      targetAt,
      'ordered',
      placedAt,
    )
  const id = Number(result.lastInsertRowid)

  // Not applyEvent(): requestAnchor() reads this row, and the ladder only fires on the next
  // tick if the event itself is backdated, not just created_at.
  db.prepare(
    "INSERT INTO order_events (order_id, type, payload, actor, created_at) VALUES (?, 'order_placed', NULL, 'hospice', ?)",
  ).run(id, placedAt)

  const order = getOrder(id)!
  sendVendorQuestion(vendor.id, id, 'v_order_request', (digits) =>
    orderRequestText(order, patient.market ?? '', digits),
  )
  broadcast({ type: 'order_event', order_id: id, event_type: 'order_placed', state: 'ordered' })
  return order
}
