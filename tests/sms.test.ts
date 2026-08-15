import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../server/db'
import {
  ackNagText,
  applyParsed,
  deliveryConfirmText,
  etaCheckText,
  householdGate,
  orderRequestText,
  pickupNoticeText,
  pickupRequestText,
  sendToFamily,
  sendVendorQuestion,
  INTENT_EVENT,
} from '../server/messaging'
import { conditionCheckText, sendConditionCheck } from '../server/condition'
import {
  FAMILY_ROUTES,
  VENDOR_ROUTES,
  handleReply,
  handleVendorInbound,
  sendTemplate,
  type ReplyAction,
} from '../server/sms'
import { portalOrders } from '../server/portal'
import { SLOT_BASES, slotDigits, type SlotDigits } from '../server/slots'
import { applyEvent } from '../server/statemachine'
import { getOrder, rowToMessage } from '../server/store'
import { tick } from '../server/watchdog'
import { seedFixtures, seedOrder } from './helpers'
import type { MessageTemplate, ParsedMessage, VendorTemplate } from '../shared/types'

beforeEach(() => {
  seedFixtures()
  delete process.env.ANTHROPIC_API_KEY
})

function messages(orderId?: number) {
  const rows = orderId
    ? db.prepare('SELECT * FROM messages WHERE order_id = ? ORDER BY id').all(orderId)
    : db.prepare('SELECT * FROM messages ORDER BY id').all()
  return (rows as never[]).map(rowToMessage)
}

function events(orderId: number) {
  return db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY id').all(orderId) as {
    type: string
    actor: string
    payload: string | null
  }[]
}

function openEscalations(orderId: number) {
  return db
    .prepare("SELECT reason FROM escalations WHERE order_id = ? AND status = 'open' ORDER BY id")
    .all(orderId) as { reason: string }[]
}

function conditionReports(orderId: number) {
  return db.prepare('SELECT * FROM condition_reports WHERE order_id = ? ORDER BY id').all(orderId) as {
    score: number
    source: string
  }[]
}

function lastMessageId(): number {
  return (db.prepare('SELECT MAX(id) AS id FROM messages').get() as { id: number }).id
}

type VendorQuestion = Exclude<VendorTemplate, 'v_backlog_digest'>

/** Ask through the real sender, so every question in a test owns a real reply pair. */
function ask(
  orderId: number,
  template: VendorQuestion,
  render: (digits: SlotDigits) => string = () => 'question',
): number {
  const order = getOrder(orderId)!
  const sent = sendVendorQuestion(order.vendor_id, orderId, template, render)
  if (!sent) throw new Error('no reply slot free')
  return sent.message_id
}

function parsedDelivered(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return { order_ref: null, intent: 'delivered', eta_iso: null, notes: null, confidence: 0.95, ...overrides }
}

function familyRow(orderId: number, template: MessageTemplate) {
  return messages(orderId).find((m) => m.direction === 'out' && m.template === template)
}

// --- Table integrity ---------------------------------------------------------------

describe('reply route table integrity', () => {
  const allActions: ReplyAction[] = [
    ...Object.values(VENDOR_ROUTES).flatMap((pair) => [...pair!]),
    ...Object.values(FAMILY_ROUTES).flatMap((routes) => Object.values(routes!)),
  ]

  it('every apply action maps to an intent the state machine knows', () => {
    for (const action of allActions) {
      if (action.kind === 'apply') expect(INTENT_EVENT[action.intent]).toBeTruthy()
    }
  })

  it('routes only questions, never informational templates or the digest', () => {
    const informational: MessageTemplate[] = [
      'f_eta_notice',
      'f_pickup_notice',
      'f_delivered_thanks',
      'f_picked_up_thanks',
      'v_backlog_digest',
    ]
    for (const key of [...Object.keys(VENDOR_ROUTES), ...Object.keys(FAMILY_ROUTES)]) {
      expect(informational).not.toContain(key as MessageTemplate)
    }
  })

  // Every vendor question is a two-way ask, and offset 0 is the affirmative. The pair that
  // means it rotates; which end means yes must not.
  it('gives every vendor template exactly two positions, affirmative first', () => {
    for (const [template, pair] of Object.entries(VENDOR_ROUTES)) {
      expect(pair, template).toHaveLength(2)
      expect(['apply', 'escalate'], template).toContain(pair![0].kind)
    }
  })
})

// --- Vendor digits -----------------------------------------------------------------

describe('vendor digits', () => {
  it('V1 digit 1 accepts the order with no model in the loop', async () => {
    const id = seedOrder()
    const questionId = ask(id, 'v_order_request', (d) => orderRequestText(getOrder(id)!, 'SLC', d))

    const result = await handleReply({ reply_to_message_id: questionId, digit: '1' })

    expect(result.outcome).toBe('applied')
    expect(getOrder(id)!.state).toBe('dispatched')

    const accepted = events(id).filter((e) => e.type === 'vendor_accepted')
    expect(accepted).toHaveLength(1)
    expect(accepted[0].actor).toBe('vendor')

    const inbound = messages(id).find((m) => m.direction === 'in')!
    expect(inbound.confidence).toBe(1)
    expect(inbound.review_status).toBe('auto_applied')
    expect(inbound.parsed!.intent).toBe('accept')

    const question = messages(id).find((m) => m.id === questionId)!
    expect(question.answered_at).not.toBeNull()
  })

  it('V1 digit 2 escalates for reassignment without moving the order', async () => {
    const id = seedOrder()
    const questionId = ask(id, 'v_order_request')
    const before = events(id).length

    const result = await handleReply({ reply_to_message_id: questionId, digit: '2' })

    expect(result.outcome).toBe('applied')
    expect(getOrder(id)!.state).toBe('ordered')
    expect(events(id)).toHaveLength(before)
    const escalations = openEscalations(id)
    expect(escalations).toHaveLength(1)
    expect(escalations[0].reason).toMatch(/can't fill order #/i)
  })

  it('V2 digit 1 accepts exactly like V1', async () => {
    const id = seedOrder()
    const questionId = ask(id, 'v_ack_nag', (d) => ackNagText(getOrder(id)!, d))
    await handleReply({ reply_to_message_id: questionId, digit: '1' })
    expect(getOrder(id)!.state).toBe('dispatched')
  })

  it('V3 digit 1 confirms the target time as the ETA and leaves the state alone', async () => {
    const target = new Date(Date.now() + 4 * 3_600_000).toISOString()
    const id = seedOrder({ state: 'dispatched', target_at: target })
    const questionId = ask(id, 'v_eta_check', (d) => etaCheckText(getOrder(id)!, d))

    await handleReply({ reply_to_message_id: questionId, digit: '1' })

    const order = getOrder(id)!
    expect(order.eta_at).toBe(target)
    expect(order.state).toBe('dispatched')
  })

  it('V3 digit 2 asks for a time instead of guessing one', async () => {
    const id = seedOrder({ state: 'dispatched', target_at: new Date().toISOString() })
    const questionId = ask(id, 'v_eta_check')
    const before = events(id).length

    const result = await handleReply({ reply_to_message_id: questionId, digit: '2' })

    expect(result.outcome).toBe('prompt')
    expect(result.prompt).toMatch(/when do you expect/i)
    expect(events(id)).toHaveLength(before)

    const prompts = messages(id).filter((m) => m.direction === 'out' && m.template === null)
    expect(prompts).toHaveLength(1)
    expect(prompts[0].body).toBe(result.prompt)
  })

  it('V4 digit 1 records the promise without re-anchoring the pickup clock', async () => {
    const id = seedOrder({ state: 'delivered' })
    applyEvent(id, 'pickup_triggered', { patient_status: 'deceased', source: 'nurse' }, 'hospice')
    db.prepare(
      "UPDATE order_events SET created_at = ? WHERE order_id = ? AND type = 'pickup_triggered'",
    ).run(new Date(Date.now() - 30 * 3_600_000).toISOString(), id)
    const questionId = ask(id, 'v_pickup_request', (d) => pickupRequestText(getOrder(id)!, undefined, d))

    await handleReply({ reply_to_message_id: questionId, digit: '1' })

    expect(getOrder(id)!.eta_at).toBeNull()
    expect(events(id).some((e) => e.type === 'eta_set')).toBe(true)

    tick(new Date())
    expect(getOrder(id)!.state).toBe('pickup_overdue')
  })

  it('V4 digit 2 asks the vendor to name a window', async () => {
    const id = seedOrder({ state: 'pickup_pending' })
    const questionId = ask(id, 'v_pickup_request')
    const result = await handleReply({ reply_to_message_id: questionId, digit: '2' })
    expect(result.outcome).toBe('prompt')
    expect(result.prompt).toMatch(/when can you collect/i)
  })

  it('a second answer to the same question is stored but applies nothing', async () => {
    const id = seedOrder()
    const questionId = ask(id, 'v_order_request')
    await handleReply({ reply_to_message_id: questionId, digit: '1' })

    const result = await handleReply({ reply_to_message_id: questionId, digit: '1' })

    expect(result.outcome).toBe('review')
    expect(messages(id).filter((m) => m.direction === 'in' && m.review_status === 'needs_review')).toHaveLength(1)
    expect(events(id).filter((e) => e.type === 'vendor_accepted')).toHaveLength(1)
    expect(getOrder(id)!.state).toBe('dispatched')
  })

  it('a digit outside the template map goes to review', async () => {
    const id = seedOrder()
    const questionId = ask(id, 'v_order_request')
    const result = await handleReply({ reply_to_message_id: questionId, digit: '9' })
    expect(result.outcome).toBe('unmapped')
    expect(getOrder(id)!.state).toBe('ordered')
    expect(messages(id).find((m) => m.direction === 'in')!.review_status).toBe('needs_review')
  })

  it('a digit against an informational template goes to review', async () => {
    const id = seedOrder({ state: 'pickup_pending' })
    sendToFamily(1, id, pickupNoticeText(), 'f_pickup_notice')
    const noticeId = lastMessageId()

    const result = await handleReply({ reply_to_message_id: noticeId, digit: '1' })

    expect(result.outcome).toBe('unmapped')
    expect(messages(id).find((m) => m.direction === 'in')!.review_status).toBe('needs_review')
  })

  it('vendor free text still goes through the review queue with no key', async () => {
    const id = seedOrder()
    const questionId = ask(id, 'v_order_request')
    const result = await handleReply({ reply_to_message_id: questionId, body: 'yeah we can do thursday' })
    expect(result.outcome).toBe('review')
    const inbound = messages().find((m) => m.direction === 'in')!
    expect(inbound.review_status).toBe('needs_review')
    expect(inbound.recipient_type).toBe('vendor')
  })

  it('404s on an unknown message', async () => {
    await expect(handleReply({ reply_to_message_id: 9999, digit: '1' })).rejects.toThrow(/message not found/)
  })
})

// --- Family ------------------------------------------------------------------------

describe('F1 delivery confirmation', () => {
  function claimDelivery(): { id: number; questionId: number } {
    const id = seedOrder({ state: 'in_transit' })
    applyParsed(id, parsedDelivered(), 'ai')
    const question = familyRow(id, 'f_delivery_confirm')!
    return { id, questionId: question.id }
  }

  it('is sent by the unproven-delivery branch and never for a verified one', () => {
    const claimed = seedOrder({ state: 'in_transit' })
    applyParsed(claimed, parsedDelivered(), 'ai')
    expect(familyRow(claimed, 'f_delivery_confirm')).toBeTruthy()

    const verified = seedOrder({ state: 'in_transit' })
    db.prepare("INSERT INTO pods (order_id, kind) VALUES (?, 'delivery')").run(verified)
    applyParsed(verified, parsedDelivered(), 'ai')
    expect(familyRow(verified, 'f_delivery_confirm')).toBeUndefined()
  })

  it('names the equipment and carries no order number or patient name', () => {
    const id = seedOrder({ state: 'in_transit' })
    const body = deliveryConfirmText(getOrder(id)!)
    expect(body.toLowerCase()).toContain('hospital bed')
    expect(body).not.toContain(`#${id}`)
    expect(body).not.toContain('Test Patient')
    expect(body).not.toContain('E0260')
  })

  it('digit 1 records a family_confirmed event and chains the condition check', async () => {
    const { id, questionId } = claimDelivery()

    const result = await handleReply({ reply_to_message_id: questionId, digit: '1' })

    expect(result.outcome).toBe('applied')
    const confirmed = events(id).filter((e) => e.type === 'family_confirmed')
    expect(confirmed).toHaveLength(1)
    expect(confirmed[0].actor).toBe('family')

    const order = getOrder(id)!
    expect(order.family_confirmed).toBe(true)
    expect(order.delivery_verified).toBe(false)

    expect(openEscalations(id)).toHaveLength(0)
    expect(familyRow(id, 'f_condition_check')).toBeTruthy()
  })

  it('digit 2 replaces the vague escalation with the sharper one', async () => {
    const { id, questionId } = claimDelivery()
    expect(openEscalations(id)[0].reason).toMatch(/without proof of delivery/)

    await handleReply({ reply_to_message_id: questionId, digit: '2' })

    const open = openEscalations(id)
    expect(open).toHaveLength(1)
    expect(open[0].reason).toMatch(/family says it has not arrived/)
    expect(open[0].reason).not.toMatch(/without proof of delivery/)
    expect(familyRow(id, 'f_condition_check')).toBeUndefined()
  })

  it('leaves an unrelated open escalation alone', async () => {
    const { id, questionId } = claimDelivery()
    db.prepare("UPDATE escalations SET reason = 'Equipment condition reported as 1/5' WHERE order_id = ?").run(id)

    await handleReply({ reply_to_message_id: questionId, digit: '1' })

    expect(openEscalations(id)).toHaveLength(1)
  })
})

describe('condition check delegation', () => {
  function askCondition(): { id: number; questionId: number } {
    const id = seedOrder({ state: 'delivered' })
    sendConditionCheck(id)
    return { id, questionId: familyRow(id, 'f_condition_check')!.id }
  }

  it('digit 3 records one caregiver report through the existing parser', async () => {
    const { id, questionId } = askCondition()
    const result = await handleReply({ reply_to_message_id: questionId, digit: '3' })

    expect(result.outcome).toBe('applied')
    const reports = conditionReports(id)
    expect(reports).toHaveLength(1)
    expect(reports[0].score).toBe(3)
    expect(reports[0].source).toBe('caregiver')
    expect(openEscalations(id)).toHaveLength(0)
  })

  it('digit 1 under this template means unusable, not yes', async () => {
    const { id, questionId } = askCondition()
    await handleReply({ reply_to_message_id: questionId, digit: '1' })

    expect(conditionReports(id)[0].score).toBe(1)
    expect(openEscalations(id)).toHaveLength(1)
    expect(events(id).some((e) => e.type === 'family_confirmed')).toBe(false)
  })

  it('free text with a rating still reaches the caregiver parser', async () => {
    const { id, questionId } = askCondition()
    const result = await handleReply({ reply_to_message_id: questionId, body: '2 - one of the wheels sticks' })
    expect(result.outcome).toBe('applied')
    expect(conditionReports(id)[0].score).toBe(2)
  })

  it('names the equipment generically', () => {
    const id = seedOrder({ state: 'delivered' })
    expect(conditionCheckText(getOrder(id)!, 'Marcy')).toContain('hospital bed')
  })
})

describe('household free text', () => {
  it('never reaches a model and lands in review', async () => {
    const id = seedOrder({ state: 'in_transit' })
    applyParsed(id, parsedDelivered(), 'ai')
    const questionId = familyRow(id, 'f_delivery_confirm')!.id

    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined()
    const result = await handleReply({ reply_to_message_id: questionId, body: 'who is this?' })

    expect(result.outcome).toBe('review')
    const inbound = messages(id).find((m) => m.direction === 'in')!
    expect(inbound.review_status).toBe('needs_review')
    expect(inbound.parsed).toBeNull()
    expect(inbound.recipient_type).toBe('family')
  })
})

describe('householdGate', () => {
  it('stays silent on questions once the patient has died but still sends notices', () => {
    const id = seedOrder({ state: 'delivered' })
    db.prepare("UPDATE patients SET status = 'deceased' WHERE id = 1").run()
    const order = getOrder(id)!

    expect(householdGate(order, 'f_delivery_confirm').ok).toBe(false)
    expect(householdGate(order, 'f_condition_check').ok).toBe(false)
    expect(householdGate(order, 'f_pickup_notice').ok).toBe(true)

    applyEvent(id, 'pickup_triggered', { patient_status: 'deceased', source: 'nurse' }, 'hospice')
    expect(sendToFamily(1, id, pickupNoticeText(), 'f_pickup_notice')).not.toBeNull()
    expect(sendToFamily(1, id, deliveryConfirmText(order), 'f_delivery_confirm')).toBeNull()
  })

  it('honours STOP across every template', () => {
    const id = seedOrder({ patient_id: 2, state: 'delivered' })
    const order = getOrder(id)!
    expect(householdGate(order, 'f_delivery_confirm').ok).toBe(false)
    expect(householdGate(order, 'f_pickup_notice').ok).toBe(false)
    expect(sendToFamily(2, id, 'anything', 'f_pickup_notice')).toBeNull()
    expect(messages(id)).toHaveLength(0)
  })

  it('allows only one open question in a household thread at a time', () => {
    const id = seedOrder({ state: 'delivered' })
    expect(sendToFamily(1, id, deliveryConfirmText(getOrder(id)!), 'f_delivery_confirm')).not.toBeNull()
    expect(householdGate(getOrder(id)!, 'f_condition_check').ok).toBe(false)
    expect(sendConditionCheck(id).sent).toBe(false)
  })

  it('sends each notice at most once per order', () => {
    const id = seedOrder({ state: 'pickup_pending' })
    expect(sendToFamily(1, id, pickupNoticeText(), 'f_pickup_notice')).not.toBeNull()
    expect(sendToFamily(1, id, pickupNoticeText(), 'f_pickup_notice')).toBeNull()
    expect(messages(id).filter((m) => m.template === 'f_pickup_notice')).toHaveLength(1)
  })

  it('never asks the household for anything in a notice', () => {
    const id = seedOrder({ state: 'pickup_pending' })
    const body = pickupNoticeText()
    expect(body).toMatch(/nothing you need to do/i)
    expect(body).not.toMatch(/reply/i)
    expect(body).not.toContain(`#${id}`)
  })
})

describe('sendTemplate', () => {
  it('fires a vendor template on demand and keys the row to it', () => {
    const id = seedOrder({ state: 'dispatched', target_at: new Date().toISOString() })
    const sent = sendTemplate(id, 'v_eta_check')
    expect(sent.body).toContain(`#${id}`)
    expect(messages(id).find((m) => m.id === sent.message_id)!.template).toBe('v_eta_check')
  })

  it('surfaces the household gate reason instead of texting a grieving house', () => {
    const id = seedOrder({ state: 'delivered' })
    db.prepare("UPDATE patients SET status = 'deceased' WHERE id = 1").run()
    expect(() => sendTemplate(id, 'f_delivery_confirm')).toThrow(/deceased/)
  })
})

// --- Regression guards --------------------------------------------------------------

describe('messages filter guard', () => {
  it('a vendor thread never contains family rows', () => {
    const id = seedOrder({ state: 'pickup_pending' })
    ask(id, 'v_pickup_request', () => 'vendor text')
    sendToFamily(1, id, pickupNoticeText(), 'f_pickup_notice')

    const rows = db
      .prepare("SELECT * FROM messages WHERE vendor_id = ? AND recipient_type = 'vendor' ORDER BY id")
      .all(1) as { recipient_type: string }[]

    expect(rows).toHaveLength(1)
    expect(rows.every((r) => r.recipient_type === 'vendor')).toBe(true)
    expect(messages(id)).toHaveLength(2)
  })
})

describe('silence ladder nag detection', () => {
  it('nags once across three ticks even after the nag body changes', () => {
    const id = seedOrder({ created_at: new Date(Date.now() - 3 * 3_600_000).toISOString() })
    tick(new Date())
    expect(messages(id).filter((m) => m.template === 'v_ack_nag')).toHaveLength(1)

    db.prepare("UPDATE messages SET body = 'reworded nag copy' WHERE order_id = ? AND direction = 'out'").run(id)

    tick(new Date())
    tick(new Date(Date.now() + 60_000))

    expect(messages(id).filter((m) => m.direction === 'out')).toHaveLength(1)
  })
})

// A gateway delivers "1" as text like any other message — nothing arrives tagged as a
// digit. If a typed digit did not route like a structured one, the deterministic path
// would exist only for callers who already knew to send {digit}, and a vendor typing 1 on
// a real handset would reach a model instead of the routing table.
describe('a typed digit routes like a structured one', () => {
  it('body "1" accepts the order with no model in the loop', async () => {
    const id = seedOrder()
    const questionId = ask(id, 'v_order_request', (d) => orderRequestText(getOrder(id)!, 'SLC', d))

    const result = await handleReply({ reply_to_message_id: questionId, body: '1' })

    expect(result.outcome).toBe('applied')
    expect(result.digit).toBe('1')
    expect(getOrder(id)!.state).toBe('dispatched')

    const inbound = messages(id).find((m) => m.direction === 'in')!
    expect(inbound.confidence).toBe(1)
    expect(inbound.review_status).toBe('auto_applied')
  })

  it('leaves anything longer than a bare digit to the parse path', async () => {
    const id = seedOrder()
    const questionId = ask(id, 'v_order_request')

    const result = await handleReply({ reply_to_message_id: questionId, body: '1 but running late' })

    expect(result.digit).toBeNull()
    expect(result.outcome).toBe('review')
  })

  it('sends a typed digit with no route to a person rather than guessing', async () => {
    const id = seedOrder()
    const questionId = ask(id, 'v_order_request')

    const result = await handleReply({ reply_to_message_id: questionId, body: '9' })

    expect(result.outcome).toBe('unmapped')
  })
})

// --- Rotating reply codes -----------------------------------------------------------

// SMS is one flat thread with no reply-to. Three questions land seconds apart, the vendor
// answers the last one, and the two above it are buried and never answered at all — while
// the watchdog nags them and pushes them further up the screen. The pairs are the fix: the
// digits themselves carry the addressing, so a buried question stays answerable.
describe('rotating reply codes', () => {
  it('hands each open question its own pair, in order', () => {
    const first = seedOrder()
    const second = seedOrder()
    const third = seedOrder()

    ask(first, 'v_order_request')
    ask(second, 'v_order_request')
    ask(third, 'v_order_request')

    const slots = messages()
      .filter((m) => m.direction === 'out')
      .map((m) => m.reply_slot)
    expect(slots).toEqual([1, 3, 5])
  })

  it('states its own pair in the body, so a buried question needs nothing remembered', () => {
    const first = seedOrder()
    const second = seedOrder()
    ask(first, 'v_order_request', (d) => orderRequestText(getOrder(first)!, 'SLC', d))
    ask(second, 'v_order_request', (d) => orderRequestText(getOrder(second)!, 'SLC', d))

    const [a, b] = messages().filter((m) => m.direction === 'out')
    expect(a.body).toContain('Reply 1 to accept, 2 if')
    expect(b.body).toContain('Reply 3 to accept, 4 if')
  })

  it('answers the buried question, not the newest one', async () => {
    const buried = seedOrder()
    const newest = seedOrder()
    ask(buried, 'v_order_request')
    ask(newest, 'v_order_request')

    // "1" is the first order's pair even though the second question is the newest message.
    const result = await handleVendorInbound(1, '1')

    expect(result.outcome).toBe('applied')
    expect(getOrder(buried)!.state).toBe('dispatched')
    expect(getOrder(newest)!.state).toBe('ordered')
  })

  it('takes them in any order, days apart', async () => {
    const orders = [seedOrder(), seedOrder(), seedOrder()]
    orders.forEach((id) => ask(id, 'v_order_request'))

    await handleVendorInbound(1, '5')
    await handleVendorInbound(1, '1')
    await handleVendorInbound(1, '3')

    expect(orders.map((id) => getOrder(id)!.state)).toEqual(['dispatched', 'dispatched', 'dispatched'])
  })

  it('frees a pair once its question is answered, and reuses it', async () => {
    const first = seedOrder()
    ask(first, 'v_order_request')
    await handleVendorInbound(1, '1')

    const next = seedOrder()
    ask(next, 'v_order_request')

    expect(messages(next).find((m) => m.direction === 'out')!.reply_slot).toBe(1)
  })

  it('never recycles a pair while its question is still open', () => {
    const held = Array.from({ length: SLOT_BASES.length }, () => seedOrder())
    held.forEach((id) => ask(id, 'v_order_request'))

    const overflow = seedOrder()
    const sent = sendVendorQuestion(1, overflow, 'v_order_request', (d) =>
      orderRequestText(getOrder(overflow)!, 'SLC', d),
    )

    expect(sent).toBeNull()
    expect(messages(overflow).filter((m) => m.direction === 'out')).toHaveLength(0)
  })

  it('sends one digest instead, rather than a question whose digits belong to something else', () => {
    const held = Array.from({ length: SLOT_BASES.length }, () => seedOrder())
    held.forEach((id) => ask(id, 'v_order_request'))

    sendVendorQuestion(1, seedOrder(), 'v_order_request', () => 'overflow')
    sendVendorQuestion(1, seedOrder(), 'v_order_request', () => 'overflow')

    const digests = messages().filter((m) => m.template === 'v_backlog_digest')
    expect(digests, 'the digest is rate-limited, not sent once per blocked question').toHaveLength(1)
    expect(digests[0].reply_slot).toBeNull()
    expect(digests[0].body).toMatch(/\/portal\//)
  })

  // The blocked question has no code, so counting codes reports one fewer than the number
  // of orders actually waiting — and undercounts exactly the order nobody has been told about.
  it('counts the orders waiting, including the one it could not send', () => {
    const held = Array.from({ length: SLOT_BASES.length }, () => seedOrder())
    held.forEach((id) => ask(id, 'v_order_request'))
    seedOrder() // the sixth, blocked and codeless

    sendVendorQuestion(1, seedOrder(), 'v_order_request', () => 'overflow')

    const digest = messages().find((m) => m.template === 'v_backlog_digest')!
    expect(digest.body).toMatch(/^You have 7 open orders/)
  })

  // The count and the page behind the link come from one call, so a vendor is never told
  // a number the page then contradicts.
  it('counts exactly what the link will show', () => {
    const held = Array.from({ length: SLOT_BASES.length }, () => seedOrder())
    held.forEach((id) => ask(id, 'v_order_request'))
    seedOrder({ state: 'delivered' }) // done — must not be counted or listed

    sendVendorQuestion(1, seedOrder(), 'v_order_request', () => 'overflow')

    const digest = messages().find((m) => m.template === 'v_backlog_digest')!
    expect(digest.body).toContain(`You have ${portalOrders(1).length} open orders`)
    expect(digest.body).toMatch(/^You have 6 open orders/)
  })

  // watchdog.ts fires v_ack_nag at an order whose v_order_request is still unanswered.
  // Allocating a second pair there would put two live codes on one order — two different
  // digits that both mean "accept #1042" — and spend 40% of the vendor's reply space on it.
  it("reuses the order's own pair for a follow-up instead of spending a new one", () => {
    const id = seedOrder()
    ask(id, 'v_order_request')
    ask(id, 'v_ack_nag')

    const outbound = messages(id).filter((m) => m.direction === 'out')
    expect(outbound).toHaveLength(2)
    expect(outbound[1].reply_slot).toBe(outbound[0].reply_slot)
  })

  // A request and the nag chasing it are two rows and one question. Counting rows tells a
  // vendor with two open orders that they have three, and names one of them twice.
  it('counts a nagged order once, not once per message', async () => {
    const nagged = seedOrder()
    const other = seedOrder()
    ask(nagged, 'v_order_request')
    ask(nagged, 'v_ack_nag')
    ask(other, 'v_order_request')

    const result = await handleVendorInbound(1, '9')

    expect(result.prompt).toBe(
      `That code doesn't match anything open. Reply 1 or 2 for #${nagged}, 3 or 4 for #${other}.`,
    )
  })

  it('closes the original request when the nag is answered, so the pair is not held forever', async () => {
    const id = seedOrder()
    ask(id, 'v_order_request')
    ask(id, 'v_ack_nag')

    await handleVendorInbound(1, '1')

    // Every outbound row holding a pair, not every outbound row: the acknowledgement text
    // that follows the reply is conversational — no slot, nothing to answer.
    expect(
      messages(id)
        .filter((m) => m.direction === 'out' && m.reply_slot !== null)
        .every((m) => m.answered_at !== null),
    ).toBe(true)
  })

  // The ledger is read aloud on stage. A note that hardcodes "(replied 1)" would print a
  // digit the vendor never typed the moment the pair rotates.
  it('records the digit that was actually received, not the one the table was written with', async () => {
    const first = seedOrder()
    const second = seedOrder()
    ask(first, 'v_order_request')
    ask(second, 'v_order_request')

    await handleVendorInbound(1, '3')

    const applied = messages(second).find((m) => m.direction === 'in')!
    expect(applied.parsed!.notes).toBe('Vendor accepted by text (replied 3)')
  })

  it('pairs 9 with 0, because a keypad has ten keys', async () => {
    expect(slotDigits(9)).toEqual(['9', '0'])
    const orders = Array.from({ length: SLOT_BASES.length }, () =>
      seedOrder({ state: 'dispatched', target_at: new Date().toISOString() }),
    )
    orders.forEach((id) => ask(id, 'v_eta_check'))

    const result = await handleVendorInbound(1, '0')

    expect(result.outcome).toBe('prompt')
    expect(result.prompt).toMatch(/when do you expect/i)
  })
})

// A gateway hands us a sender and a body and nothing else. Ownership is what makes the
// deterministic table reachable from there — before the pairs, this path had no choice but
// to hand "1" to a model, which then correctly refused to guess between the open orders.
describe('inbound with no reply-to', () => {
  it('routes an owned digit through the table with no model in the loop', async () => {
    const id = seedOrder()
    const questionId = ask(id, 'v_order_request')

    const result = await handleVendorInbound(1, '1')

    expect(result.outcome).toBe('applied')
    // The caller passed no reply-to and there is none to pass; the server derived which
    // question this answered from the digit alone. That is the whole point of the pairs.
    expect(result.in_reply_to).toBe(questionId)
    expect(getOrder(id)!.state).toBe('dispatched')
    expect(messages(id).find((m) => m.direction === 'in')!.confidence).toBe(1)
  })

  it('asks which order rather than applying a digit nothing owns', async () => {
    const a = seedOrder()
    const b = seedOrder()
    ask(a, 'v_order_request')
    ask(b, 'v_order_request')

    const result = await handleVendorInbound(1, '7')

    expect(result.outcome).toBe('clarify')
    expect(result.prompt).toContain(`#${a}`)
    expect(result.prompt).toContain(`#${b}`)
    expect(getOrder(a)!.state).toBe('ordered')
    expect(getOrder(b)!.state).toBe('ordered')
  })

  it('still puts the unmatched reply in front of a person', async () => {
    const id = seedOrder()
    ask(id, 'v_order_request')

    await handleVendorInbound(1, '7')

    const inbound = messages().filter((m) => m.direction === 'in')
    expect(inbound).toHaveLength(1)
    expect(inbound[0].review_status).toBe('needs_review')
  })

  it('links out instead of listing once there are more than two open questions', async () => {
    const orders = [seedOrder(), seedOrder(), seedOrder()]
    orders.forEach((id) => ask(id, 'v_order_request'))

    const result = await handleVendorInbound(1, '9')

    expect(result.outcome).toBe('clarify')
    expect(result.prompt).toMatch(/\/portal\//)
  })

  it('has nothing to clarify when no question is open — review queue plus a generic receipt', async () => {
    const result = await handleVendorInbound(1, '1')

    expect(result.outcome).toBe('review')
    expect(result.prompt).toBeNull()
    const out = messages().filter((m) => m.direction === 'out')
    expect(out).toHaveLength(1)
    // The receipt echoes the digit back — the sender must recognise which text it answers.
    expect(out[0].body).toMatch(/Got your "1" — no open request matches that code/)
  })
})

describe('acknowledgement receipts', () => {
  function acks(orderId?: number) {
    return messages(orderId).filter((m) => m.direction === 'out' && m.template === null && m.reply_slot === null)
  }

  it('texts back what happened when an accept digit applies', async () => {
    const id = seedOrder()
    ask(id, 'v_order_request')

    await handleVendorInbound(1, '1')

    const receipts = acks(id)
    expect(receipts).toHaveLength(1)
    // Echoes the digit as the lead — in a flat thread that's how the sender knows which
    // of their texts this receipt answers.
    expect(receipts[0].body).toMatch(new RegExp(`Got your "1" — order #${id}.*confirmed with you`))
  })

  it("texts back the reassignment promise on can't-fill", async () => {
    const id = seedOrder()
    ask(id, 'v_order_request')

    await handleVendorInbound(1, '2')

    const receipts = acks(id)
    expect(receipts).toHaveLength(1)
    expect(receipts[0].body).toMatch(new RegExp(`we'll reassign order #${id}`))
  })

  it('does not double-text on the prompt path — the follow-up question is the receipt', async () => {
    const id = seedOrder({ state: 'pickup_pending' })
    ask(id, 'v_pickup_request')

    await handleVendorInbound(1, '2')

    const conversational = acks(id)
    expect(conversational).toHaveLength(1)
    expect(conversational[0].body).toBe('When can you collect it? Text back a day and time.')
  })

  it('echoes the digit and names the order when a reply lands on an answered question', async () => {
    const id = seedOrder()
    const questionId = ask(id, 'v_order_request')
    await handleReply({ reply_to_message_id: questionId, digit: '1' })

    const result = await handleReply({ reply_to_message_id: questionId, digit: '1' })

    expect(result.outcome).toBe('review')
    const receipts = acks(id).filter((m) => /coordinator will take a look/.test(m.body))
    expect(receipts).toHaveLength(1)
    expect(receipts[0].body).toMatch(new RegExp(`Got your "1" — order #${id} .* was already updated earlier`))
  })

  it('echoes the digit and names the order when the digit is not one of its codes', async () => {
    const id = seedOrder()
    const questionId = ask(id, 'v_order_request')

    const result = await handleReply({ reply_to_message_id: questionId, digit: '9' })

    expect(result.outcome).toBe('unmapped')
    const receipts = acks(id)
    expect(receipts).toHaveLength(1)
    expect(receipts[0].body).toMatch(new RegExp(`Got your "9" — that's not one of the reply codes for order #${id}`))
  })

  it('sends the generic receipt for prose that lands in the review queue', async () => {
    const id = seedOrder()
    ask(id, 'v_order_request')

    const result = await handleVendorInbound(1, 'truck is down, not sure about this week')

    expect(result.outcome).toBe('review')
    const receipts = messages().filter(
      (m) => m.direction === 'out' && m.template === null && /coordinator will take a look/.test(m.body),
    )
    expect(receipts).toHaveLength(1)
  })

  it('a repeated digit through the gateway names the order it already updated', async () => {
    const id = seedOrder()
    ask(id, 'v_order_request')
    await handleVendorInbound(1, '1')

    const result = await handleVendorInbound(1, '1')

    expect(result.outcome).toBe('review')
    const stale = messages().filter((m) => m.direction === 'out' && /already updated earlier/.test(m.body))
    expect(stale).toHaveLength(1)
    expect(stale[0].body).toMatch(new RegExp(`Got your "1" — order #${id}`))
  })

  it('acknowledgements own no reply pair and never count as questions', async () => {
    const id = seedOrder()
    ask(id, 'v_order_request')
    await handleVendorInbound(1, '1')

    for (const receipt of acks(id)) {
      expect(receipt.reply_slot).toBeNull()
      expect(receipt.answered_at).toBeNull()
    }
  })
})
