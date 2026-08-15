import { db } from './db'
import { broadcast } from './sse'
import {
  ackNagText,
  applyParsed,
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
  sendToFamily,
  sendToVendor,
} from './messaging'
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
 * Template x digit -> action. At a known lifecycle moment a digit has exactly one meaning,
 * so no model needs to read it: the same "1" means "yes, it arrived" under
 * f_delivery_confirm and "the equipment is unusable" under f_condition_check. The question
 * carries the meaning, and the question is a column. Anything this table does not resolve
 * goes to the review queue rather than being guessed at.
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
  notes: 'Vendor accepted by text (replied 1)',
}

// Digit 2 escalates directly rather than routing through applyParsed: a digit reply has no
// parsed payload, and the reason names the template the vendor answered.
const CANT_FILL: ReplyAction = {
  kind: 'escalate',
  reason: (order) => `Vendor can't fill order #${order.id} — reassign`,
}

const CONDITION: ReplyAction = { kind: 'delegate', handler: 'condition' }

export const REPLY_ROUTES: Partial<Record<MessageTemplate, Record<string, ReplyAction>>> = {
  v_order_request: { '1': ACCEPT, '2': CANT_FILL },
  v_ack_nag: { '1': ACCEPT, '2': CANT_FILL },
  v_eta_check: {
    '1': {
      kind: 'apply',
      intent: 'eta_update',
      eta: 'target_at',
      notes: 'Vendor confirmed the delivery is on schedule (replied 1)',
    },
    '2': { kind: 'prompt', text: 'When do you expect to deliver? Text back a day and time.' },
  },
  v_pickup_request: {
    // eta stays null on purpose: pickupAnchor() re-anchors the overdue clock on any
    // eta_set that lands after pickup_triggered, so writing "today" here would let a
    // vendor stay permanently not-overdue by texting 1 once a day. See SMS-SIM-SPEC 6.4.
    '1': {
      kind: 'apply',
      intent: 'pickup_scheduled',
      eta: null,
      notes: 'Vendor says they can collect it today (replied 1)',
    },
    '2': { kind: 'prompt', text: 'When can you collect it? Text back a day and time.' },
  },
  f_delivery_confirm: {
    '1': { kind: 'family_confirm', confirmed: true },
    '2': { kind: 'family_confirm', confirmed: false },
  },
  f_condition_check: { '1': CONDITION, '2': CONDITION, '3': CONDITION, '4': CONDITION, '5': CONDITION },
}

const VENDOR_BODY: Record<VendorTemplate, (order: Order, area: string) => string> = {
  v_order_request: (order, area) => orderRequestText(order, area),
  v_ack_nag: (order) => ackNagText(order),
  v_eta_check: (order) => etaCheckText(order),
  v_pickup_request: (order, area) => pickupRequestText(order, area),
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
    const vendorTemplate = template as VendorTemplate
    const area = (
      db.prepare('SELECT market FROM patients WHERE id = ?').get(order.patient_id) as { market: string } | undefined
    )?.market
    const body = VENDOR_BODY[vendorTemplate](order, area ?? '')
    return { message_id: sendToVendor(order.vendor_id, orderId, body, vendorTemplate), body }
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
      db.prepare('UPDATE messages SET answered_at = ? WHERE id = ? AND answered_at IS NULL').run(
        new Date().toISOString(),
        question.id,
      )
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
    outcome,
    prompt,
    order: question.order_id ? getOrder(question.order_id) : null,
  }
}

function routeDigit(question: Message, digit: string): SmsReplyResult {
  const order = question.order_id ? getOrder(question.order_id) : null
  const template = question.direction === 'out' ? question.template : null
  const action = template ? REPLY_ROUTES[template]?.[digit] : undefined

  if (!action || !order) {
    return result(question, recordInbound(question, digit, null, 'needs_review', false), digit, 'unmapped')
  }
  if (question.answered_at) {
    return result(question, recordInbound(question, digit, null, 'needs_review', false), digit, 'review')
  }

  switch (action.kind) {
    case 'apply': {
      const parsed: ParsedMessage = {
        order_ref: String(order.id),
        intent: action.intent,
        eta_iso: action.eta === 'target_at' ? order.target_at : null,
        notes: action.notes,
        confidence: 1,
      }
      const messageId = recordInbound(question, digit, parsed, 'auto_applied', true)
      try {
        applyParsed(order.id, parsed, 'vendor')
      } catch (err) {
        reopen(question.id, messageId)
        throw err
      }
      if (template === 'v_pickup_request') {
        sendToFamily(order.patient_id, order.id, pickupNoticeText('today'), 'f_pickup_notice')
      }
      return result(question, messageId, digit, 'applied')
    }

    case 'escalate': {
      const messageId = recordInbound(question, digit, null, 'auto_applied', true)
      escalate(order.id, action.reason(order))
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

  return digit ? routeDigit(question, digit) : routeText(question, body)
}
