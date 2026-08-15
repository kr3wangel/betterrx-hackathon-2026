import { db } from '../server/db'
import { computeRisk, RISK_THRESHOLD } from '../server/risk'
import { listOrders, vendorStats } from '../server/store'
import type { Order, OrderState } from '../shared/types'

/**
 * Backtest the risk engine against the seeded history — SYNTHETIC data, and the output
 * says so. Every order is replayed tick by tick exactly as the watchdog would have seen
 * it live: state rebuilt from the event ledger (ordered until the vendor accepted, no
 * ETA known before one was set), scored with computeRisk at each half-hour, and a flag
 * only counts if it fired BEFORE the deadline — flagging an order after its deadline
 * passed is observation, not prediction.
 *
 * Run AFTER seeding (npm run seed && npm run backtest). Numbers move a little with the
 * seed date because risk keys off the target-date weekday — re-run on demo morning and
 * quote what it prints, not what a doc remembers.
 */

const TICK_MS = 30 * 60_000

interface Replay {
  late: boolean
  flaggedAt: Date | null
  leadHours: number | null
}

function firstEventAt(orderId: number, type: string): Date | null {
  const row = db
    .prepare('SELECT MIN(created_at) AS at FROM order_events WHERE order_id = ? AND type = ?')
    .get(orderId, type) as { at: string | null }
  return row.at ? new Date(row.at) : null
}

function replay(order: Order, threshold: number): Replay | null {
  if (!order.target_at) return null
  const deliveredAt = firstEventAt(order.id, 'delivered')
  if (!deliveredAt) return null
  const placedAt = new Date(order.created_at)
  const target = new Date(order.target_at)
  const acceptedAt = firstEventAt(order.id, 'vendor_accepted')
  const stats = vendorStats(order.vendor_id)
  const late = deliveredAt > target

  // Only ticks before BOTH the deadline and the delivery can claim foresight.
  const end = Math.min(target.getTime(), deliveredAt.getTime())
  for (let t = placedAt.getTime() + TICK_MS; t < end; t += TICK_MS) {
    const now = new Date(t)
    const state: OrderState = acceptedAt && now >= acceptedAt ? 'dispatched' : 'ordered'
    const snapshot: Order = { ...order, state, eta_at: null, risk_score: null, risk_reasons: null }
    if (computeRisk(snapshot, stats, now).score >= threshold) {
      return { late, flaggedAt: now, leadHours: (target.getTime() - t) / 3_600_000 }
    }
  }
  return { late, flaggedAt: null, leadHours: null }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}%` : '—')

const orders = listOrders()
console.log('SYNTHETIC BACKTEST — simulated order history, real risk engine, replayed honestly.')
console.log(`${orders.length} orders in the database; scoring the ones that reached delivery with a deadline.\n`)

for (const threshold of [50, RISK_THRESHOLD, 90]) {
  const runs = orders.map((o) => replay(o, threshold)).filter((r): r is Replay => r !== null)
  const late = runs.filter((r) => r.late)
  const lateFlagged = late.filter((r) => r.flaggedAt !== null)
  const onTime = runs.filter((r) => !r.late)
  const falsePositives = onTime.filter((r) => r.flaggedAt !== null)
  const leads = lateFlagged.map((r) => r.leadHours!)

  const marker = threshold === RISK_THRESHOLD ? '  ← shipped threshold' : ''
  console.log(`threshold ${threshold}${marker}`)
  console.log(
    `  caught ${lateFlagged.length}/${late.length} late deliveries (${pct(lateFlagged.length, late.length)}) before the deadline` +
      (leads.length ? `, median warning ${median(leads).toFixed(1)}h early` : ''),
  )
  console.log(
    `  false alarms on ${falsePositives.length}/${onTime.length} on-time deliveries (${pct(falsePositives.length, onTime.length)})\n`,
  )
}

console.log('Slide sentence (threshold 70):')
const runs = orders.map((o) => replay(o, RISK_THRESHOLD)).filter((r): r is Replay => r !== null)
const late = runs.filter((r) => r.late)
const caught = late.filter((r) => r.flaggedAt !== null)
const onTime = runs.filter((r) => !r.late)
const fp = onTime.filter((r) => r.flaggedAt !== null)
const leads = caught.map((r) => r.leadHours!)
console.log(
  `  "On a SYNTHETIC year, the risk engine flagged ${pct(caught.length, late.length)} of late deliveries a median ` +
    `${leads.length ? median(leads).toFixed(1) : '—'} hours before the deadline, with false alarms on ${pct(fp.length, onTime.length)} of on-time orders (n=${runs.length})."`,
)
