import { db } from './db'
import { broadcast } from './sse'
import { extractJson } from './llm'
import { applyEvent, escalate } from './statemachine'
import { listOrders, getOrder } from './store'
import { magicLink } from './portal'
import type {
  Actor,
  FamilyTemplate,
  Message,
  MessageTemplate,
  Order,
  OrderEventType,
  ParsedMessage,
  VendorTemplate,
} from '../shared/types'

export const CONFIDENCE_THRESHOLD = 0.8

interface OutboundRow {
  orderId: number | null
  vendorId: number
  patientId: number | null
  recipientType: 'vendor' | 'family'
  template: MessageTemplate | null
  body: string
}

function insertMessage(row: OutboundRow): number {
  const result = db
    .prepare(
      "INSERT INTO messages (order_id, vendor_id, direction, body, recipient_type, patient_id, template) VALUES (?, ?, 'out', ?, ?, ?, ?)",
    )
    .run(row.orderId, row.vendorId, row.body, row.recipientType, row.patientId, row.template)
  const id = Number(result.lastInsertRowid)
  broadcast({ type: 'message', message_id: id, vendor_id: row.vendorId, direction: 'out' })
  return id
}

export function sendToVendor(
  vendorId: number,
  orderId: number | null,
  body: string,
  template?: VendorTemplate,
): number {
  return insertMessage({
    orderId,
    vendorId,
    patientId: null,
    recipientType: 'vendor',
    template: template ?? null,
    body,
  })
}

/** Returns the new message id, or null when the household gate refuses the send. */
export function sendToFamily(
  patientId: number,
  orderId: number,
  body: string,
  template: FamilyTemplate,
): number | null {
  const order = getOrder(orderId)
  if (!order) return null
  if (!householdGate(order, template).ok) return null
  return insertMessage({
    orderId,
    // Denormalized join key: messages.vendor_id stays NOT NULL, so a family row carries
    // the order's vendor. recipient_type is the thread discriminator, never vendor_id.
    vendorId: order.vendor_id,
    patientId,
    recipientType: 'family',
    template,
    body,
  })
}

const FAMILY_QUESTIONS: FamilyTemplate[] = ['f_delivery_confirm', 'f_condition_check']

interface HouseholdContact {
  status: string
  caregiver_phone: string
  contact_ok: number
}

/**
 * One gate for every family send. Questions need a living patient and an empty thread;
 * notices are permitted after a death but carry no digits and go out once per order.
 */
export function householdGate(order: Order, template: FamilyTemplate): { ok: boolean; reason?: string } {
  const patient = db
    .prepare('SELECT status, caregiver_phone, contact_ok FROM patients WHERE id = ?')
    .get(order.patient_id) as HouseholdContact | undefined

  if (!patient) return { ok: false, reason: 'patient not found' }
  if (!patient.contact_ok) return { ok: false, reason: 'household opted out' }
  if (!patient.caregiver_phone) return { ok: false, reason: 'no caregiver phone on file' }

  if (FAMILY_QUESTIONS.includes(template)) {
    if (patient.status === 'deceased') {
      return { ok: false, reason: 'patient deceased — this channel stays silent' }
    }
    const open = db
      .prepare(
        `SELECT id FROM messages WHERE patient_id = ? AND direction = 'out' AND recipient_type = 'family'
           AND template IN ('f_delivery_confirm', 'f_condition_check') AND answered_at IS NULL`,
      )
      .get(order.patient_id)
    if (open) return { ok: false, reason: 'a question is already open in this household thread' }
    return { ok: true }
  }

  const already = db
    .prepare("SELECT id FROM messages WHERE order_id = ? AND recipient_type = 'family' AND template = ?")
    .get(order.id, template)
  if (already) return { ok: false, reason: 'already sent for this order' }
  return { ok: true }
}

export function orderRequestText(order: Order, patientArea: string): string {
  const deadline = order.target_at ? new Date(order.target_at).toLocaleString() : 'ASAP'
  return `New order #${order.id}: ${order.quantity}x ${order.equipment_name} (${order.hcpcs_code}), deliver by ${deadline}, area ${patientArea}. Reply 1 to accept, 2 if you can't fill it — or confirm here: ${magicLink(order.vendor_id)}`
}

export function pickupRequestText(order: Order, patientArea?: string): string {
  const where = patientArea ? `, area ${patientArea}` : ''
  return `Pickup needed for order #${order.id} (${order.equipment_name})${where}. Family is present — please schedule promptly. Reply 1 if you can get it today, 2 to give us a window: ${magicLink(order.vendor_id)}`
}

export function ackNagText(order: Order): string {
  return `Order #${order.id} (${order.equipment_name}) hasn't been confirmed — reply 1 to accept, 2 if you can't fill it, or tap to accept or decline: ${magicLink(order.vendor_id)}`
}

export function etaCheckText(order: Order): string {
  const due = order.target_at ? new Date(order.target_at).toLocaleString() : 'today'
  return `Order #${order.id} (${order.equipment_name}) is due today by ${due}. Reply 1 if you're on schedule, 2 if it'll be late: ${magicLink(order.vendor_id)}`
}

// Household copy. Stricter than the vendor templates: equipment named generically, and
// no order number, patient name, HCPCS code, quantity or address anywhere.

export function deliveryConfirmText(order: Order): string {
  return `This is the hospice team. Our records show the ${order.equipment_name.toLowerCase()} was delivered today. Has it arrived? Reply 1 if yes, 2 if it hasn't. Nothing else is needed.`
}

export function etaNoticeText(order: Order): string {
  const when = order.eta_at ? new Date(order.eta_at).toLocaleString() : 'soon'
  return `Your hospice team: the ${order.equipment_name.toLowerCase()} is scheduled to arrive ${when}. No reply needed — we'll let you know if that changes.`
}

export function pickupNoticeText(when = ''): string {
  return `Your hospice team: someone will be by${when ? ` ${when}` : ''} to collect the equipment. You don't need to be there for it, and there's nothing you need to do.`
}

export function deliveredThanksText(order: Order): string {
  return `Your hospice team: the ${order.equipment_name.toLowerCase()} has been delivered and set up. If anything isn't right, call us — we'll handle it with the supplier.`
}

export function pickedUpThanksText(): string {
  return `Your hospice team: the equipment has been picked up. There's nothing else you need to do. We're thinking of your family.`
}

/** F2/F3: the household learns a time without ever being asked for one. */
export function notifyFamilyOfEta(order: Order): void {
  if (['ordered', 'dispatched', 'in_transit'].includes(order.state)) {
    sendToFamily(order.patient_id, order.id, etaNoticeText(order), 'f_eta_notice')
  } else if (order.state === 'pickup_pending' || order.state === 'pickup_overdue') {
    sendToFamily(order.patient_id, order.id, pickupNoticeText(), 'f_pickup_notice')
  }
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

export const INTENT_EVENT: Partial<Record<ParsedMessage['intent'], OrderEventType>> = {
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
  if (parsed.eta_iso && (eventType === 'eta_set' || eventType === 'vendor_accepted')) {
    notifyFamilyOfEta(getOrder(orderId)!)
  }
  if (parsed.intent === 'delay') {
    escalate(orderId, `Vendor reported a delay: ${parsed.notes ?? 'no details'}`)
  }
  if (parsed.intent === 'delivered') {
    escalate(
      orderId,
      `Order #${orderId} marked delivered by the vendor without proof of delivery — confirm with the family or request a POD`,
    )
    const order = getOrder(orderId)
    if (order && !order.delivery_verified) {
      sendToFamily(order.patient_id, orderId, deliveryConfirmText(order), 'f_delivery_confirm')
    }
  }
  if (parsed.intent === 'picked_up') {
    escalate(
      orderId,
      `Order #${orderId} marked picked up by the vendor without proof of pickup — confirm with the family or request a POD`,
    )
  }
}
