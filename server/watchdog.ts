import { applyEvent, escalate } from './statemachine'
import { computeRisk, RISK_THRESHOLD } from './risk'
import { listOrders, vendorStats } from './store'

const ACTIVE = ['ordered', 'dispatched', 'in_transit']
const PICKUP_WINDOW_HOURS = Number(process.env.PICKUP_WINDOW_HOURS ?? 24)

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

    if (order.state === 'pickup_pending') {
      const triggeredAt = order.eta_at ?? order.created_at
      const hours = (now.getTime() - new Date(triggeredAt).getTime()) / 3_600_000
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
