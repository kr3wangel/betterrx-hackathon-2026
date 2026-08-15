import { db } from './db'
import { applyEvent, escalate } from './statemachine'
import { ackNagText, etaCheckText, sendVendorQuestion } from './messaging'
import { computeRisk, RISK_THRESHOLD } from './risk'
import { listOrders, vendorStats } from './store'
import type { Order } from '../shared/types'

const ACTIVE = ['ordered', 'dispatched', 'in_transit']
const PICKUP_WINDOW_HOURS = Number(process.env.PICKUP_WINDOW_HOURS ?? 24)
const ACK_NAG_HOURS = Number(process.env.ACK_NAG_HOURS ?? 2)
const ACK_ESCALATE_HOURS = Number(process.env.ACK_ESCALATE_HOURS ?? 2)
const ETA_CHECK_HOUR = Number(process.env.ETA_CHECK_HOUR ?? 8)

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

// Matched by template, not by body: the moment anyone makes the nag copy time-dependent
// ("still unconfirmed 5h after placement") body equality stops matching and the vendor
// gets re-nagged every thirty seconds, forever.
function ackNagSentAt(order: Order, anchor: string): string | null {
  const row = db
    .prepare(
      "SELECT created_at FROM messages WHERE order_id = ? AND direction = 'out' AND template = 'v_ack_nag' AND created_at >= ? ORDER BY id DESC LIMIT 1",
    )
    .get(order.id, anchor) as { created_at: string } | undefined
  return row?.created_at ?? null
}

function etaCheckSentToday(order: Order, now: Date): boolean {
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  return !!db
    .prepare(
      "SELECT id FROM messages WHERE order_id = ? AND direction = 'out' AND template = 'v_eta_check' AND created_at >= ?",
    )
    .get(order.id, midnight.toISOString())
}

function dueToday(order: Order, now: Date): boolean {
  if (!order.target_at) return false
  const target = new Date(order.target_at)
  return target.toDateString() === now.toDateString()
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
          // Reuses the original request's pair rather than spending a new one — the nag is
          // the same ask, so it must not put two live codes on one order.
          sendVendorQuestion(order.vendor_id, order.id, 'v_ack_nag', (digits) => ackNagText(order, digits))
        }
      } else if (hoursSince(anchor, now) > ACK_NAG_HOURS + ACK_ESCALATE_HOURS) {
        // Total-silence SLA, anchored to placement — which is what the escalation copy
        // claims ("still unconfirmed Nh after placement"). Anchoring to the nag instead
        // resets the vendor's clock whenever the nag goes out late (server just booted,
        // order backdated): 5h of silence would wait another 2h just because the nag is
        // fresh. The nag still always precedes the escalation — it went out on an earlier
        // tick or this branch is unreachable.
        const h = Math.round(hoursSince(anchor, now))
        escalate(order.id, `No response to the automated check-in — order #${order.id} is still unconfirmed ${h}h after placement`)
      }
    }

    if (
      (order.state === 'dispatched' || order.state === 'in_transit') &&
      dueToday(order, now) &&
      now.getHours() >= ETA_CHECK_HOUR &&
      !etaCheckSentToday(order, now)
    ) {
      sendVendorQuestion(order.vendor_id, order.id, 'v_eta_check', (digits) => etaCheckText(order, digits))
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
