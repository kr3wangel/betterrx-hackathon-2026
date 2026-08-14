import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../server/db'
import { applyParsed, handleInbound, orderRequestText, pickupRequestText } from '../server/messaging'
import { getOrder } from '../server/store'
import { seedFixtures, seedOrder } from './helpers'
import type { ParsedMessage } from '../shared/types'

beforeEach(() => {
  seedFixtures()
  delete process.env.ANTHROPIC_API_KEY
})

function parsed(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return { order_ref: null, intent: 'accept', eta_iso: null, notes: null, confidence: 0.95, ...overrides }
}

describe('applyParsed', () => {
  it('maps accept to vendor_accepted', () => {
    const id = seedOrder()
    applyParsed(id, parsed(), 'ai')
    expect(getOrder(id)!.state).toBe('dispatched')
  })

  it('maps eta_update to eta_set and keeps state', () => {
    const id = seedOrder({ state: 'dispatched' })
    applyParsed(id, parsed({ intent: 'eta_update', eta_iso: '2026-08-15T10:00:00Z' }), 'ai')
    const order = getOrder(id)!
    expect(order.state).toBe('dispatched')
    expect(order.eta_at).toBe('2026-08-15T10:00:00Z')
  })

  it('delay sets eta and opens an escalation', () => {
    const id = seedOrder({ state: 'dispatched' })
    applyParsed(id, parsed({ intent: 'delay', eta_iso: '2026-08-16T10:00:00Z', notes: 'truck down' }), 'ai')
    const escalations = db.prepare("SELECT * FROM escalations WHERE order_id = ? AND status = 'open'").all(id)
    expect(escalations).toHaveLength(1)
  })

  it('throws on unmapped intents', () => {
    const id = seedOrder()
    expect(() => applyParsed(id, parsed({ intent: 'unknown' }), 'ai')).toThrow(/no event mapping/)
  })
})

describe('handleInbound without an API key', () => {
  it('stores the message and routes it to the review queue', async () => {
    seedOrder()
    const message = await handleInbound(1, 'yes got it, bed will be there thursday')
    expect(message.review_status).toBe('needs_review')
    expect(message.parsed).toBeNull()
    const rows = db.prepare("SELECT * FROM messages WHERE review_status = 'needs_review'").all()
    expect(rows).toHaveLength(1)
  })
})

describe('outbound templates', () => {
  it('order request names the order, equipment, and deadline', () => {
    const id = seedOrder({ target_at: '2026-08-15T12:00:00Z' })
    const text = orderRequestText(getOrder(id)!, 'SLC')
    expect(text).toContain(`#${id}`)
    expect(text).toContain('Hospital bed')
    expect(text).toContain('E0260')
  })

  it('pickup request is respectful and names the order', () => {
    const id = seedOrder({ state: 'pickup_pending' })
    const text = pickupRequestText(getOrder(id)!)
    expect(text).toContain(`#${id}`)
    expect(text.toLowerCase()).toContain('family')
  })
})
