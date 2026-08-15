import { describe, expect, it } from 'vitest'
import { computeRisk, RISK_THRESHOLD } from '../server/risk'
import type { Order, VendorStat } from '../shared/types'

const NOW = new Date('2026-08-14T12:00:00Z')

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    patient_id: 1,
    vendor_id: 1,
    hcpcs_code: 'E0260',
    equipment_name: 'Hospital bed',
    quantity: 1,
    urgency: 'routine',
    target_at: '2026-08-15T12:00:00Z',
    state: 'dispatched',
    eta_at: null,
    risk_score: null,
    risk_reasons: null,
    delivery_verified: false,
    pickup_verified: false,
    pickup_committed: false,
    family_confirmed: false,
    created_at: '2026-08-14T00:00:00Z',
    ...overrides,
  }
}

function stat(overrides: Partial<VendorStat> = {}): VendorStat {
  return {
    vendor_id: 1,
    hcpcs_code: 'E0260',
    day_of_week: new Date('2026-08-15T12:00:00Z').getDay(),
    on_time_rate: 0.95,
    avg_delivery_hours: 8,
    sample_size: 40,
    ...overrides,
  }
}

describe('computeRisk', () => {
  it('is zero with no deadline', () => {
    expect(computeRisk(order({ target_at: null }), [stat()], NOW)).toEqual({ score: 0, reasons: [] })
  })

  it('is zero for a reliable vendor with plenty of time', () => {
    const { score } = computeRisk(order(), [stat()], NOW)
    expect(score).toBe(0)
  })

  it('maxes out when the deadline has passed', () => {
    const { score, reasons } = computeRisk(order({ target_at: '2026-08-14T10:00:00Z' }), [stat()], NOW)
    expect(score).toBe(100)
    expect(reasons[0]).toMatch(/deadline passed/)
  })

  it('penalizes a low on-time vendor with a legible reason', () => {
    const { score, reasons } = computeRisk(order(), [stat({ on_time_rate: 0.62 })], NOW)
    expect(score).toBeGreaterThan(0)
    expect(reasons[0]).toContain('62% on-time')
    expect(reasons[0]).toContain('n=40')
  })

  it('penalizes an ETA past the deadline', () => {
    const { score, reasons } = computeRisk(order({ eta_at: '2026-08-15T18:00:00Z' }), [stat()], NOW)
    expect(score).toBeGreaterThanOrEqual(40)
    expect(reasons).toContain('vendor ETA is after the deadline')
  })

  it('penalizes unaccepted orders inside 24h of deadline', () => {
    const { reasons } = computeRisk(
      order({ state: 'ordered', target_at: '2026-08-14T20:00:00Z' }),
      [stat({ avg_delivery_hours: 4 })],
      NOW,
    )
    expect(reasons.some((r) => r.includes('has not accepted'))).toBe(true)
  })

  it('crosses the threshold when signals stack', () => {
    const { score } = computeRisk(
      order({ state: 'ordered', target_at: '2026-08-14T20:00:00Z', urgency: 'stat' }),
      [stat({ on_time_rate: 0.62, avg_delivery_hours: 16 })],
      NOW,
    )
    expect(score).toBeGreaterThanOrEqual(RISK_THRESHOLD)
  })

  it('caps at 100', () => {
    const { score } = computeRisk(
      order({ state: 'ordered', target_at: '2026-08-14T13:00:00Z', urgency: 'stat', eta_at: '2026-08-16T00:00:00Z' }),
      [stat({ on_time_rate: 0.3, avg_delivery_hours: 48 })],
      NOW,
    )
    expect(score).toBe(100)
  })

  it('penalizes an unacknowledged order past the ack SLA', () => {
    const { score, reasons } = computeRisk(
      order({ state: 'ordered', created_at: '2026-08-14T06:00:00Z' }),
      [stat()],
      NOW,
    )
    expect(score).toBeGreaterThanOrEqual(20)
    expect(reasons).toContain('vendor has not acknowledged the order 6.0h after placement')
  })

  it('does not penalize an unacknowledged order within the ack SLA', () => {
    const { score, reasons } = computeRisk(
      order({ state: 'ordered', created_at: '2026-08-14T10:00:00Z' }),
      [stat()],
      NOW,
    )
    expect(score).toBe(0)
    expect(reasons.some((r) => r.includes('has not acknowledged'))).toBe(false)
  })

  it('does not flag ack silence once the order is accepted', () => {
    const { reasons } = computeRisk(
      order({ state: 'dispatched', created_at: '2026-08-14T00:00:00Z' }),
      [stat()],
      NOW,
    )
    expect(reasons.some((r) => r.includes('has not acknowledged'))).toBe(false)
  })

  it('falls back to any-weekday stats when the target weekday has none', () => {
    const wrongDow = stat({ day_of_week: (new Date('2026-08-15T12:00:00Z').getDay() + 1) % 7, on_time_rate: 0.5 })
    const { reasons } = computeRisk(order(), [wrongDow], NOW)
    expect(reasons.some((r) => r.includes('50% on-time'))).toBe(true)
  })
})
