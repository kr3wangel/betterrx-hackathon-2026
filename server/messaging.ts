import { db } from './db'
import { broadcast } from './sse'
import { extractJson } from './llm'
import { applyEvent, escalate } from './statemachine'
import { listOrders, getOrder } from './store'
import { orderLink, portalLink, portalOrders } from './portal'
import { allocateSlot, liveQuestions, slotDigits, type SlotDigits } from './slots'
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
  replySlot?: number | null
}

function insertMessage(row: OutboundRow): number {
  const result = db
    .prepare(
      "INSERT INTO messages (order_id, vendor_id, direction, body, recipient_type, patient_id, template, reply_slot) VALUES (?, ?, 'out', ?, ?, ?, ?, ?)",
    )
    .run(row.orderId, row.vendorId, row.body, row.recipientType, row.patientId, row.template, row.replySlot ?? null)
  const id = Number(result.lastInsertRowid)
  broadcast({ type: 'message', message_id: id, vendor_id: row.vendorId, direction: 'out' })
  return id
}

/**
 * A conversational vendor send: the free-text prompts, and nothing else.
 *
 * Questions do not come through here. A templated vendor row always owns a reply pair —
 * that is what makes a bare digit routable — so it goes through sendVendorQuestion(),
 * which is the only thing that can allocate one.
 */
export function sendToVendor(vendorId: number, orderId: number | null, body: string): number {
  return insertMessage({ orderId, vendorId, patientId: null, recipientType: 'vendor', template: null, body })
}

export interface SentQuestion {
  message_id: number
  digits: SlotDigits
}

/**
 * Ask a vendor something over SMS.
 *
 * `render` takes the digits rather than the caller building the body first, because the
 * body has to state the pair it was given and the pair isn't known until allocation.
 *
 * Returns null when all five pairs are live. Nothing is queued: the watchdog re-derives
 * every 30 seconds, so a question that couldn't go out now simply goes out once a pair
 * frees up. What the vendor gets in the meantime is one digest, not silence — and never
 * a question whose digits belong to something else.
 */
export function sendVendorQuestion(
  vendorId: number,
  orderId: number | null,
  template: VendorTemplate,
  render: (digits: SlotDigits) => string,
): SentQuestion | null {
  const slot = allocateSlot(vendorId, orderId)
  if (slot === null) {
    maybeSendBacklogDigest(vendorId)
    return null
  }
  const digits = slotDigits(slot)
  const messageId = insertMessage({
    orderId,
    vendorId,
    patientId: null,
    recipientType: 'vendor',
    template,
    body: render(digits),
    replySlot: slot,
  })
  return { message_id: messageId, digits }
}

const DIGEST_QUIET_HOURS = Number(process.env.DIGEST_QUIET_HOURS ?? 4)

/**
 * Counts orders awaiting the vendor, not live reply codes.
 *
 * Those differ by exactly the thing that triggered the digest: the question we could not
 * send has no code, so counting codes reports one fewer than the number of orders actually
 * waiting — and undercounts precisely the order the vendor has heard nothing about.
 *
 * Deliberately the same call the link lands on, so the number in the text can never
 * disagree with the number of rows on the page.
 */
export function backlogDigestText(vendorId: number): string {
  const open = portalOrders(vendorId).length
  return `You have ${open} open orders and the reply codes above are all in use. Open them all here: ${portalLink(vendorId)}`
}

/**
 * The overflow valve, rate-limited because the watchdog would otherwise re-offer it every
 * tick — and a backlog nobody answers is exactly the case where more texts help least.
 */
export function maybeSendBacklogDigest(vendorId: number): number | null {
  const since = new Date(Date.now() - DIGEST_QUIET_HOURS * 3_600_000).toISOString()
  const recent = db
    .prepare(
      `SELECT id FROM messages WHERE vendor_id = ? AND direction = 'out' AND recipient_type = 'vendor'
         AND template = 'v_backlog_digest' AND created_at >= ?`,
    )
    .get(vendorId, since)
  if (recent) return null
  return insertMessage({
    orderId: null,
    vendorId,
    patientId: null,
    recipientType: 'vendor',
    template: 'v_backlog_digest',
    body: backlogDigestText(vendorId),
  })
}

/**
 * What to text back when a digit belongs to no open question — a typo, or an answer to a
 * pair that was retired. Naming the live pairs beats guessing and beats silently parking
 * it in a queue only the hospice can see. Past two open questions the list stops being
 * readable in a text, so it becomes a link.
 */
export function clarifyText(vendorId: number): string | null {
  const live = liveQuestions(vendorId)
  if (!live.length) return null
  if (live.length > 2) {
    return `That code doesn't match anything open. Your ${live.length} open orders are here: ${portalLink(vendorId)}`
  }
  // Ascending, so the codes read in the order the vendor's thread already shows them.
  const parts = [...live]
    .sort((a, b) => a.reply_slot! - b.reply_slot!)
    .map((q) => `${slotDigits(q.reply_slot!).join(' or ')} for #${q.order_id}`)
  return `That code doesn't match anything open. Reply ${parts.join(', ')}.`
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

/**
 * How a person writes a time in a text: "today 2:00 PM", "Sat 9:30 AM".
 *
 * toLocaleString() gives "8/15/2026, 12:21:32 PM" — 22 characters, seconds included, which
 * is as long as the whole link and reads like a log line. Nobody texts a deadline to the
 * second. Same day is "today", within the week is the weekday, beyond that a short date.
 */
function whenText(iso: string): string {
  const at = new Date(iso)
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  // setHours on a copy — mutating `at` here would silently move the date used below.
  const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000)
  if (days === 0) return `today ${time}`
  if (days === 1) return `tomorrow ${time}`
  if (days > 1 && days < 7) return `${at.toLocaleDateString([], { weekday: 'short' })} ${time}`
  return `${at.toLocaleDateString([], { month: 'numeric', day: 'numeric' })} ${time}`
}

// Every question states the pair it owns. That is the whole reason a buried message stays
// answerable: the vendor scrolls back to it and it tells them which digits are its own, so
// nothing has to be remembered and nothing has to be answered in order.

export function orderRequestText(order: Order, patientArea: string, [yes, no]: SlotDigits): string {
  const deadline = order.target_at ? whenText(order.target_at) : 'ASAP'
  return `New order #${order.id}: ${order.quantity}x ${order.equipment_name} (${order.hcpcs_code}), deliver by ${deadline}, area ${patientArea}. Reply ${yes} to accept, ${no} if you can't fill it — or confirm here: ${orderLink(order.id)}`
}

export function pickupRequestText(order: Order, patientArea: string | undefined, [yes, no]: SlotDigits): string {
  const where = patientArea ? `, area ${patientArea}` : ''
  return `Pickup needed for order #${order.id} (${order.equipment_name})${where}. Reply ${yes} if you can get it today, ${no} to give us a window: ${orderLink(order.id)}`
}

export function ackNagText(order: Order, [yes, no]: SlotDigits): string {
  return `Order #${order.id} (${order.equipment_name}) hasn't been confirmed — reply ${yes} to accept, ${no} if you can't fill it, or tap to accept or decline: ${orderLink(order.id)}`
}

export function etaCheckText(order: Order, [yes, no]: SlotDigits): string {
  const due = order.target_at ? whenText(order.target_at) : 'today'
  return `Order #${order.id} (${order.equipment_name}) is due ${due}. Reply ${yes} if you're on schedule, ${no} if it'll be late: ${orderLink(order.id)}`
}

// Household copy. Stricter than the vendor templates: equipment named generically, and
// no order number, patient name, HCPCS code, quantity or address anywhere.

export function deliveryConfirmText(order: Order): string {
  return `This is the hospice team. Our records show the ${order.equipment_name.toLowerCase()} was delivered today. Has it arrived? Reply 1 if yes, 2 if it hasn't. Nothing else is needed.`
}

export function etaNoticeText(order: Order): string {
  const when = order.eta_at ? whenText(order.eta_at) : 'soon'
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

/**
 * Conversational focus, as a hint and nothing more.
 *
 * Prose like "ok" or "we're on it" names no order and the open-order list alone can't
 * place it. The newest outstanding question usually can. It stays a prompt line rather
 * than a routing rule on purpose — the 0.8 gate still has to agree, and a hint can never
 * outvote a digit, which is resolved by ownership before a model is ever reached.
 */
function focusHint(vendorId: number): string {
  const newest = liveQuestions(vendorId)[0]
  if (!newest) return 'We have no question outstanding with this vendor right now.'
  return `The most recent question we asked this vendor was about order #${newest.order_id}. A bare answer that names no order most likely refers to that one — but never prefer it over an order the message names itself, and never let it rescue a message whose intent is unclear.`
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
          focusHint(vendorId),
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

    if (
      parsed.confidence >= CONFIDENCE_THRESHOLD &&
      order &&
      (INTENT_EVENT[parsed.intent] || parsed.intent === 'decline')
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
  if (parsed.intent === 'decline') {
    escalate(orderId, `Vendor declined order #${orderId}: ${parsed.notes ?? 'no reason given'}`)
    return
  }
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
