import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../server/db'
import {
  vendorToken,
  resolveToken,
  orderToken,
  orderLink,
  magicLink,
  resolveOrderToken,
  portalOrders,
  portalConfirm,
  portalSetEta,
  portalDecline,
} from '../server/portal'
import { getOrder } from '../server/store'
import { seedFixtures, seedOrder } from './helpers'
import type { OrderEvent } from '../shared/types'

beforeEach(() => {
  seedFixtures()
})

function lastEvent(orderId: number, type: string): OrderEvent | undefined {
  const row = db
    .prepare('SELECT * FROM order_events WHERE order_id = ? AND type = ? ORDER BY id DESC')
    .get(orderId, type) as Record<string, unknown> | undefined
  if (!row) return undefined
  return { ...row, payload: row.payload ? JSON.parse(row.payload as string) : null } as OrderEvent
}

describe('magic link tokens', () => {
  it('round-trips: vendorToken resolves back to the vendor', () => {
    const token = vendorToken(1)
    expect(resolveToken(token)?.id).toBe(1)
  })

  it('is stable for a vendor and distinct across vendors', () => {
    expect(vendorToken(1)).toBe(vendorToken(1))
    expect(vendorToken(1)).not.toBe(vendorToken(2))
  })

  it('rejects an unknown token', () => {
    expect(resolveToken('not-a-real-token')).toBeNull()
  })
})

// The link that actually rides in a text. It is per-order, not per-vendor: a dispatcher
// asked about #2123 lands on #2123 rather than a list to hunt through.
describe('order magic link tokens', () => {
  it('round-trips: orderToken resolves back to the order', () => {
    const id = seedOrder()
    expect(resolveOrderToken(orderToken(id))?.id).toBe(id)
  })

  it('is distinct per order, and distinct from that order vendor token', () => {
    const a = seedOrder()
    const b = seedOrder()
    expect(orderToken(a)).not.toBe(orderToken(b))
    expect(orderToken(a)).not.toBe(vendorToken(getOrder(a)!.vendor_id))
  })

  it('is short enough to sit in a text', () => {
    // The vendor link put 20 hex characters in every message; this one is half that, and
    // the path is /o/ rather than /portal/. Both halves of "shorter" are load-bearing.
    const id = seedOrder()
    expect(orderToken(id)).toHaveLength(10)
    expect(orderLink(id)).toContain('/o/')
    expect(orderLink(id).length).toBeLessThan(magicLink(getOrder(id)!.vendor_id).length)
  })

  it('rejects an unknown token', () => {
    expect(resolveOrderToken('deadbeef00')).toBeNull()
  })
})

describe('portalOrders', () => {
  it('lists only the vendor’s open orders', () => {
    const mine = seedOrder({ vendor_id: 1 })
    seedOrder({ vendor_id: 2 })
    const done = seedOrder({ vendor_id: 1, state: 'picked_up' })
    const ids = portalOrders(1).map((o) => o.id)
    expect(ids).toContain(mine)
    expect(ids).not.toContain(done)
    expect(ids).toHaveLength(1)
  })
})

describe('portal actions', () => {
  it('confirm applies vendor_accepted with the eta, actor vendor, source portal', () => {
    const id = seedOrder()
    portalConfirm(1, id, '2026-08-15T10:00:00Z')
    const order = getOrder(id)!
    expect(order.state).toBe('dispatched')
    expect(order.eta_at).toBe('2026-08-15T10:00:00Z')
    const event = lastEvent(id, 'vendor_accepted')!
    expect(event.actor).toBe('vendor')
    expect(event.payload).toMatchObject({ source: 'portal' })
  })

  it('confirm without an eta still accepts', () => {
    const id = seedOrder()
    portalConfirm(1, id)
    expect(getOrder(id)!.state).toBe('dispatched')
  })

  it('setEta updates eta without changing state', () => {
    const id = seedOrder({ state: 'dispatched' })
    portalSetEta(1, id, '2026-08-16T09:00:00Z')
    const order = getOrder(id)!
    expect(order.state).toBe('dispatched')
    expect(order.eta_at).toBe('2026-08-16T09:00:00Z')
  })

  it('decline opens an escalation and leaves the state alone', () => {
    const id = seedOrder()
    portalDecline(1, id, "truck's down this week")
    expect(getOrder(id)!.state).toBe('ordered')
    const escalations = db.prepare("SELECT * FROM escalations WHERE order_id = ? AND status = 'open'").all(id)
    expect(escalations).toHaveLength(1)
    expect((escalations[0] as { reason: string }).reason).toContain("truck's down")
  })

  it('refuses to act on another vendor’s order', () => {
    const id = seedOrder({ vendor_id: 2 })
    expect(() => portalConfirm(1, id)).toThrow()
    expect(getOrder(id)!.state).toBe('ordered')
  })
})
