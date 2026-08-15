import { db } from './db'
import { CATALOG } from '../shared/catalog'
import { applyEvent } from './statemachine'
import { orderRequestText, sendVendorQuestion } from './messaging'
import { resolveTargetAt } from './sla'

// The V5 recurring-order scheduler, run from the watchdog tick. A delivered consumable
// whose Medicare replacement window has elapsed gets its next order placed automatically —
// same state machine, same vendor text, actor 'system', linked to its predecessor via
// payload.resupply_of (which is also the idempotency key: one successor, ever).
const CONSUMABLE_DAYS = new Map(
  CATALOG.filter((c) => c.resupply_days).map((c) => [c.hcpcs_code, c.resupply_days!]),
)
const CODES = [...CONSUMABLE_DAYS.keys()]

interface DueRow {
  id: number
  patient_id: number
  vendor_id: number
  hcpcs_code: string
  equipment_name: string
  quantity: number
  delivered_at: string | null
  patient_status: string
  market: string
}

export function scheduleResupplies(now = new Date()): void {
  if (!CODES.length) return
  const rows = db
    .prepare(
      `SELECT o.id, o.patient_id, o.vendor_id, o.hcpcs_code, o.equipment_name, o.quantity,
              (SELECT MIN(created_at) FROM order_events WHERE order_id = o.id AND type = 'delivered') AS delivered_at,
              p.status AS patient_status, p.market
         FROM orders o JOIN patients p ON p.id = o.patient_id
        WHERE o.state = 'delivered' AND o.hcpcs_code IN (${CODES.map(() => '?').join(',')})`,
    )
    .all(...CODES) as DueRow[]

  for (const row of rows) {
    if (!row.delivered_at) continue
    // A deceased or discharged patient must never be auto-resupplied.
    if (row.patient_status !== 'active') continue
    const days = CONSUMABLE_DAYS.get(row.hcpcs_code)!
    if (new Date(row.delivered_at).getTime() + days * 86_400_000 > now.getTime()) continue
    const successor = db
      .prepare(
        "SELECT id FROM order_events WHERE type = 'order_placed' AND json_extract(payload, '$.resupply_of') = ?",
      )
      .get(row.id)
    if (successor) continue

    const result = db
      .prepare(
        'INSERT INTO orders (patient_id, vendor_id, hcpcs_code, equipment_name, quantity, urgency, target_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        row.patient_id,
        row.vendor_id,
        row.hcpcs_code,
        row.equipment_name,
        row.quantity ?? 1,
        'routine',
        resolveTargetAt(null, 'routine', now),
      )
    const order = applyEvent(
      Number(result.lastInsertRowid),
      'order_placed',
      { source: 'resupply', resupply_of: row.id },
      'system',
    )
    sendVendorQuestion(row.vendor_id, order.id, 'v_order_request', (digits) =>
      orderRequestText(order, row.market ?? '', digits),
    )
  }
}
