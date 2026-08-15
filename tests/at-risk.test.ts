import { describe, it, expect } from 'vitest'
import {
  selectNeedsAttention,
  selectBoardOrders,
  isNeedsAttention,
  deadlineSentence,
} from '../client/src/lib/atRisk'
import type { Order, OrderState } from '../shared/types'

const NOW = new Date('2026-08-14T12:00:00Z')

function order(over: Partial<Order>): Order {
  return {
    id: 1,
    patient_id: 1,
    vendor_id: 1,
    hcpcs_code: 'E0260',
    equipment_name: 'Hospital bed, semi-electric',
    quantity: 1,
    urgency: 'routine',
    target_at: null,
    state: 'ordered',
    eta_at: null,
    risk_score: 0,
    risk_reasons: null,
    delivery_verified: false,
    pickup_verified: false,
    pickup_committed: false,
    family_confirmed: false,
    created_at: NOW.toISOString(),
    ...over,
  }
}

function hoursFromNow(h: number): string {
  return new Date(NOW.getTime() + h * 3_600_000).toISOString()
}

describe('isNeedsAttention', () => {
  it('flags an order at or above the risk threshold', () => {
    expect(isNeedsAttention(order({ risk_score: 70 }), NOW)).toBe(true)
    expect(isNeedsAttention(order({ risk_score: 69 }), NOW)).toBe(false)
  })

  it('flags an overdue pickup regardless of score', () => {
    expect(isNeedsAttention(order({ state: 'pickup_overdue', risk_score: 0 }), NOW)).toBe(true)
  })

  it('flags a pre-delivery order whose deadline is inside the danger window', () => {
    expect(isNeedsAttention(order({ state: 'dispatched', target_at: hoursFromNow(16) }), NOW)).toBe(true)
    expect(isNeedsAttention(order({ state: 'dispatched', target_at: hoursFromNow(48) }), NOW)).toBe(false)
  })

  it('never flags a completed or cancelled order', () => {
    const done: OrderState[] = ['picked_up', 'cancelled']
    for (const state of done) {
      expect(isNeedsAttention(order({ state, risk_score: 100 }), NOW)).toBe(false)
    }
  })
})

describe('selectNeedsAttention', () => {
  it('returns the at-risk set, most urgent first', () => {
    const orders = [
      order({ id: 10, risk_score: 0 }),
      order({ id: 11, risk_score: 80 }),
      order({ id: 12, state: 'pickup_overdue', risk_score: 0 }),
      order({ id: 13, risk_score: 90 }),
    ]
    const result = selectNeedsAttention(orders, NOW)
    // Overdue outranks everything; the calm order drops out entirely.
    expect(result.map((o) => o.id)).toEqual([12, 13, 11])
  })
})

describe('selectBoardOrders', () => {
  it('keeps in-motion orders and drops stale completed history', () => {
    const orders = [
      order({ id: 1, state: 'ordered' }),
      order({ id: 2, state: 'delivered', created_at: hoursFromNow(-2) }), // recent → kept
      order({ id: 3, state: 'delivered', created_at: hoursFromNow(-240) }), // old → dropped
      order({ id: 4, state: 'picked_up', created_at: hoursFromNow(-240) }), // old → dropped
    ]
    const result = selectBoardOrders(orders, NOW)
    expect(result.map((o) => o.id).sort()).toEqual([1, 2])
  })
})

describe('deadlineSentence', () => {
  it('speaks plainly for an overdue pickup', () => {
    expect(deadlineSentence(order({ state: 'pickup_overdue' }), NOW)).toMatch(/still in the home/)
  })

  it('counts down hours for an upcoming deadline', () => {
    expect(deadlineSentence(order({ target_at: hoursFromNow(16) }), NOW)).toMatch(/about 16 hours out/)
  })

  it('returns null when there is no deadline to speak of', () => {
    expect(deadlineSentence(order({ target_at: null }), NOW)).toBeNull()
  })
})
