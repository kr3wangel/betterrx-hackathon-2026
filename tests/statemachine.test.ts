import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../server/db'
import { applyEvent, escalate, TransitionError } from '../server/statemachine'
import { getOrder, listOrderEvents } from '../server/store'
import { seedFixtures, seedOrder } from './helpers'

beforeEach(seedFixtures)

describe('applyEvent', () => {
  it('walks the happy path to picked_up', () => {
    const id = seedOrder()
    applyEvent(id, 'vendor_accepted', null, 'vendor')
    expect(getOrder(id)!.state).toBe('dispatched')
    applyEvent(id, 'out_for_delivery', null, 'driver')
    applyEvent(id, 'delivered', null, 'driver')
    applyEvent(id, 'pickup_triggered', null, 'system')
    applyEvent(id, 'picked_up', null, 'driver')
    expect(getOrder(id)!.state).toBe('picked_up')
    expect(listOrderEvents(id).map((e) => e.type)).toEqual([
      'vendor_accepted',
      'out_for_delivery',
      'delivered',
      'pickup_triggered',
      'picked_up',
    ])
  })

  it('rejects invalid transitions with a 409 error', () => {
    const id = seedOrder()
    expect(() => applyEvent(id, 'delivered', null, 'driver')).toThrow(TransitionError)
    expect(getOrder(id)!.state).toBe('ordered')
    expect(listOrderEvents(id)).toHaveLength(0)
  })

  it('404s on unknown orders', () => {
    expect(() => applyEvent(9999, 'vendor_accepted', null, 'vendor')).toThrow(/not found/)
  })

  it('eta_set updates eta without changing state', () => {
    const id = seedOrder({ state: 'dispatched' })
    applyEvent(id, 'eta_set', { eta_iso: '2026-08-15T10:00:00Z' }, 'ai')
    const order = getOrder(id)!
    expect(order.state).toBe('dispatched')
    expect(order.eta_at).toBe('2026-08-15T10:00:00Z')
  })

  it('vendor_swapped resets vendor, eta, and risk back to ordered', () => {
    const id = seedOrder({ state: 'in_transit', eta_at: '2026-08-15T10:00:00Z', risk_score: 90 })
    applyEvent(id, 'vendor_swapped', { vendor_id: 2 }, 'hospice')
    const order = getOrder(id)!
    expect(order).toMatchObject({ state: 'ordered', vendor_id: 2, eta_at: null, risk_score: null })
  })

  it('allows picked_up from pickup_overdue', () => {
    const id = seedOrder({ state: 'pickup_overdue' })
    applyEvent(id, 'picked_up', null, 'driver')
    expect(getOrder(id)!.state).toBe('picked_up')
  })

  it('blocks cancellation after delivery', () => {
    const id = seedOrder({ state: 'delivered' })
    expect(() => applyEvent(id, 'cancelled', null, 'hospice')).toThrow(TransitionError)
  })

  it('risk_updated persists score and reasons without state change', () => {
    const id = seedOrder({ state: 'dispatched' })
    applyEvent(id, 'risk_updated', { score: 85, reasons: ['late vendor'] }, 'system')
    const order = getOrder(id)!
    expect(order.state).toBe('dispatched')
    expect(order.risk_score).toBe(85)
    expect(order.risk_reasons).toEqual(['late vendor'])
  })
})

describe('escalate', () => {
  it('creates one open escalation per order, no duplicates', () => {
    const id = seedOrder()
    escalate(id, 'first reason')
    escalate(id, 'second reason')
    const rows = db.prepare("SELECT * FROM escalations WHERE order_id = ? AND status = 'open'").all(id)
    expect(rows).toHaveLength(1)
  })
})
