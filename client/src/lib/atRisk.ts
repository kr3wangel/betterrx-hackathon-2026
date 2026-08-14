import type { Order } from '../../../shared/types'

// Keep in sync with server/risk.ts RISK_THRESHOLD (70). Kept as a local const so these
// pure helpers carry no React import and stay unit-testable in the server test env.
export const RISK_THRESHOLD = 70

function fmtDue(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/**
 * Orders that need a person right now: at-risk by score (≥70), or about to miss a
 * delivery/pickup deadline. Pure + unit-free so it can be unit-tested and memoized.
 * Returned most-urgent-first.
 */
export function selectNeedsAttention(orders: Order[], now: Date = new Date()): Order[] {
  return orders
    .filter((o) => isNeedsAttention(o, now))
    .sort((a, b) => attentionRank(b, now) - attentionRank(a, now))
}

export function isNeedsAttention(order: Order, now: Date = new Date()): boolean {
  if (order.state === 'picked_up' || order.state === 'cancelled') return false
  if ((order.risk_score ?? 0) >= RISK_THRESHOLD) return true
  if (order.state === 'pickup_overdue') return true
  // Pre-delivery orders whose target deadline is in the past or within the danger window.
  const preDelivery = ['ordered', 'dispatched', 'in_transit'].includes(order.state)
  if (preDelivery && order.target_at) {
    const hoursLeft = (new Date(order.target_at).getTime() - now.getTime()) / 3_600_000
    if (hoursLeft <= DEADLINE_WINDOW_HOURS) return true
  }
  return false
}

const DEADLINE_WINDOW_HOURS = 24

// Higher = more urgent. Overdue outranks everything, then risk score, then deadline nearness.
function attentionRank(order: Order, now: Date): number {
  let rank = order.risk_score ?? 0
  if (order.state === 'pickup_overdue') rank += 1000
  if (order.target_at) {
    const hoursLeft = (new Date(order.target_at).getTime() - now.getTime()) / 3_600_000
    if (hoursLeft <= DEADLINE_WINDOW_HOURS) rank += Math.max(0, 100 - hoursLeft)
  }
  return rank
}

/**
 * The board's live working set. The seed carries a long tail of historical orders that
 * exist only to feed vendor scorecards; showing all of them would bury today's work.
 * Keep everything still in motion (not yet done) plus orders from the recent window, so
 * the board reads like a real day — active orders and today's completed handoffs.
 */
export function selectBoardOrders(orders: Order[], now: Date = new Date()): Order[] {
  const windowStart = now.getTime() - BOARD_WINDOW_HOURS * 3_600_000
  const done = (o: Order) => o.state === 'picked_up' || o.state === 'cancelled' || o.state === 'delivered'
  return orders.filter((o) => !done(o) || new Date(o.created_at).getTime() >= windowStart)
}

const BOARD_WINDOW_HOURS = 36

/**
 * A human deadline sentence for an at-risk card. Falls back to the raw due time.
 */
export function deadlineSentence(order: Order, now: Date = new Date()): string | null {
  if (order.state === 'pickup_overdue') {
    return 'Pickup window has passed — the equipment is still in the home.'
  }
  if (order.target_at) {
    const hoursLeft = (new Date(order.target_at).getTime() - now.getTime()) / 3_600_000
    if (hoursLeft < 0) return `Deadline passed ${fmtDue(order.target_at)}.`
    return `Needed by ${fmtDue(order.target_at)} — about ${Math.round(hoursLeft)} hours out.`
  }
  return null
}
