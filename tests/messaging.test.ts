import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../server/db'
import { applyParsed, handleInbound, orderRequestText, pickupRequestText } from '../server/messaging'
import { extractJson } from '../server/llm'
import { reportSummary } from '../server/reports'
import { resolveOrderToken } from '../server/portal'
import { getOrder } from '../server/store'
import { seedFixtures, seedOrder } from './helpers'
import type { ParsedMessage } from '../shared/types'

vi.mock('../server/llm', () => ({ extractJson: vi.fn() }))
const mockedExtract = vi.mocked(extractJson)

beforeEach(() => {
  seedFixtures()
  mockedExtract.mockReset()
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

  it('decline escalates without moving the order, so a confirmed review-queue decline works', () => {
    const id = seedOrder()
    expect(() =>
      applyParsed(id, parsed({ intent: 'decline', notes: "truck's down this week" }), 'hospice'),
    ).not.toThrow()
    expect(getOrder(id)!.state).toBe('ordered')
    const escalations = db
      .prepare("SELECT * FROM escalations WHERE order_id = ? AND status = 'open'")
      .all(id) as { reason: string }[]
    expect(escalations).toHaveLength(1)
    expect(escalations[0].reason).toContain("truck's down")
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

describe('handleInbound confidence gate', () => {
  function openEscalations(orderId: number) {
    return db.prepare("SELECT * FROM escalations WHERE order_id = ? AND status = 'open'").all(orderId)
  }

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  it('sends a low-confidence decline to the review queue instead of escalating', async () => {
    const id = seedOrder()
    mockedExtract.mockResolvedValue(
      parsed({ order_ref: `#${id}`, intent: 'decline', notes: 'maybe about the bed?', confidence: 0.2 }),
    )

    const message = await handleInbound(1, 'nah')

    expect(message.review_status).toBe('needs_review')
    expect(openEscalations(id)).toHaveLength(0)
    expect(reportSummary().calls_avoided).toBe(0)
  })

  it('auto-escalates a high-confidence decline', async () => {
    const id = seedOrder()
    mockedExtract.mockResolvedValue(
      parsed({ order_ref: `#${id}`, intent: 'decline', notes: "truck's down", confidence: 0.95 }),
    )

    const message = await handleInbound(1, "truck's down, can't fill it")

    expect(message.review_status).toBe('auto_applied')
    expect(getOrder(id)!.state).toBe('ordered')
    expect(openEscalations(id)).toHaveLength(1)
  })

  it('sends a confident decline with no resolved order to the review queue', async () => {
    const id = seedOrder()
    mockedExtract.mockResolvedValue(parsed({ order_ref: null, intent: 'decline', confidence: 0.95 }))

    const message = await handleInbound(1, "can't do it")

    expect(message.review_status).toBe('needs_review')
    expect(openEscalations(id)).toHaveLength(0)
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

  it('pickup request names the order and asks without invoking the household', () => {
    const id = seedOrder({ state: 'pickup_pending' })
    const text = pickupRequestText(getOrder(id)!)
    expect(text).toContain(`#${id}`)
    expect(text).toContain('Hospital bed')
    expect(text).toMatch(/reply 1 if you can get it today, 2 to give us a window/i)
    // The order's own link, not the vendor's: a pickup text about #id must open #id.
    const token = text.match(/\/o\/(\w+)/)?.[1]
    expect(token, 'no order link in the text').toBeTruthy()
    expect(resolveOrderToken(token!)?.id).toBe(id)
    expect(text.toLowerCase()).not.toContain('family')
    expect(text).not.toContain('Test Patient')
  })
})
