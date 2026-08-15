import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../server/db'
import { applyEvent } from '../server/statemachine'
import { applyParsed } from '../server/messaging'
import { getOrder, listOrders } from '../server/store'
import { seedFixtures, seedOrder } from './helpers'
import type { ParsedMessage } from '../shared/types'

beforeEach(seedFixtures)

function insertPod(orderId: number, kind: 'delivery' | 'pickup') {
  db.prepare('INSERT INTO pods (order_id, kind) VALUES (?, ?)').run(orderId, kind)
}

function parsed(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return { order_ref: null, intent: 'delivered', eta_iso: null, notes: null, confidence: 0.95, ...overrides }
}

describe('provenance flags', () => {
  it('delivery POD sets delivery_verified', () => {
    const id = seedOrder({ state: 'delivered' })
    insertPod(id, 'delivery')
    const order = getOrder(id)!
    expect(order.delivery_verified).toBe(true)
    expect(order.pickup_verified).toBe(false)
  })

  it('no POD leaves both flags false', () => {
    const id = seedOrder({ state: 'delivered' })
    const order = getOrder(id)!
    expect(order.delivery_verified).toBe(false)
    expect(order.pickup_verified).toBe(false)
  })

  it('pickup POD sets pickup_verified but not delivery_verified', () => {
    const id = seedOrder({ state: 'picked_up' })
    insertPod(id, 'pickup')
    const order = getOrder(id)!
    expect(order.pickup_verified).toBe(true)
    expect(order.delivery_verified).toBe(false)
  })

  it('listOrders carries the flags', () => {
    const verified = seedOrder({ state: 'delivered' })
    const claimed = seedOrder({ state: 'delivered' })
    insertPod(verified, 'delivery')
    const orders = listOrders()
    expect(orders.find((o) => o.id === verified)!.delivery_verified).toBe(true)
    expect(orders.find((o) => o.id === claimed)!.delivery_verified).toBe(false)
  })
})

describe('pickup commitment flag', () => {
  function triggeredPickup(): number {
    const id = seedOrder({ state: 'delivered' })
    applyEvent(id, 'pickup_triggered', { patient_status: 'deceased' }, 'hospice')
    return id
  }

  it('an eta-less eta_set after the trigger commits the pickup without writing eta_at', () => {
    const id = triggeredPickup()
    expect(getOrder(id)!.pickup_committed).toBe(false)
    applyEvent(id, 'eta_set', { eta_iso: null, source: 'group reply' }, 'vendor')
    const order = getOrder(id)!
    expect(order.pickup_committed).toBe(true)
    expect(order.eta_at).toBeNull()
  })

  it('a delivery-phase eta_set before the trigger does not commit the pickup', () => {
    const id = seedOrder({ state: 'in_transit' })
    applyEvent(id, 'eta_set', { eta_iso: new Date().toISOString() }, 'vendor')
    applyEvent(id, 'delivered', { pod: true }, 'driver')
    applyEvent(id, 'pickup_triggered', { patient_status: 'deceased' }, 'hospice')
    expect(getOrder(id)!.pickup_committed).toBe(false)
  })

  it('an order with no pickup trigger at all is never committed', () => {
    const id = seedOrder({ state: 'in_transit' })
    applyEvent(id, 'eta_set', { eta_iso: new Date().toISOString() }, 'vendor')
    expect(getOrder(id)!.pickup_committed).toBe(false)
  })

  it('listOrders carries the flag', () => {
    const committed = triggeredPickup()
    const waiting = triggeredPickup()
    applyEvent(committed, 'eta_set', { eta_iso: null }, 'vendor')
    const orders = listOrders()
    expect(orders.find((o) => o.id === committed)!.pickup_committed).toBe(true)
    expect(orders.find((o) => o.id === waiting)!.pickup_committed).toBe(false)
  })
})

describe('unproven delivery claims', () => {
  it('applyParsed with intent delivered escalates for missing proof', () => {
    const id = seedOrder({ state: 'in_transit' })
    applyParsed(id, parsed(), 'ai')
    expect(getOrder(id)!.state).toBe('delivered')
    const rows = db
      .prepare("SELECT reason FROM escalations WHERE order_id = ? AND status = 'open'")
      .all(id) as { reason: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].reason).toMatch(/without proof of delivery/)
  })

  it('applyParsed with intent picked_up escalates for missing proof', () => {
    const id = seedOrder({ state: 'pickup_pending' })
    applyParsed(id, parsed({ intent: 'picked_up' }), 'ai')
    expect(getOrder(id)!.state).toBe('picked_up')
    const rows = db
      .prepare("SELECT reason FROM escalations WHERE order_id = ? AND status = 'open'")
      .all(id) as { reason: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].reason).toMatch(/without proof of pickup/)
  })

  it('a driver POD delivery opens no escalation', () => {
    const id = seedOrder({ state: 'in_transit' })
    applyEvent(id, 'delivered', { pod: true }, 'driver')
    expect(db.prepare('SELECT * FROM escalations WHERE order_id = ?').all(id)).toHaveLength(0)
  })
})
