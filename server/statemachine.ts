import { db } from './db'
import { broadcast } from './sse'
import { getOrder } from './store'
import type { Actor, Order, OrderEventType, OrderState } from '../shared/types'

const ACTIVE_STATES: OrderState[] = ['ordered', 'dispatched', 'in_transit', 'pickup_pending', 'pickup_overdue']
const PRE_DELIVERED: OrderState[] = ['ordered', 'dispatched', 'in_transit']

const TRANSITIONS: Record<OrderEventType, { from: OrderState[]; to: OrderState | null }> = {
  order_placed: { from: [], to: 'ordered' },
  vendor_accepted: { from: ['ordered'], to: 'dispatched' },
  eta_set: { from: ['ordered', 'dispatched', 'in_transit', 'pickup_pending', 'pickup_overdue'], to: null },
  out_for_delivery: { from: ['dispatched', 'ordered'], to: 'in_transit' },
  delivered: { from: ['in_transit', 'dispatched'], to: 'delivered' },
  pickup_triggered: { from: ['delivered'], to: 'pickup_pending' },
  pickup_overdue: { from: ['pickup_pending'], to: 'pickup_overdue' },
  picked_up: { from: ['pickup_pending', 'pickup_overdue'], to: 'picked_up' },
  vendor_swapped: { from: PRE_DELIVERED, to: 'ordered' },
  cancelled: { from: PRE_DELIVERED, to: 'cancelled' },
  risk_updated: { from: ACTIVE_STATES, to: null },
  family_notified: { from: ['delivered', 'picked_up', 'pickup_pending'], to: null },
  family_confirmed: { from: ['delivered', 'pickup_pending', 'pickup_overdue', 'picked_up'], to: null },
}

export class TransitionError extends Error {
  status = 409
}

export function applyEvent(
  orderId: number,
  type: OrderEventType,
  payload: Record<string, unknown> | null,
  actor: Actor,
): Order {
  const order = getOrder(orderId)
  if (!order) throw Object.assign(new Error(`order ${orderId} not found`), { status: 404 })

  const rule = TRANSITIONS[type]
  if (!rule) throw new TransitionError(`unknown event type ${type}`)
  if (type !== 'order_placed' && !rule.from.includes(order.state)) {
    throw new TransitionError(`cannot apply ${type} while order ${orderId} is ${order.state}`)
  }

  const updates: string[] = []
  const params: Record<string, unknown> = { id: orderId }

  if (rule.to) {
    updates.push('state = @state')
    params.state = rule.to
  }
  if ((type === 'eta_set' || type === 'vendor_accepted') && payload?.eta_iso) {
    updates.push('eta_at = @eta')
    params.eta = payload.eta_iso
  }
  if (type === 'vendor_swapped' && payload?.vendor_id) {
    updates.push('vendor_id = @vendor_id', 'eta_at = NULL', 'risk_score = NULL, risk_reasons = NULL')
    params.vendor_id = payload.vendor_id
  }
  if (type === 'risk_updated') {
    updates.push('risk_score = @score', 'risk_reasons = @reasons')
    params.score = payload?.score ?? null
    params.reasons = JSON.stringify(payload?.reasons ?? [])
  }
  if (updates.length) {
    db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = @id`).run(params)
  }

  db.prepare('INSERT INTO order_events (order_id, type, payload, actor) VALUES (?, ?, ?, ?)').run(
    orderId,
    type,
    payload ? JSON.stringify(payload) : null,
    actor,
  )

  const updated = getOrder(orderId)!
  broadcast({ type: 'order_event', order_id: orderId, event_type: type, state: updated.state })
  return updated
}

export function escalate(orderId: number, reason: string): void {
  const existing = db
    .prepare("SELECT id FROM escalations WHERE order_id = ? AND status = 'open'")
    .get(orderId) as { id: number } | undefined
  if (existing) return
  const result = db.prepare('INSERT INTO escalations (order_id, reason) VALUES (?, ?)').run(orderId, reason)
  broadcast({ type: 'escalation', order_id: orderId, escalation_id: Number(result.lastInsertRowid) })
}
