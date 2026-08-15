import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../server/db'
import { placeOrders } from '../server/orders'
import { handleVendorInbound } from '../server/sms'
import { liveQuestions } from '../server/slots'
import { getOrder } from '../server/store'
import { seedFixtures } from './helpers'
import type { Message } from '../shared/types'

beforeEach(() => {
  seedFixtures()
  delete process.env.ANTHROPIC_API_KEY
})

const BUNDLE = [
  { hcpcs_code: 'E0260', equipment_name: 'Hospital bed', quantity: 1 },
  { hcpcs_code: 'E1390', equipment_name: 'Oxygen concentrator', quantity: 1 },
  { hcpcs_code: 'E0143', equipment_name: 'Walker, folding wheeled', quantity: 1 },
]

function outbound(vendorId: number) {
  return db
    .prepare("SELECT * FROM messages WHERE vendor_id = ? AND direction = 'out' ORDER BY id")
    .all(vendorId) as Message[]
}

function familyMessages() {
  return db.prepare("SELECT * FROM messages WHERE recipient_type = 'family'").all()
}

describe('placeOrders', () => {
  it('sends ONE v_order_group text for a multi-item placement, manifest riding message_orders', () => {
    const orders = placeOrders({ patient_id: 1, vendor_id: 1, urgency: 'urgent', items: BUNDLE })
    expect(orders).toHaveLength(3)
    for (const order of orders) expect(order.state).toBe('ordered')

    const msgs = outbound(1)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].template).toBe('v_order_group')
    expect(msgs[0].body).toContain('3 items for one home')
    expect(msgs[0].body).toContain('hospital bed')
    expect(msgs[0].body).toContain('oxygen concentrator')

    const manifest = db
      .prepare('SELECT order_id FROM message_orders WHERE message_id = ? ORDER BY order_id')
      .all(msgs[0].id) as { order_id: number }[]
    expect(manifest.map((m) => m.order_id)).toEqual(orders.map((o) => o.id))
  })

  it('spends exactly one reply pair on the whole bundle', () => {
    placeOrders({ patient_id: 1, vendor_id: 1, items: BUNDLE })
    expect(liveQuestions(1)).toHaveLength(1)
  })

  it('keeps the classic v_order_request for a single item', () => {
    placeOrders({ patient_id: 1, vendor_id: 1, items: [BUNDLE[0]] })
    const msgs = outbound(1)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].template).toBe('v_order_request')
  })
})

describe('v_order_group replies', () => {
  it('one affirmative digit accepts every item, with no family text', async () => {
    const orders = placeOrders({ patient_id: 1, vendor_id: 1, items: BUNDLE })
    const result = await handleVendorInbound(1, '1')
    expect(result.outcome).toBe('applied')
    expect(result.group_order_ids).toEqual(orders.map((o) => o.id))
    for (const order of orders) expect(getOrder(order.id)!.state).toBe('dispatched')

    const events = db
      .prepare("SELECT payload FROM order_events WHERE type = 'vendor_accepted'")
      .all() as { payload: string }[]
    expect(events).toHaveLength(3)
    for (const e of events) expect(JSON.parse(e.payload).source).toBe('group reply')

    const receipts = outbound(1).filter((m) => !m.template)
    expect(receipts).toHaveLength(1)
    expect(receipts[0].body).toContain('all 3 items are confirmed with you')
    expect(familyMessages()).toHaveLength(0)
  })

  it('the negative digit escalates every item on the manifest', async () => {
    const orders = placeOrders({ patient_id: 1, vendor_id: 1, items: BUNDLE })
    await handleVendorInbound(1, '2')
    const escalations = db
      .prepare("SELECT order_id FROM escalations WHERE status = 'open' ORDER BY order_id")
      .all() as { order_id: number }[]
    expect(escalations.map((e) => e.order_id)).toEqual(orders.map((o) => o.id))
    // Nothing transitions on a decline — the orders stay put for a human to re-route.
    for (const order of orders) expect(getOrder(order.id)!.state).toBe('ordered')
  })

  it('a second copy of the digit does not re-apply', async () => {
    const orders = placeOrders({ patient_id: 1, vendor_id: 1, items: BUNDLE })
    await handleVendorInbound(1, '1')
    const repeat = await handleVendorInbound(1, '1')
    expect(repeat.outcome).not.toBe('applied')
    const accepted = db.prepare("SELECT COUNT(*) AS n FROM order_events WHERE type = 'vendor_accepted'").get() as {
      n: number
    }
    expect(accepted.n).toBe(3)
    expect(getOrder(orders[0].id)!.state).toBe('dispatched')
  })
})
