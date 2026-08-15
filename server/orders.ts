import { db } from './db'
import { applyEvent } from './statemachine'
import { orderGroupText, orderRequestText, sendVendorQuestion } from './messaging'
import { resolveTargetAt } from './sla'
import type { Order, RoleId, Urgency } from '../shared/types'

export interface OrderItem {
  hcpcs_code: string
  equipment_name: string
  quantity?: number
}

export interface PlaceOrdersInput {
  patient_id: number
  vendor_id: number
  urgency?: Urgency
  target_at?: string | null
  items: OrderItem[]
}

/**
 * One placement, N order rows, ONE vendor text. Shared by the route and by tests — the
 * per-order state machine, risk, and PODs are untouched; the batching is only in the
 * asking. A single item keeps the classic v_order_request; two or more send one
 * v_order_group whose manifest rides message_orders, spending one reply pair for the
 * whole bundle (the answering fans back out per order, exactly like trip batching).
 */
export function placeOrders(input: PlaceOrdersInput, actorRole: RoleId | null = null): Order[] {
  const urgency = input.urgency ?? 'routine'
  const targetAt = resolveTargetAt(input.target_at, urgency)
  const insert = db.prepare(
    'INSERT INTO orders (patient_id, vendor_id, hcpcs_code, equipment_name, quantity, urgency, target_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )

  const orders = input.items.map((item) => {
    const result = insert.run(
      input.patient_id,
      input.vendor_id,
      item.hcpcs_code,
      item.equipment_name,
      item.quantity ?? 1,
      urgency,
      targetAt,
    )
    return applyEvent(Number(result.lastInsertRowid), 'order_placed', null, 'hospice', actorRole)
  })

  const patient = db.prepare('SELECT market FROM patients WHERE id = ?').get(input.patient_id) as
    | { market: string }
    | undefined
  const market = patient?.market ?? ''

  if (orders.length === 1) {
    sendVendorQuestion(input.vendor_id, orders[0].id, 'v_order_request', (digits) =>
      orderRequestText(orders[0], market, digits),
    )
  } else {
    sendVendorQuestion(
      input.vendor_id,
      orders[0].id,
      'v_order_group',
      (digits) => orderGroupText(orders, market, digits),
      orders.map((o) => o.id),
    )
  }
  return orders
}
