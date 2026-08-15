import type { Escalation, Order, OrderEventType, Patient, ServerEvent, Vendor } from '../../../shared/types'
import type { Expectation } from './expectedEvents'

export interface NarrationWorld {
  orders: Order[]
  patients: Patient[]
  vendors: Vendor[]
  escalations: Escalation[]
}

export type NarrationTone = 'neutral' | 'good' | 'alert'

export type SuppressReason = 'muted_type' | 'own_action' | 'not_narratable'

export type NarrationDecision =
  | { narrate: false; reason: SuppressReason }
  | {
      narrate: true
      orderId: number
      title: string
      description: string | null
      tone: NarrationTone
      /** The "Frank's hospital bed" phrase, so collapseNarrations() can title a group without a world. */
      subject: string
    }

export interface NarrationToast {
  title: string
  description: string | null
  tone: NarrationTone
  pulseOrderIds: number[]
}

/** Fires on every score delta, every 30s, per order — and always alongside a delivery event. */
const MUTED_TYPES: OrderEventType[] = ['risk_updated', 'family_notified']

const DESCRIPTION_MAX = 120

const TONE_RANK: Record<NarrationTone, number> = { neutral: 0, good: 1, alert: 2 }

/** Phase 1 — cheap, data-free. Answers "could this ever narrate?" so the hook can skip the fetch. */
export function isNarratableType(event: ServerEvent): boolean {
  switch (event.type) {
    case 'heartbeat':
      return false
    case 'message':
      return false
    case 'escalation':
      return true
    case 'order_event':
      return !MUTED_TYPES.includes(event.event_type)
  }
}

/** Phase 2 — the whole decision, given a fresh world and the live expectations. Pure. */
export function decideNarration(
  event: ServerEvent,
  world: NarrationWorld,
  expectations: Expectation[],
  now: number,
): NarrationDecision {
  if (event.type === 'heartbeat' || event.type === 'message') {
    return { narrate: false, reason: 'not_narratable' }
  }
  if (event.type === 'order_event' && MUTED_TYPES.includes(event.event_type)) {
    return { narrate: false, reason: 'muted_type' }
  }

  const order = world.orders.find((o) => o.id === event.order_id)
  if (!order) return { narrate: false, reason: 'not_narratable' }

  const eventType = event.type === 'order_event' ? event.event_type : null
  if (isOwnAction(order, eventType, expectations, now)) {
    return { narrate: false, reason: 'own_action' }
  }

  const subject = subjectOf(order, world)

  if (event.type === 'escalation') {
    const escalation = world.escalations.find((e) => e.id === event.escalation_id)
    return {
      narrate: true,
      orderId: order.id,
      title: `${stateSentence(order, world, subject)} — escalated`,
      description: escalation ? truncate(escalation.reason, DESCRIPTION_MAX) : null,
      tone: 'alert',
      subject,
    }
  }

  return {
    narrate: true,
    orderId: order.id,
    title: titleFor(event.event_type, order, world, subject),
    description: null,
    tone: toneFor(event.event_type),
    subject,
  }
}

/** Batch-scoped collapse. Same order twice or more → one "3 updates on …" toast. Pure. */
export function collapseNarrations(decisions: NarrationDecision[]): NarrationToast[] {
  const groups = new Map<number, Extract<NarrationDecision, { narrate: true }>[]>()
  for (const decision of decisions) {
    if (!decision.narrate) continue
    const group = groups.get(decision.orderId)
    if (group) group.push(decision)
    else groups.set(decision.orderId, [decision])
  }

  const toasts: NarrationToast[] = []
  for (const [orderId, group] of groups) {
    if (group.length === 1) {
      const only = group[0]
      toasts.push({
        title: only.title,
        description: only.description,
        tone: only.tone,
        pulseOrderIds: [orderId],
      })
      continue
    }
    const last = group[group.length - 1]
    const tone = group.reduce<NarrationTone>(
      (worst, d) => (TONE_RANK[d.tone] > TONE_RANK[worst] ? d.tone : worst),
      'neutral',
    )
    toasts.push({
      title: `${group.length} updates on ${last.subject}`,
      description: null,
      tone,
      pulseOrderIds: [orderId],
    })
  }
  return toasts
}

export function shortEquipment(equipmentName: string): string {
  return equipmentName.split(',')[0].trim().toLowerCase()
}

export function firstName(fullName: string): string {
  return fullName.trim().split(' ')[0]
}

function isOwnAction(
  order: Order,
  eventType: OrderEventType | null,
  expectations: Expectation[],
  now: number,
): boolean {
  const orderKey = `order:${order.id}`
  const patientKey = `patient:${order.patient_id}`
  return expectations.some((e) => {
    if (e.until <= now) return false
    if (e.key !== orderKey && e.key !== patientKey) return false
    if (e.types === null) return true
    return eventType !== null && e.types.includes(eventType)
  })
}

function subjectOf(order: Order, world: NarrationWorld): string {
  const patient = world.patients.find((p) => p.id === order.patient_id)
  if (!patient) return `Order #${order.id}`
  return `${firstName(patient.name)}'s ${shortEquipment(order.equipment_name)}`
}

function vendorOf(order: Order, world: NarrationWorld): string {
  return world.vendors.find((v) => v.id === order.vendor_id)?.name ?? 'The vendor'
}

function patientFirstName(order: Order, world: NarrationWorld): string | null {
  const patient = world.patients.find((p) => p.id === order.patient_id)
  return patient ? firstName(patient.name) : null
}

function titleFor(
  eventType: OrderEventType,
  order: Order,
  world: NarrationWorld,
  subject: string,
): string {
  const vendor = vendorOf(order, world)
  const first = patientFirstName(order, world)

  switch (eventType) {
    case 'order_placed':
      return first ? `New order for ${first} — ${shortEquipment(order.equipment_name)}` : `New order — ${subject}`
    case 'vendor_accepted':
      return `${vendor} accepted ${subject}`
    case 'eta_set':
      return `${vendor} set an ETA for ${subject}${order.eta_at ? ` — ${whenText(order.eta_at)}` : ''}`
    case 'out_for_delivery':
      return `${subject} is on the truck`
    case 'delivered':
      return order.delivery_verified
        ? `${subject} was delivered — signed for`
        : `${vendor} says ${subject} was delivered`
    case 'family_confirmed':
      return first
        ? `${first}'s family confirmed the ${shortEquipment(order.equipment_name)} arrived`
        : `The family confirmed ${subject} arrived`
    case 'pickup_triggered':
      return `Pickup requested for ${subject}`
    case 'pickup_overdue':
      return first ? `${first}'s pickup is overdue` : `Pickup is overdue for ${subject}`
    case 'picked_up':
      return `${subject} was picked up`
    case 'vendor_swapped':
      return `${subject} moved to ${vendor}`
    case 'cancelled':
      return first ? `${subject} order was cancelled` : `${subject} was cancelled`
    case 'risk_updated':
    case 'family_notified':
      return subject
  }
}

function toneFor(eventType: OrderEventType): NarrationTone {
  switch (eventType) {
    case 'vendor_accepted':
    case 'delivered':
    case 'family_confirmed':
    case 'picked_up':
      return 'good'
    case 'pickup_overdue':
      return 'alert'
    default:
      return 'neutral'
  }
}

function stateSentence(order: Order, world: NarrationWorld, subject: string): string {
  const first = patientFirstName(order, world)
  if (order.state === 'pickup_overdue') {
    return first ? `${first}'s pickup is overdue` : `Pickup is overdue for ${subject}`
  }
  if (order.state === 'pickup_pending') {
    return first ? `${first}'s pickup is running late` : `The pickup for ${subject} is running late`
  }
  return `${subject} is at risk`
}

function whenText(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  return at.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}
