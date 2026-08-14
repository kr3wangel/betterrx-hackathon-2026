import { db } from './db'
import { applyEvent, escalate } from './statemachine'
import { ackNagText, sendToVendor } from './messaging'
import { computeRisk, RISK_THRESHOLD } from './risk'
import { listOrders, vendorStats } from './store'
import type { Order } from '../shared/types'

const ACTIVE = ['ordered', 'dispatched', 'in_transit']
const PICKUP_WINDOW_HOURS = Number(process.env.PICKUP_WINDOW_HOURS ?? 24)
const ACK_NAG_HOURS = Number(process.env.ACK_NAG_HOURS ?? 2)
const ACK_ESCALATE_HOURS = Number(process.env.ACK_ESCALATE_HOURS ?? 2)

function hoursSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 3_600_000
}

function requestAnchor(order: Order): string {
  const row = db
    .prepare(
      "SELECT created_at FROM order_events WHERE order_id = ? AND type IN ('order_placed', 'vendor_swapped') ORDER BY id DESC LIMIT 1",
    )
    .get(order.id) as { created_at: string } | undefined
  return row?.created_at ?? order.created_at
}

function pickupAnchor(order: Order): string {
  const triggered = db
    .prepare(
      "SELECT id, created_at FROM order_events WHERE order_id = ? AND type = 'pickup_triggered' ORDER BY id DESC LIMIT 1",
    )
    .get(order.id) as { id: number; created_at: string } | undefined
  if (!triggered) return order.created_at
  if (order.eta_at) {
    const etaSet = db
      .prepare("SELECT id FROM order_events WHERE order_id = ? AND type = 'eta_set' AND id > ? LIMIT 1")
      .get(order.id, triggered.id) as { id: number } | undefined
    if (etaSet) return order.eta_at
  }
  return triggered.created_at
}

function ackNagSentAt(order: Order, anchor: string): string | null {
  const row = db
    .prepare(
      "SELECT created_at FROM messages WHERE order_id = ? AND direction = 'out' AND body = ? AND created_at >= ? ORDER BY id DESC LIMIT 1",
    )
    .get(order.id, ackNagText(order), anchor) as { created_at: string } | undefined
  return row?.created_at ?? null
}

export function tick(now = new Date()): void {
  for (const order of listOrders()) {
    if (ACTIVE.includes(order.state)) {
      const { score, reasons } = computeRisk(order, vendorStats(order.vendor_id), now)
      const wasAtRisk = (order.risk_score ?? 0) >= RISK_THRESHOLD
      const isAtRisk = score >= RISK_THRESHOLD
      if (score !== (order.risk_score ?? 0)) {
        applyEvent(order.id, 'risk_updated', { score, reasons }, 'system')
      }
      if (isAtRisk && !wasAtRisk) {
        escalate(order.id, reasons.join('; ') || 'order at risk')
      }
    }

    if (order.state === 'ordered') {
      const anchor = requestAnchor(order)
      const nagSentAt = ackNagSentAt(order, anchor)
      if (!nagSentAt) {
        if (hoursSince(anchor, now) > ACK_NAG_HOURS) {
          sendToVendor(order.vendor_id, order.id, ackNagText(order))
        }
      } else if (hoursSince(nagSentAt, now) > ACK_ESCALATE_HOURS) {
        const h = Math.round(hoursSince(anchor, now))
        escalate(order.id, `No response to the automated check-in — order #${order.id} is still unconfirmed ${h}h after placement`)
      }
    }

    if (order.state === 'pickup_pending') {
      const hours = hoursSince(pickupAnchor(order), now)
      if (hours > PICKUP_WINDOW_HOURS) {
        applyEvent(order.id, 'pickup_overdue', { hours_waiting: Math.round(hours) }, 'system')
        escalate(order.id, `Pickup not completed after ${Math.round(hours)}h — family is still waiting`)
      }
    }
  }
}

export function startWatchdog(intervalMs = 30_000): void {
  setInterval(() => {
    try {
      tick()
    } catch (err) {
      console.error('[watchdog]', err)
    }
  }, intervalMs)
}
