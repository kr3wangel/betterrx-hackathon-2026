import { db } from './db'
import { broadcast } from './sse'
import {
  ackNagText,
  applyParsed,
  clarifyText,
  deliveredThanksText,
  deliveryConfirmText,
  etaCheckText,
  etaNoticeText,
  handleInbound,
  householdGate,
  orderRequestText,
  pickedUpThanksText,
  pickupNoticeText,
  pickupRequestText,
  RECEIVED_ACK,
  sendToFamily,
  sendToVendor,
  sendVendorQuestion,
  vendorAckText,
} from './messaging'
import { closeSlot, digitOffset, resolveDigit, type SlotDigits } from './slots'
import { handleCaregiverReply, sendConditionCheck } from './condition'
import { applyEvent, escalate } from './statemachine'
import { getOrder, rowToMessage } from './store'
import type {
  FamilyTemplate,
  Message,
  MessageIntent,
  MessageTemplate,
  Order,
  ParsedMessage,
  ReviewStatus,
  SmsReplyResult,
  VendorTemplate,
} from '../shared/types'

/**
 * Template x position -> action. At a known lifecycle moment a reply has exactly one
 * meaning, so no model needs to read it: "yes" means "I accept" under v_order_request and
 * "I'm on schedule" under v_eta_check. The question carries the meaning, and the question
 * is a column. Anything these tables do not resolve goes to the review queue rather than
 * being guessed at.
 *
 * Vendors are indexed by position, not by digit, because vendor digits rotate — the pair a
 * question owns is what addresses it in a flat SMS thread (server/slots.ts). Offset 0 is
 * always the affirmative, offset 1 always the problem, whichever pair got allocated.
 */
export type ReplyAction =
  | { kind: 'apply'; intent: MessageIntent; eta: 'target_at' | null; notes: string }
  | { kind: 'escalate'; reason: (order: Order) => string }
  | { kind: 'prompt'; text: string }
  | { kind: 'family_confirm'; confirmed: boolean }
  | { kind: 'delegate'; handler: 'condition' }

const ACCEPT: ReplyAction = {
  kind: 'apply',
  intent: 'accept',
  eta: null,
  // No digit in any of these notes: routeDigit appends the one actually received, because
  // which digit means "accept" depends on the pair the question was allocated.
  notes: 'Vendor accepted by text',
}

// Digit 2 escalates directly rather than routing through applyParsed: a digit reply has no
// parsed payload, and the reason names the template the vendor answered.
const CANT_FILL: ReplyAction = {
  kind: 'escalate',
  reason: (order) => `Vendor can't fill order #${order.id} — reassign`,
}

const CONDITION: ReplyAction = { kind: 'delegate', handler: 'condition' }

/** [affirmative, problem] — the digits that mean these are whatever pair the row owns. */
export const VENDOR_ROUTES: Partial<Record<VendorTemplate, readonly [ReplyAction, ReplyAction]>> = {
  v_order_request: [ACCEPT, CANT_FILL],
  v_ack_nag: [ACCEPT, CANT_FILL],
  v_eta_check: [
    {
      kind: 'apply',
      intent: 'eta_update',
      eta: 'target_at',
      notes: 'Vendor confirmed the delivery is on schedule',
    },
    { kind: 'prompt', text: 'When do you expect to deliver? Text back a day and time.' },
  ],
  v_pickup_request: [
    // eta stays null on purpose: pickupAnchor() re-anchors the overdue clock on any
    // eta_set that lands after pickup_triggered, so writing "today" here would let a
    // vendor stay permanently not-overdue by answering yes once a day. See SMS-SIM-SPEC 6.4.
    {
      kind: 'apply',
      intent: 'pickup_scheduled',
      eta: null,
      notes: 'Vendor says they can collect it today',
    },
    { kind: 'prompt', text: 'When can you collect it? Text back a day and time.' },
  ],
}

/**
 * Households keep literal digits. Nothing rotates here: a family thread carries one
 * question at a time by householdGate(), so there is nothing to disambiguate, and
 * f_condition_check's 1-5 is a rating whose digits *are* the meaning.
 */
export const FAMILY_ROUTES: Partial<Record<FamilyTemplate, Record<string, ReplyAction>>> = {
  f_delivery_confirm: {
    '1': { kind: 'family_confirm', confirmed: true },
    '2': { kind: 'family_confirm', confirmed: false },
  },
  f_condition_check: { '1': CONDITION, '2': CONDITION, '3': CONDITION, '4': CONDITION, '5': CONDITION },
}

function isVendorTemplate(template: MessageTemplate): template is VendorTemplate {
  return template.startsWith('v_')
}

/**
 * The action a reply triggers, or undefined when nothing owns it.
 *
 * Vendor side, the digit must belong to the pair this row was allocated — that is the
 * ownership check, and it is what stops "1" from applying to whichever question happens to
 * be newest. An unowned digit resolves to nothing and is asked about, never guessed.
 */
function actionFor(question: Message, digit: string): ReplyAction | undefined {
  const template = question.direction === 'out' ? question.template : null
  if (!template) return undefined
  if (!isVendorTemplate(template)) return FAMILY_ROUTES[template]?.[digit]
  if (question.reply_slot === null) return undefined
  const offset = digitOffset(question.reply_slot, digit)
  return offset === null ? undefined : VENDOR_ROUTES[template]?.[offset]
}

type VendorQuestion = Exclude<VendorTemplate, 'v_backlog_digest'>

const VENDOR_BODY: Record<VendorQuestion, (order: Order, area: string, digits: SlotDigits) => string> = {
  v_order_request: (order, area, digits) => orderRequestText(order, area, digits),
  v_ack_nag: (order, _area, digits) => ackNagText(order, digits),
  v_eta_check: (order, _area, digits) => etaCheckText(order, digits),
  v_pickup_request: (order, area, digits) => pickupRequestText(order, area, digits),
}

const FAMILY_BODY: Record<Exclude<FamilyTemplate, 'f_condition_check'>, (order: Order) => string> = {
  f_delivery_confirm: deliveryConfirmText,
  f_eta_notice: etaNoticeText,
  f_pickup_notice: () => pickupNoticeText(),
  f_delivered_thanks: deliveredThanksText,
  f_picked_up_thanks: () => pickedUpThanksText(),
}

/** Presenter escape hatch: fire any template on demand, gate refusals included. */
export function sendTemplate(orderId: number, template: MessageTemplate): { message_id: number; body: string } {
  const order = getOrder(orderId)
  if (!order) throw Object.assign(new Error(`order ${orderId} not found`), { status: 404 })

  if (template === 'f_condition_check') {
    const check = sendConditionCheck(orderId)
    if (!check.sent) throw Object.assign(new Error(check.reason ?? 'refused'), { status: 409 })
    return { message_id: check.message_id!, body: check.body! }
  }

  if (template in VENDOR_BODY) {
    const vendorTemplate = template as VendorQuestion
    const area = (
      db.prepare('SELECT market FROM patients WHERE id = ?').get(order.patient_id) as { market: string } | undefined
    )?.market
    const sent = sendVendorQuestion(order.vendor_id, orderId, vendorTemplate, (digits) =>
      VENDOR_BODY[vendorTemplate](order, area ?? '', digits),
    )
    if (!sent) {
      throw Object.assign(new Error("this vendor's five reply codes are all in use — a digest went out instead"), {
        status: 409,
      })
    }
    const body = db.prepare('SELECT body FROM messages WHERE id = ?').get(sent.message_id) as { body: string }
    return { message_id: sent.message_id, body: body.body }
  }

  const familyTemplate = template as Exclude<FamilyTemplate, 'f_condition_check'>
  const gate = householdGate(order, familyTemplate)
  if (!gate.ok) throw Object.assign(new Error(gate.reason ?? 'refused'), { status: 409 })
  const body = FAMILY_BODY[familyTemplate](order)
  return { message_id: sendToFamily(order.patient_id, orderId, body, familyTemplate)!, body }
}

export interface ReplyInput {
  reply_to_message_id: number
  digit?: string | number | null
  body?: string | null
}

function recordInbound(
  question: Message,
  body: string,
  parsed: ParsedMessage | null,
  reviewStatus: ReviewStatus,
  answered: boolean,
): number {
  const write = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO messages (order_id, vendor_id, direction, body, parsed, confidence, review_status, recipient_type, patient_id)
         VALUES (?, ?, 'in', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        question.order_id,
        question.vendor_id,
        body,
        parsed ? JSON.stringify(parsed) : null,
        parsed?.confidence ?? null,
        reviewStatus,
        question.recipient_type,
        question.patient_id,
      )
    if (answered) {
      const at = new Date().toISOString()
      // Retiring the pair closes every question still holding it, not just the row that was
      // replied to: a nag reuses its order's original pair, and leaving the request open
      // would keep those digits allocated for the life of the order.
      if (question.reply_slot !== null) closeSlot(question.vendor_id, question.reply_slot, at)
      else db.prepare('UPDATE messages SET answered_at = ? WHERE id = ? AND answered_at IS NULL').run(at, question.id)
    }
    return Number(result.lastInsertRowid)
  })

  const id = write()
  broadcast({ type: 'message', message_id: id, vendor_id: question.vendor_id, direction: 'in' })
  return id
}

function reopen(questionId: number, messageId: number): void {
  db.prepare('UPDATE messages SET answered_at = NULL WHERE id = ?').run(questionId)
  db.prepare(
    "UPDATE messages SET review_status = 'needs_review', parsed = NULL, confidence = NULL WHERE id = ?",
  ).run(messageId)
}

function result(
  question: Message,
  messageId: number,
  digit: string | null,
  outcome: SmsReplyResult['outcome'],
  prompt: string | null = null,
): SmsReplyResult {
  return {
    message_id: messageId,
    in_reply_to: question.id,
    template: question.direction === 'out' ? question.template : null,
    digit,
    slot: question.reply_slot,
    outcome,
    prompt,
    order: question.order_id ? getOrder(question.order_id) : null,
  }
}

function routeDigit(question: Message, digit: string): SmsReplyResult {
  const order = question.order_id ? getOrder(question.order_id) : null
  const template = question.direction === 'out' ? question.template : null
  const action = actionFor(question, digit)

  // Even the dead ends get a receipt — the sender's phone shows nothing else, so silence
  // here reads as "the system ate my text". Vendor threads only: family dead-ends are
  // handled by the condition channel's own copy.
  if (!action || !order) {
    const messageId = recordInbound(question, digit, null, 'needs_review', false)
    if (question.recipient_type === 'vendor') sendToVendor(question.vendor_id, question.order_id, RECEIVED_ACK)
    return result(question, messageId, digit, 'unmapped')
  }
  if (question.answered_at) {
    const messageId = recordInbound(question, digit, null, 'needs_review', false)
    if (question.recipient_type === 'vendor') sendToVendor(question.vendor_id, question.order_id, RECEIVED_ACK)
    return result(question, messageId, digit, 'review')
  }

  switch (action.kind) {
    case 'apply': {
      const parsed: ParsedMessage = {
        order_ref: String(order.id),
        intent: action.intent,
        eta_iso: action.eta === 'target_at' ? order.target_at : null,
        notes: `${action.notes} (replied ${digit})`,
        confidence: 1,
      }
      const messageId = recordInbound(question, digit, parsed, 'auto_applied', true)
      try {
        applyParsed(order.id, parsed, 'vendor')
      } catch (err) {
        reopen(question.id, messageId)
        throw err
      }
      // The receipt, sent only after applyParsed committed — an ack for a reply that
      // bounced off the state machine would confirm something that never happened.
      sendToVendor(question.vendor_id, order.id, vendorAckText(order, action.intent))
      if (template === 'v_pickup_request') {
        sendToFamily(order.patient_id, order.id, pickupNoticeText('today'), 'f_pickup_notice')
      }
      return result(question, messageId, digit, 'applied')
    }

    case 'escalate': {
      const messageId = recordInbound(question, digit, null, 'auto_applied', true)
      escalate(order.id, action.reason(order))
      sendToVendor(question.vendor_id, order.id, vendorAckText(order, 'decline'))
      return result(question, messageId, digit, 'applied')
    }

    case 'prompt': {
      const messageId = recordInbound(question, digit, null, 'auto_applied', true)
      sendToVendor(question.vendor_id, order.id, action.text)
      return result(question, messageId, digit, 'prompt', action.text)
    }

    case 'family_confirm': {
      const messageId = recordInbound(question, digit, null, 'auto_applied', true)
      // Resolve before escalating: escalate() no-ops while an escalation is already open,
      // so a naive "family says no -> escalate" would write nothing at all. The reason
      // guard keeps a coincidental unrelated escalation from being cleared by a text.
      db.prepare(
        "UPDATE escalations SET status = 'resolved' WHERE order_id = ? AND status = 'open' AND reason LIKE '%without proof of%'",
      ).run(order.id)

      if (action.confirmed) {
        applyEvent(
          order.id,
          'family_confirmed',
          { confirms: 'delivery', via: 'sms', template, message_id: messageId },
          'family',
        )
        sendConditionCheck(order.id)
      } else {
        escalate(order.id, `Vendor reports order #${order.id} delivered; the family says it has not arrived`)
      }
      return result(question, messageId, digit, 'applied')
    }

    case 'delegate': {
      const reply = handleCaregiverReply(order.id, digit)
      const messageId = recordInbound(
        question,
        digit,
        null,
        reply.needs_review ? 'needs_review' : 'auto_applied',
        !reply.needs_review,
      )
      return result(question, messageId, digit, reply.needs_review ? 'review' : 'applied')
    }
  }
}

async function routeText(question: Message, body: string): Promise<SmsReplyResult> {
  // Vendor prose keeps going through extractJson() and the 0.8 confidence gate untouched.
  if (question.recipient_type === 'vendor') {
    const message = await handleInbound(question.vendor_id, body)
    return {
      message_id: message.id,
      in_reply_to: question.id,
      template: question.direction === 'out' ? question.template : null,
      digit: null,
      slot: question.reply_slot,
      outcome: message.review_status === 'auto_applied' ? 'applied' : 'review',
      prompt: null,
      order: message.order_id ? getOrder(message.order_id) : question.order_id ? getOrder(question.order_id) : null,
    }
  }

  // A household writing prose to a hospice is the last text on earth to hand to an
  // autonomous parser. The only family free text we read is a condition rating.
  const order = question.order_id ? getOrder(question.order_id) : null
  if (order && question.direction === 'out' && question.template === 'f_condition_check' && !question.answered_at) {
    const reply = handleCaregiverReply(order.id, body)
    const messageId = recordInbound(
      question,
      body,
      null,
      reply.needs_review ? 'needs_review' : 'auto_applied',
      !reply.needs_review,
    )
    return result(question, messageId, null, reply.needs_review ? 'review' : 'applied')
  }

  return result(question, recordInbound(question, body, null, 'needs_review', false), null, 'review')
}

export async function handleReply(input: ReplyInput): Promise<SmsReplyResult> {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(input.reply_to_message_id)
  if (!row) throw Object.assign(new Error('message not found'), { status: 404 })
  const question = rowToMessage(row as never)

  const digit = input.digit == null ? '' : String(input.digit).trim()
  const body = (input.body ?? '').trim()
  if (!digit && !body) throw Object.assign(new Error('digit or body required'), { status: 400 })

  // A gateway delivers "1" as text like any other message — nothing arrives tagged as a
  // digit. So a bare digit typed into the box has to route exactly like a structured one,
  // or the deterministic path would only exist for callers who already knew to use it.
  // Anything longer than a single digit is prose and still goes through routeText.
  const typed = !digit && DIGIT.test(body) ? body : ''
  const resolved = digit || typed

  return resolved ? routeDigit(question, resolved) : routeText(question, body)
}

/** 0 is in play because the fifth pair is (9, 0) — see server/slots.ts. */
const DIGIT = /^[0-9]$/

function orphanInbound(vendorId: number, body: string): number {
  const id = Number(
    db
      .prepare(
        "INSERT INTO messages (order_id, vendor_id, direction, body, review_status, recipient_type) VALUES (NULL, ?, 'in', ?, 'needs_review', 'vendor')",
      )
      .run(vendorId, body).lastInsertRowid,
  )
  broadcast({ type: 'message', message_id: id, vendor_id: vendorId, direction: 'in' })
  return id
}

/**
 * What a real SMS gateway hands us: a sender and a body, with no reply-to of any kind.
 *
 * This is where the rotating pairs pay for themselves. A bare digit is resolved by
 * *ownership* — which open question was allocated that pair — so the deterministic route
 * table is reachable over plain SMS instead of only from a caller that already knew which
 * message it was answering. Before the pairs existed, this path had no choice but to hand
 * "1" to a model, which then correctly refused to guess between the vendor's open orders.
 *
 * A digit nothing owns is a typo or an answer to a retired pair. We ask which order rather
 * than applying it to whatever is newest, and the reply still lands in the review queue so
 * the hospice sees it either way.
 */
export async function handleVendorInbound(vendorId: number, body: string): Promise<SmsReplyResult> {
  const text = body.trim()

  if (DIGIT.test(text)) {
    const owned = resolveDigit(vendorId, text)
    if (owned) return routeDigit(owned.question, text)

    const messageId = orphanInbound(vendorId, text)
    // The clarify text is itself the receipt; with nothing open to clarify against, the
    // generic one goes out instead — a text into the void must never get silence back.
    const clarify = clarifyText(vendorId)
    sendToVendor(vendorId, null, clarify ?? RECEIVED_ACK)
    return {
      message_id: messageId,
      in_reply_to: null,
      template: null,
      digit: text,
      slot: null,
      outcome: clarify ? 'clarify' : 'review',
      prompt: clarify,
      order: null,
    }
  }

  const message = await handleInbound(vendorId, body)
  return {
    message_id: message.id,
    in_reply_to: null,
    template: null,
    digit: null,
    slot: null,
    outcome: message.review_status === 'auto_applied' ? 'applied' : 'review',
    prompt: null,
    order: message.order_id ? getOrder(message.order_id) : null,
  }
}
