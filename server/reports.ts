import { db } from './db'
import type {
  OrderState,
  ReportSummary,
  Vendor,
  VendorLeverage,
  VendorScorecard,
  VendorStat,
} from '../shared/types'

const ORDER_STATES: OrderState[] = [
  'ordered',
  'dispatched',
  'in_transit',
  'delivered',
  'pickup_pending',
  'pickup_overdue',
  'picked_up',
  'cancelled',
]

export const CALLS_AVOIDED_DEFINITION =
  'Status updates this system received without a human picking up a phone: inbound vendor texts the AI parsed confidently enough to auto-apply, updates the vendor recorded themselves (every vendor-actor event in the ledger, including magic-link portal taps), pickups triggered by a nurse tap or the EMR webhook, and household confirmations — replies a family sent by text, counted separately because a family confirming a delivery or rating equipment is a call a case manager did not make. Messages routed to human review are not counted. Computed from the event ledger on every request, never stored.'

function count(sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n
}

export function vendorScorecards(): VendorScorecard[] {
  const vendors = db.prepare('SELECT * FROM vendors ORDER BY name').all() as Vendor[]
  const stats = db
    .prepare('SELECT * FROM vendor_stats ORDER BY hcpcs_code, day_of_week')
    .all() as VendorStat[]

  return vendors.map((vendor) => {
    const own = stats.filter((s) => s.vendor_id === vendor.id)
    const totalSamples = own.reduce((sum, s) => sum + s.sample_size, 0)
    const weighted = own.reduce((sum, s) => sum + s.on_time_rate * s.sample_size, 0)
    return {
      vendor,
      overall_on_time_rate: totalSamples ? weighted / totalSamples : null,
      total_samples: totalSamples,
      stats: own,
    }
  })
}

export const LEVERAGE_DEFINITION =
  'Computed live from the event ledger on every request, never from the seeded scorecard history. A delivery is verified when a driver POD (photo/signature) exists for it, claimed when the only evidence is the vendor saying so. On-time compares the first delivered event’s timestamp against the order’s target. The trust gap is claimed-on-time minus verified-on-time — a vendor whose word consistently outruns their PODs earns a bigger gap — and is only reported once both cohorts have 10 deliveries, because a gap built on a handful of orders is noise. Interventions count automated ack chases plus escalations — each one is staff time the vendor cost us.'

/** A trust gap over fewer deliveries than this per cohort is noise, not a finding. */
export const MIN_TRUST_COHORT = 10

export function vendorLeverage(): VendorLeverage[] {
  const vendors = db.prepare('SELECT * FROM vendors ORDER BY name').all() as Vendor[]
  const orders = db.prepare('SELECT id, vendor_id, target_at FROM orders').all() as {
    id: number
    vendor_id: number
    target_at: string | null
  }[]
  // First delivered event per order — ISO-8601 UTC strings, so MIN() is the earliest.
  const deliveredAt = new Map<number, string>()
  for (const row of db
    .prepare("SELECT order_id, MIN(created_at) AS at FROM order_events WHERE type = 'delivered' GROUP BY order_id")
    .all() as { order_id: number; at: string }[]) {
    deliveredAt.set(row.order_id, row.at)
  }
  const verified = new Set(
    (db.prepare("SELECT DISTINCT order_id FROM pods WHERE kind = 'delivery'").all() as { order_id: number }[]).map(
      (r) => r.order_id,
    ),
  )
  const nagsByVendor = new Map<number, number>()
  for (const row of db
    .prepare("SELECT vendor_id, COUNT(*) AS n FROM messages WHERE direction = 'out' AND template = 'v_ack_nag' GROUP BY vendor_id")
    .all() as { vendor_id: number; n: number }[]) {
    nagsByVendor.set(row.vendor_id, row.n)
  }
  const escalationsByVendor = new Map<number, number>()
  for (const row of db
    .prepare('SELECT o.vendor_id, COUNT(*) AS n FROM escalations e JOIN orders o ON o.id = e.order_id GROUP BY o.vendor_id')
    .all() as { vendor_id: number; n: number }[]) {
    escalationsByVendor.set(row.vendor_id, row.n)
  }

  return vendors.map((vendor) => {
    const own = orders.filter((o) => o.vendor_id === vendor.id)
    let verifiedCount = 0
    let verifiedOnTime = 0
    let claimedCount = 0
    let claimedOnTime = 0
    for (const order of own) {
      const at = deliveredAt.get(order.id)
      if (!at || !order.target_at) continue
      const onTime = Date.parse(at) <= Date.parse(order.target_at)
      if (verified.has(order.id)) {
        verifiedCount++
        if (onTime) verifiedOnTime++
      } else {
        claimedCount++
        if (onTime) claimedOnTime++
      }
    }
    const verifiedRate = verifiedCount ? verifiedOnTime / verifiedCount : null
    const claimedRate = claimedCount ? claimedOnTime / claimedCount : null
    const nags = nagsByVendor.get(vendor.id) ?? 0
    const escalations = escalationsByVendor.get(vendor.id) ?? 0
    return {
      vendor,
      orders_total: own.length,
      deliveries_measured: verifiedCount + claimedCount,
      verified_deliveries: verifiedCount,
      verified_on_time_rate: verifiedRate,
      claimed_deliveries: claimedCount,
      claimed_on_time_rate: claimedRate,
      trust_gap:
        verifiedRate !== null && claimedRate !== null && verifiedCount >= MIN_TRUST_COHORT && claimedCount >= MIN_TRUST_COHORT
          ? claimedRate - verifiedRate
          : null,
      nags_sent: nags,
      escalations,
      interventions_per_order: own.length ? (nags + escalations) / own.length : null,
    }
  })
}

function autoTriggeredPickups(): number {
  const rows = db
    .prepare("SELECT payload FROM order_events WHERE type = 'pickup_triggered'")
    .all() as { payload: string | null }[]
  return rows.filter((row) => {
    const source = row.payload ? (JSON.parse(row.payload) as { source?: string }).source : undefined
    return source === 'nurse' || source === 'emr'
  }).length
}

function pickupLatency(): ReportSummary['pickup_latency'] {
  const events = db
    .prepare("SELECT order_id, type, created_at FROM order_events WHERE type IN ('pickup_triggered', 'picked_up') ORDER BY id")
    .all() as { order_id: number; type: string; created_at: string }[]

  const openTriggers = new Map<number, string>()
  const hours: number[] = []
  for (const event of events) {
    if (event.type === 'pickup_triggered') {
      if (!openTriggers.has(event.order_id)) openTriggers.set(event.order_id, event.created_at)
      continue
    }
    const triggeredAt = openTriggers.get(event.order_id)
    if (!triggeredAt) continue
    openTriggers.delete(event.order_id)
    hours.push((Date.parse(event.created_at) - Date.parse(triggeredAt)) / 3_600_000)
  }

  return {
    average_hours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
    sample_size: hours.length,
  }
}

export function reportSummary(): ReportSummary {
  const breakdown = {
    auto_applied_messages: count(
      "SELECT COUNT(*) AS n FROM messages WHERE direction = 'in' AND review_status = 'auto_applied' AND recipient_type = 'vendor'",
    ),
    vendor_self_service_updates: count("SELECT COUNT(*) AS n FROM order_events WHERE actor = 'vendor'"),
    auto_triggered_pickups: autoTriggeredPickups(),
    household_confirmations: count(
      "SELECT COUNT(*) AS n FROM messages WHERE direction = 'in' AND review_status = 'auto_applied' AND recipient_type = 'family'",
    ),
  }

  const ordersByState = Object.fromEntries(ORDER_STATES.map((s) => [s, 0])) as Record<OrderState, number>
  for (const row of db.prepare('SELECT state, COUNT(*) AS n FROM orders GROUP BY state').all() as {
    state: OrderState
    n: number
  }[]) {
    ordersByState[row.state] = row.n
  }

  return {
    calls_avoided: Object.values(breakdown).reduce((sum, n) => sum + n, 0),
    calls_avoided_definition: CALLS_AVOIDED_DEFINITION,
    calls_avoided_breakdown: breakdown,
    open_escalations: count("SELECT COUNT(*) AS n FROM escalations WHERE status = 'open'"),
    orders_by_state: ordersByState,
    pickup_latency: pickupLatency(),
  }
}
