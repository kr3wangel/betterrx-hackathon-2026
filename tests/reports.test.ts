import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../server/db'
import { reportSummary, vendorScorecards } from '../server/reports'
import { seedFixtures, seedOrder } from './helpers'

beforeEach(() => {
  seedFixtures()
})

function insertStat(
  vendorId: number,
  hcpcsCode: string,
  dayOfWeek: number,
  onTimeRate: number,
  sampleSize: number,
  avgDeliveryHours = 6,
) {
  db.prepare(
    'INSERT INTO vendor_stats (vendor_id, hcpcs_code, day_of_week, on_time_rate, avg_delivery_hours, sample_size) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(vendorId, hcpcsCode, dayOfWeek, onTimeRate, avgDeliveryHours, sampleSize)
}

function insertEvent(
  orderId: number,
  type: string,
  payload: Record<string, unknown> | null,
  actor: string,
  createdAt = new Date().toISOString(),
) {
  db.prepare(
    'INSERT INTO order_events (order_id, type, payload, actor, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(orderId, type, payload ? JSON.stringify(payload) : null, actor, createdAt)
}

function insertMessage(vendorId: number, direction: 'in' | 'out', reviewStatus: string | null) {
  db.prepare(
    'INSERT INTO messages (order_id, vendor_id, direction, body, review_status) VALUES (NULL, ?, ?, ?, ?)',
  ).run(vendorId, direction, 'test body', reviewStatus)
}

describe('vendorScorecards', () => {
  it('returns every vendor with its own stat rows attached', () => {
    insertStat(1, 'E0260', 1, 0.9, 10)
    insertStat(1, 'E0424', 3, 0.7, 20)
    insertStat(2, 'E0260', 1, 0.6, 5)

    const cards = vendorScorecards()
    expect(cards).toHaveLength(2)

    const first = cards.find((c) => c.vendor.id === 1)!
    expect(first.vendor.name).toBe('Vendor One')
    expect(first.stats).toHaveLength(2)
    expect(first.stats.every((s) => s.vendor_id === 1)).toBe(true)
    expect(cards.find((c) => c.vendor.id === 2)!.stats).toHaveLength(1)
  })

  it('weights the overall on-time rate by sample size', () => {
    insertStat(1, 'E0260', 1, 0.9, 10)
    insertStat(1, 'E0424', 3, 0.5, 90)

    const card = vendorScorecards().find((c) => c.vendor.id === 1)!
    expect(card.overall_on_time_rate).toBeCloseTo(0.54, 10)
    expect(card.total_samples).toBe(100)
  })

  it('reports a null rate for a vendor with no stats', () => {
    const card = vendorScorecards().find((c) => c.vendor.id === 2)!
    expect(card.overall_on_time_rate).toBeNull()
    expect(card.total_samples).toBe(0)
    expect(card.stats).toEqual([])
  })

  it('returns an empty list when there are no vendors', () => {
    db.exec('DELETE FROM vendor_stats; DELETE FROM vendors;')
    expect(vendorScorecards()).toEqual([])
  })
})

describe('reportSummary — calls avoided', () => {
  it('counts inbound messages the AI auto-applied', () => {
    insertMessage(1, 'in', 'auto_applied')
    insertMessage(1, 'in', 'auto_applied')

    const summary = reportSummary()
    expect(summary.calls_avoided_breakdown.auto_applied_messages).toBe(2)
    expect(summary.calls_avoided).toBe(2)
  })

  it('counts vendor self-service updates such as portal taps', () => {
    const id = seedOrder()
    insertEvent(id, 'vendor_accepted', { source: 'portal' }, 'vendor')
    insertEvent(id, 'eta_set', { source: 'portal' }, 'vendor')

    const summary = reportSummary()
    expect(summary.calls_avoided_breakdown.vendor_self_service_updates).toBe(2)
    expect(summary.calls_avoided).toBe(2)
  })

  it('counts pickups triggered by a nurse tap or the EMR webhook', () => {
    const nurseOrder = seedOrder()
    const emrOrder = seedOrder()
    insertEvent(nurseOrder, 'pickup_triggered', { patient_status: 'deceased', source: 'nurse' }, 'hospice')
    insertEvent(emrOrder, 'pickup_triggered', { patient_status: 'deceased', source: 'emr' }, 'system')

    const summary = reportSummary()
    expect(summary.calls_avoided_breakdown.auto_triggered_pickups).toBe(2)
    expect(summary.calls_avoided).toBe(2)
  })

  it('ignores human-driven work and unparsed traffic', () => {
    const id = seedOrder()
    insertEvent(id, 'order_placed', null, 'hospice')
    insertEvent(id, 'delivered', { source: 'vendor_message' }, 'ai')
    insertEvent(id, 'picked_up', { pod: true }, 'driver')
    insertEvent(id, 'pickup_triggered', { patient_status: 'deceased' }, 'hospice')
    insertMessage(1, 'in', 'needs_review')
    insertMessage(1, 'in', 'confirmed')
    insertMessage(1, 'in', 'rejected')
    insertMessage(1, 'out', null)

    const summary = reportSummary()
    expect(summary.calls_avoided).toBe(0)
    expect(summary.calls_avoided_breakdown).toEqual({
      auto_applied_messages: 0,
      vendor_self_service_updates: 0,
      auto_triggered_pickups: 0,
    })
  })

  it('totals the three sources and explains itself', () => {
    const id = seedOrder()
    insertMessage(1, 'in', 'auto_applied')
    insertEvent(id, 'vendor_accepted', { source: 'portal' }, 'vendor')
    insertEvent(id, 'pickup_triggered', { source: 'nurse' }, 'hospice')

    const summary = reportSummary()
    expect(summary.calls_avoided).toBe(3)
    expect(summary.calls_avoided_definition.length).toBeGreaterThan(0)
  })
})

describe('reportSummary — escalations, states, pickup latency', () => {
  it('counts only open escalations', () => {
    const id = seedOrder()
    db.prepare("INSERT INTO escalations (order_id, reason, status) VALUES (?, 'a', 'open')").run(id)
    db.prepare("INSERT INTO escalations (order_id, reason, status) VALUES (?, 'b', 'open')").run(id)
    db.prepare("INSERT INTO escalations (order_id, reason, status) VALUES (?, 'c', 'resolved')").run(id)
    db.prepare("INSERT INTO escalations (order_id, reason, status) VALUES (?, 'd', 'acked')").run(id)

    expect(reportSummary().open_escalations).toBe(2)
  })

  it('counts orders by state across every state', () => {
    seedOrder({ state: 'ordered' })
    seedOrder({ state: 'ordered' })
    seedOrder({ state: 'picked_up' })

    const byState = reportSummary().orders_by_state
    expect(byState.ordered).toBe(2)
    expect(byState.picked_up).toBe(1)
    expect(byState.in_transit).toBe(0)
    expect(byState.cancelled).toBe(0)
  })

  it('averages the hours from pickup_triggered to picked_up', () => {
    const done = seedOrder({ state: 'picked_up' })
    const alsoDone = seedOrder({ state: 'picked_up' })
    const pending = seedOrder({ state: 'pickup_pending' })

    insertEvent(done, 'pickup_triggered', { source: 'nurse' }, 'hospice', '2026-08-10T00:00:00.000Z')
    insertEvent(done, 'picked_up', { pod: true }, 'driver', '2026-08-10T06:00:00.000Z')
    insertEvent(alsoDone, 'pickup_triggered', { source: 'emr' }, 'system', '2026-08-11T00:00:00.000Z')
    insertEvent(alsoDone, 'picked_up', { pod: true }, 'driver', '2026-08-11T02:00:00.000Z')
    insertEvent(pending, 'pickup_triggered', { source: 'nurse' }, 'hospice', '2026-08-12T00:00:00.000Z')

    const latency = reportSummary().pickup_latency
    expect(latency.sample_size).toBe(2)
    expect(latency.average_hours).toBeCloseTo(4, 10)
  })

  it('ignores a pickup_triggered that has no matching picked_up', () => {
    const pending = seedOrder({ state: 'pickup_pending' })
    insertEvent(pending, 'pickup_triggered', { source: 'nurse' }, 'hospice', '2026-08-12T00:00:00.000Z')

    const latency = reportSummary().pickup_latency
    expect(latency.sample_size).toBe(0)
    expect(latency.average_hours).toBeNull()
  })

  it('returns zeros rather than errors on an empty database', () => {
    db.exec('DELETE FROM vendor_stats; DELETE FROM vendors; DELETE FROM patients;')

    const summary = reportSummary()
    expect(summary.calls_avoided).toBe(0)
    expect(summary.open_escalations).toBe(0)
    expect(summary.pickup_latency).toEqual({ average_hours: null, sample_size: 0 })
    expect(Object.values(summary.orders_by_state).every((n) => n === 0)).toBe(true)
    expect(summary.orders_by_state.ordered).toBe(0)
  })
})
