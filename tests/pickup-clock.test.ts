import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../server/db'
import { applyEvent } from '../server/statemachine'
import { getOrder } from '../server/store'
import { tick } from '../server/watchdog'
import { seedFixtures, seedOrder } from './helpers'

beforeEach(() => {
  seedFixtures()
  delete process.env.ANTHROPIC_API_KEY
})

const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString()

function backdateLastEvent(orderId: number, iso: string): void {
  db.prepare(
    'UPDATE order_events SET created_at = ? WHERE id = (SELECT MAX(id) FROM order_events WHERE order_id = ?)',
  ).run(iso, orderId)
}

function triggerPickup(orderId: number, at?: string): void {
  applyEvent(orderId, 'pickup_triggered', { patient_status: 'deceased' }, 'hospice')
  if (at) backdateLastEvent(orderId, at)
}

function overdueEvents(orderId: number) {
  return db
    .prepare("SELECT payload FROM order_events WHERE order_id = ? AND type = 'pickup_overdue' ORDER BY id")
    .all(orderId)
    .map((row) => JSON.parse((row as { payload: string }).payload) as { hours_waiting: number })
}

function openEscalations(orderId: number) {
  return db
    .prepare("SELECT reason FROM escalations WHERE order_id = ? AND status = 'open'")
    .all(orderId) as { reason: string }[]
}

describe('pickup overdue clock', () => {
  it('does not flag a pickup triggered just now on a long-standing order', () => {
    const id = seedOrder({ state: 'delivered', created_at: hoursAgo(240) })
    triggerPickup(id)
    tick(new Date())
    expect(getOrder(id)!.state).toBe('pickup_pending')
    expect(overdueEvents(id)).toHaveLength(0)
    expect(openEscalations(id)).toHaveLength(0)
  })

  it('flags a pickup left waiting past the window, counting from the trigger', () => {
    const id = seedOrder({ state: 'delivered', created_at: hoursAgo(240) })
    triggerPickup(id, hoursAgo(30))
    tick(new Date())
    expect(getOrder(id)!.state).toBe('pickup_overdue')
    expect(overdueEvents(id)).toEqual([{ hours_waiting: 30 }])
    expect(openEscalations(id)).toEqual([
      { reason: 'Pickup not completed after 30h — family is still waiting' },
    ])
  })

  it('does not flag a pickup still inside the window', () => {
    const id = seedOrder({ state: 'delivered', created_at: hoursAgo(240) })
    triggerPickup(id, hoursAgo(23))
    tick(new Date())
    expect(getOrder(id)!.state).toBe('pickup_pending')
    expect(overdueEvents(id)).toHaveLength(0)
  })

  it('ignores a delivery-phase eta_at that predates the pickup trigger', () => {
    const id = seedOrder({ state: 'delivered', created_at: hoursAgo(240), eta_at: hoursAgo(200) })
    triggerPickup(id)
    tick(new Date())
    expect(getOrder(id)!.state).toBe('pickup_pending')
    expect(overdueEvents(id)).toHaveLength(0)
  })

  it('honours an eta_set made after the pickup trigger', () => {
    const id = seedOrder({ state: 'delivered', created_at: hoursAgo(240) })
    triggerPickup(id, hoursAgo(30))
    applyEvent(id, 'eta_set', { eta_iso: hoursAgo(2) }, 'vendor')
    tick(new Date())
    expect(getOrder(id)!.state).toBe('pickup_pending')
    expect(overdueEvents(id)).toHaveLength(0)
  })

  it('measures from a post-trigger eta when that eta is itself past the window', () => {
    const id = seedOrder({ state: 'delivered', created_at: hoursAgo(240) })
    triggerPickup(id, hoursAgo(40))
    applyEvent(id, 'eta_set', { eta_iso: hoursAgo(26) }, 'vendor')
    tick(new Date())
    expect(getOrder(id)!.state).toBe('pickup_overdue')
    expect(overdueEvents(id)).toEqual([{ hours_waiting: 26 }])
    expect(openEscalations(id)).toEqual([
      { reason: 'Pickup not completed after 26h — family is still waiting' },
    ])
  })
})
