import { db } from './db'
import { broadcast } from './sse'
import { extractJson } from './llm'
import { applyEvent, escalate } from './statemachine'
import { listOrders, getOrder } from './store'
import type { Actor, Message, Order, OrderEventType, ParsedMessage } from '../shared/types'

export const CONFIDENCE_THRESHOLD = 0.8

export function sendToVendor(vendorId: number, orderId: number | null, body: string): void {
  const result = db
    .prepare("INSERT INTO messages (order_id, vendor_id, direction, body) VALUES (?, ?, 'out', ?)")
    .run(orderId, vendorId, body)
  broadcast({ type: 'message', message_id: Number(result.lastInsertRowid), vendor_id: vendorId, direction: 'out' })
}

export function orderRequestText(order: Order, patientArea: string): string {
  const deadline = order.target_at ? new Date(order.target_at).toLocaleString() : 'ASAP'
  return `New order #${order.id}: ${order.quantity}x ${order.equipment_name} (${order.hcpcs_code}), deliver by ${deadline}, area ${patientArea}. Reply YES to accept, or with your ETA.`
}

export function pickupRequestText(order: Order): string {
  return `Pickup needed for order #${order.id} (${order.equipment_name}). Family is present — please schedule promptly and reply with your pickup window.`
}

export function ackNagText(order: Order): string {
  return `Order #${order.id} (${order.equipment_name}) hasn't been confirmed — reply YES to accept or NO if you can't fill it.`
}

const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    order_ref: { type: ['string', 'null'] },
    intent: {
      type: 'string',
      enum: [
        'accept',
        'eta_update',
        'delay',
        'out_for_delivery',
        'delivered',
        'pickup_scheduled',
        'picked_up',
        'decline',
        'unknown',
      ],
    },
    eta_iso: { type: ['string', 'null'] },
    notes: { type: ['string', 'null'] },
    confidence: { type: 'number' },
  },
  required: ['order_ref', 'intent', 'eta_iso', 'notes', 'confidence'],
  additionalProperties: false,
}

const INTENT_EVENT: Partial<Record<ParsedMessage['intent'], OrderEventType>> = {
  accept: 'vendor_accepted',
  eta_update: 'eta_set',
  delay: 'eta_set',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  pickup_scheduled: 'eta_set',
  picked_up: 'picked_up',
}

function vendorContext(vendorId: number): string {
  const open = listOrders().filter(
    (o) => o.vendor_id === vendorId && !['picked_up', 'cancelled'].includes(o.state),
  )
  if (!open.length) return 'This vendor has no open orders.'
  return open
    .map(
      (o) =>
        `#${o.id}: ${o.equipment_name} (${o.hcpcs_code}), state=${o.state}, deadline=${o.target_at ?? 'none'}`,
    )
    .join('\n')
}

export async function handleInbound(vendorId: number, body: string): Promise<Message> {
  const result = db
    .prepare("INSERT INTO messages (order_id, vendor_id, direction, body, review_status) VALUES (NULL, ?, 'in', ?, 'needs_review')")
    .run(vendorId, body)
  const messageId = Number(result.lastInsertRowid)

  let parsed: ParsedMessage | null = null
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      parsed = await extractJson<ParsedMessage>({
        model: process.env.PARSE_MODEL,
        system: [
          'You parse SMS replies from durable medical equipment vendors into structured status updates for a hospice coordination system.',
          `Current local datetime: ${new Date().toString()}. Resolve relative times ("thursday morning", "late afternoon") in the LOCAL timezone — a named weekday means the next future occurrence of that weekday — then return eta_iso converted to UTC ISO 8601.`,
          `Intent definitions: accept = vendor confirms they will fulfill (use accept even when the message also gives an ETA — still fill eta_iso). eta_update = a new ETA for an order they already accepted. delay = it will still happen, but later than promised. decline = they cannot fulfill it and it needs reassignment — "can't do it", "unable to", "won't be able to" are declines even when a timeframe is mentioned. delivered / picked_up = only when it already happened. When the matched order is in a pickup state (pickup_pending / pickup_overdue), talk of grabbing, collecting, or picking equipment up means pickup_scheduled (future) or picked_up (done) — never accept.`,
          'Open orders for this vendor:',
          vendorContext(vendorId),
          'If the message clearly refers to exactly one open order, set order_ref to that order number. If ambiguous or unrelated, set order_ref to null, intent to "unknown", and confidence below 0.5. Never guess.',
          'Set confidence to your honest calibration that both the intent and the order match are correct.',
        ].join('\n'),
        prompt: body,
        schema: PARSE_SCHEMA,
      })
    } catch (err) {
      console.error('[parse] failed:', err)
    }
  }

  let reviewStatus = 'needs_review'
  let orderId: number | null = null

  if (parsed) {
    orderId = parsed.order_ref ? Number(parsed.order_ref.replace(/\D/g, '')) || null : null
    const order = orderId ? getOrder(orderId) : null

    if (parsed.intent === 'decline' && order) {
      escalate(order.id, `Vendor declined order #${order.id}: ${parsed.notes ?? body}`)
      reviewStatus = 'auto_applied'
    } else if (
      parsed.confidence >= CONFIDENCE_THRESHOLD &&
      order &&
      INTENT_EVENT[parsed.intent]
    ) {
      try {
        applyParsed(order.id, parsed, 'ai')
        reviewStatus = 'auto_applied'
      } catch (err) {
        console.error('[parse] auto-apply rejected:', err)
        reviewStatus = 'needs_review'
      }
    }
  }

  db.prepare('UPDATE messages SET parsed = ?, confidence = ?, review_status = ?, order_id = ? WHERE id = ?').run(
    parsed ? JSON.stringify(parsed) : null,
    parsed?.confidence ?? null,
    reviewStatus,
    orderId,
    messageId,
  )

  broadcast({ type: 'message', message_id: messageId, vendor_id: vendorId, direction: 'in' })
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as Record<string, unknown>
  return { ...row, parsed } as unknown as Message
}

export function applyParsed(orderId: number, parsed: ParsedMessage, actor: Actor): void {
  if (parsed.intent === 'eta_update' && getOrder(orderId)?.state === 'ordered') {
    parsed = { ...parsed, intent: 'accept' }
  }
  const eventType = INTENT_EVENT[parsed.intent]
  if (!eventType) throw new Error(`intent ${parsed.intent} has no event mapping`)
  applyEvent(orderId, eventType, { eta_iso: parsed.eta_iso, notes: parsed.notes, source: 'vendor_message' }, actor)
  if (parsed.intent === 'delay') {
    escalate(orderId, `Vendor reported a delay: ${parsed.notes ?? 'no details'}`)
  }
}
