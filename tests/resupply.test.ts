import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../server/db'
import { tick } from '../server/watchdog'
import { seedFixtures, seedOrder } from './helpers'
import type { Order } from '../shared/types'

beforeEach(() => {
  seedFixtures()
  delete process.env.ANTHROPIC_API_KEY
})

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

// A delivered consumable, with its delivered event backdated so the payer window math
// has something real to anchor on — the scheduler reads the event, not the order row.
function seedDeliveredConsumable(deliveredDaysAgo: number, code = 'A7030', name = 'CPAP full face mask'): number {
  const id = seedOrder({
    hcpcs_code: code,
    equipment_name: name,
    state: 'delivered',
    created_at: daysAgo(deliveredDaysAgo + 1),
  })
  db.prepare(
    "INSERT INTO order_events (order_id, type, actor, created_at) VALUES (?, 'delivered', 'vendor', ?)",
  ).run(id, daysAgo(deliveredDaysAgo))
  return id
}

function successorOf(id: number): Order | undefined {
  const event = db
    .prepare(
      "SELECT order_id FROM order_events WHERE type = 'order_placed' AND json_extract(payload, '$.resupply_of') = ?",
    )
    .get(id) as { order_id: number } | undefined
  if (!event) return undefined
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(event.order_id) as Order
}

describe('resupply scheduler', () => {
  it('places the next order once the payer window elapses, on the same state machine', () => {
    const id = seedDeliveredConsumable(91) // A7030 window is 90 days
    tick(new Date())
    const next = successorOf(id)
    expect(next).toBeTruthy()
    expect(next!.state).toBe('ordered')
    expect(next!.patient_id).toBe(1)
    expect(next!.vendor_id).toBe(1)
    expect(next!.hcpcs_code).toBe('A7030')
    // The vendor is texted the same order request as any human-placed order.
    const texts = db
      .prepare("SELECT * FROM messages WHERE order_id = ? AND direction = 'out' AND template = 'v_order_request'")
      .all(next!.id)
    expect(texts).toHaveLength(1)
  })

  it('does not reorder before the window opens', () => {
    const id = seedDeliveredConsumable(30) // 90-day code, only 30 days in
    tick(new Date())
    expect(successorOf(id)).toBeUndefined()
  })

  it('places exactly one successor no matter how many ticks pass', () => {
    const id = seedDeliveredConsumable(91)
    tick(new Date())
    tick(new Date())
    tick(new Date(Date.now() + 60_000))
    const orders = db.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }
    expect(orders.n).toBe(2) // the original + one successor
    expect(successorOf(id)).toBeTruthy()
  })

  it('never resupplies equipment, however long delivered', () => {
    const id = seedOrder({ state: 'delivered', created_at: daysAgo(200) })
    db.prepare(
      "INSERT INTO order_events (order_id, type, actor, created_at) VALUES (?, 'delivered', 'vendor', ?)",
    ).run(id, daysAgo(200))
    tick(new Date())
    expect(successorOf(id)).toBeUndefined()
  })

  it('never resupplies a patient who is no longer active', () => {
    const id = seedDeliveredConsumable(91)
    db.prepare("UPDATE patients SET status = 'deceased' WHERE id = 1").run()
    tick(new Date())
    expect(successorOf(id)).toBeUndefined()
  })

  it("stamps the ledger with the resupply source so the board can say 'no model'", () => {
    const id = seedDeliveredConsumable(91)
    tick(new Date())
    const next = successorOf(id)!
    const placed = db
      .prepare("SELECT payload, actor FROM order_events WHERE order_id = ? AND type = 'order_placed'")
      .get(next.id) as { payload: string; actor: string }
    expect(placed.actor).toBe('system')
    expect(JSON.parse(placed.payload)).toEqual({ source: 'resupply', resupply_of: id })
  })
})
