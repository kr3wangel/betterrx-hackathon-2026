import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../server/db'
import { QUICK_REPLIES } from '../shared/replies'
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
  sendToVendor,
  INTENT_EVENT,
} from '../server/messaging'
import { conditionCheckText, sendConditionCheck } from '../server/condition'
import { REPLY_ROUTES, handleReply, sendTemplate } from '../server/sms'
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

function sendVendorQuestion(orderId: number, template: VendorTemplate, body = 'question'): number {
  const order = getOrder(orderId)!
  sendToVendor(order.vendor_id, orderId, body, template)
  return lastMessageId()
}

function parsedDelivered(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return { order_ref: null, intent: 'delivered', eta_iso: null, notes: null, confidence: 0.95, ...overrides }
}

function familyRow(orderId: number, template: MessageTemplate) {
  return messages(orderId).find((m) => m.direction === 'out' && m.template === template)
}

// --- Table integrity ---------------------------------------------------------------

describe('REPLY_ROUTES table integrity', () => {
  it('every apply action maps to an intent the state machine knows', () => {
    for (const routes of Object.values(REPLY_ROUTES)) {
      for (const action of Object.values(routes!)) {
        if (action.kind === 'apply') expect(INTENT_EVENT[action.intent]).toBeTruthy()
      }
    }
  })

  it('routes only questions, never informational templates', () => {
    const valid: MessageTemplate[] = [
      'v_order_request',
      'v_ack_nag',
      'v_eta_check',
      'v_pickup_request',
      'f_delivery_confirm',
      'f_condition_check',
      'f_eta_notice',
      'f_pickup_notice',
      'f_delivered_thanks',
      'f_picked_up_thanks',
    ]
    const informational: MessageTemplate[] = [
      'f_eta_notice',
      'f_pickup_notice',
      'f_delivered_thanks',
      'f_picked_up_thanks',
    ]
    for (const key of Object.keys(REPLY_ROUTES)) {
      expect(valid).toContain(key as MessageTemplate)
      expect(informational).not.toContain(key as MessageTemplate)
    }
  })
})

// --- Vendor digits -----------------------------------------------------------------

describe('vendor digits', () => {
  it('V1 digit 1 accepts the order with no model in the loop', async () => {
    const id = seedOrder()
    const questionId = sendVendorQuestion(id, 'v_order_request', orderRequestText(getOrder(id)!, 'SLC'))

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
    const questionId = sendVendorQuestion(id, 'v_order_request')
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
    const questionId = sendVendorQuestion(id, 'v_ack_nag', ackNagText(getOrder(id)!))
    await handleReply({ reply_to_message_id: questionId, digit: '1' })
    expect(getOrder(id)!.state).toBe('dispatched')
  })

  it('V3 digit 1 confirms the target time as the ETA and leaves the state alone', async () => {
    const target = new Date(Date.now() + 4 * 3_600_000).toISOString()
    const id = seedOrder({ state: 'dispatched', target_at: target })
    const questionId = sendVendorQuestion(id, 'v_eta_check', etaCheckText(getOrder(id)!))

    await handleReply({ reply_to_message_id: questionId, digit: '1' })

    const order = getOrder(id)!
    expect(order.eta_at).toBe(target)
    expect(order.state).toBe('dispatched')
  })

  it('V3 digit 2 asks for a time instead of guessing one', async () => {
    const id = seedOrder({ state: 'dispatched', target_at: new Date().toISOString() })
    const questionId = sendVendorQuestion(id, 'v_eta_check')
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
    const questionId = sendVendorQuestion(id, 'v_pickup_request', pickupRequestText(getOrder(id)!))

    await handleReply({ reply_to_message_id: questionId, digit: '1' })

    expect(getOrder(id)!.eta_at).toBeNull()
    expect(events(id).some((e) => e.type === 'eta_set')).toBe(true)

    tick(new Date())
    expect(getOrder(id)!.state).toBe('pickup_overdue')
  })

  it('V4 digit 2 asks the vendor to name a window', async () => {
    const id = seedOrder({ state: 'pickup_pending' })
    const questionId = sendVendorQuestion(id, 'v_pickup_request')
    const result = await handleReply({ reply_to_message_id: questionId, digit: '2' })
    expect(result.outcome).toBe('prompt')
    expect(result.prompt).toMatch(/when can you collect/i)
  })

  it('a second answer to the same question is stored but applies nothing', async () => {
    const id = seedOrder()
    const questionId = sendVendorQuestion(id, 'v_order_request')
    await handleReply({ reply_to_message_id: questionId, digit: '1' })

    const result = await handleReply({ reply_to_message_id: questionId, digit: '1' })

    expect(result.outcome).toBe('review')
    expect(messages(id).filter((m) => m.direction === 'in' && m.review_status === 'needs_review')).toHaveLength(1)
    expect(events(id).filter((e) => e.type === 'vendor_accepted')).toHaveLength(1)
    expect(getOrder(id)!.state).toBe('dispatched')
  })

  it('a digit outside the template map goes to review', async () => {
    const id = seedOrder()
    const questionId = sendVendorQuestion(id, 'v_order_request')
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
    const questionId = sendVendorQuestion(id, 'v_order_request')
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
    sendToVendor(1, id, 'vendor text', 'v_pickup_request')
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

// The quick-reply buttons on the vendor's phone are a client-side table; the routing they
// depend on is a server-side one. A button offering a digit the server can't route returns
// outcome 'unmapped' and lands in the review queue instead of applying — which reads on
// stage as the product being broken, not as a missing case. Keep them honest here.
describe('quick replies match the reply routes', () => {
  it('every offered digit resolves to a real action', () => {
    for (const [template, replies] of Object.entries(QUICK_REPLIES)) {
      const routes = REPLY_ROUTES[template as MessageTemplate]
      expect(routes, `no REPLY_ROUTES entry for ${template}`).toBeTruthy()
      for (const { digit } of replies ?? []) {
        expect(routes?.[digit], `${template} offers "${digit}" with no route`).toBeTruthy()
      }
    }
  })

  it('every offered template is one the vendor actually receives', () => {
    for (const template of Object.keys(QUICK_REPLIES)) {
      expect(template.startsWith('v_'), `${template} is not a vendor template`).toBe(true)
    }
  })
})
