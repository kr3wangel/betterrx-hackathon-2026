import { createHash } from 'node:crypto'
import { db } from './db'
import { notifyFamilyOfEta } from './messaging'
import { broadcast } from './sse'
import { applyEvent, escalate } from './statemachine'
import { getOrder, listOrders } from './store'
import type { Order, Vendor, VendorLoad } from '../shared/types'

const SECRET = process.env.MAGIC_LINK_SECRET ?? 'demo-secret'

/**
 * States where the vendor still owes us something: not yet accepted, in flight, or
 * equipment not yet collected.
 *
 * `delivered` is deliberately absent. The vendor has done their part and nothing is asked
 * of them again until a pickup is triggered, which moves the order to `pickup_pending`.
 * This list used to be "everything except picked_up and cancelled", which meant a vendor
 * opening their link landed on 45 rows of which 39 were delivered and needed nothing —
 * the exact haystack the text was meant to spare them.
 */
const AWAITING_VENDOR = ['ordered', 'dispatched', 'in_transit', 'pickup_pending', 'pickup_overdue']

export function vendorToken(vendorId: number): string {
  return createHash('sha256').update(`vendor:${vendorId}:${SECRET}`).digest('hex').slice(0, 20)
}

function baseUrl(): string {
  return process.env.PORTAL_BASE_URL ?? 'http://localhost:5173'
}

export function magicLink(vendorId: number): string {
  return `${baseUrl()}/portal/${vendorToken(vendorId)}`
}

/**
 * The link that goes in a text about one order.
 *
 * Shorter than the vendor link on purpose — it sits in an SMS a dispatcher reads on a
 * phone, and the vendor-wide link put 28 characters of hex in every message. Ten hex
 * characters is 40 bits, which is not a security boundary and is not claimed as one: the
 * whole magic-link model here is "possession of the URL", exactly as the vendor link is.
 */
export function orderToken(orderId: number): string {
  return createHash('sha256').update(`order:${orderId}:${SECRET}`).digest('hex').slice(0, 10)
}

/**
 * No scheme in the text. "http://" is seven characters of nothing in a message a
 * dispatcher reads on a phone, and short links are written without it in practice; the
 * emulator's Linkify puts it back to build the href. The API links keep theirs.
 */
export function orderLink(orderId: number): string {
  return `${baseUrl().replace(/^https?:\/\//, '')}/o/${orderToken(orderId)}`
}

/** Scheme-stripped vendor-wide link, for the one SMS that has to cover several orders. */
export function portalLink(vendorId: number): string {
  return `${baseUrl().replace(/^https?:\/\//, '')}/portal/${vendorToken(vendorId)}`
}

export function resolveOrderToken(token: string): Order | null {
  return listOrders().find((o) => orderToken(o.id) === token) ?? null
}

export function resolveToken(token: string): Vendor | null {
  const vendors = db.prepare('SELECT * FROM vendors').all() as Vendor[]
  return vendors.find((v) => vendorToken(v.id) === token) ?? null
}

export function portalOrders(vendorId: number): Order[] {
  return listOrders().filter((o) => o.vendor_id === vendorId && AWAITING_VENDOR.includes(o.state))
}

const PICKUP_STATES = ['pickup_pending', 'pickup_overdue']

/**
 * The demo's calendar day, UTC. Seed and reader must agree on it or an evening rehearsal
 * in MDT reads yesterday's declarations as absent.
 */
export function demoDay(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * A stop is a household plus a direction — the same unit trip batching uses. Here it is a
 * same-day approximation of the batching spec's per-burst stop: everything a vendor still
 * owes one household in one direction is one visit.
 */
function stopKey(order: Order): string {
  return `${order.patient_id}:${PICKUP_STATES.includes(order.state) ? 'pickup' : 'delivery'}`
}

function declaredCapacity(vendorId: number, day: string): { stops: number; declared_at: string } | undefined {
  return db.prepare('SELECT stops, declared_at FROM vendor_capacity WHERE vendor_id = ? AND day = ?').get(vendorId, day) as
    | { stops: number; declared_at: string }
    | undefined
}

export function vendorLoad(vendorId: number, day: string = demoDay()): VendorLoad {
  const stops = new Map<string, Order[]>()
  for (const order of portalOrders(vendorId)) {
    const key = stopKey(order)
    stops.set(key, [...(stops.get(key) ?? []), order])
  }

  const now = Date.now()
  const dueToday = (order: Order): boolean => {
    // An undated pickup is "as soon as you can", which means today.
    if (PICKUP_STATES.includes(order.state)) return true
    if (!order.target_at) return false
    return order.target_at.slice(0, 10) === day || Date.parse(order.target_at) < now
  }

  const due = [...stops.values()].filter((orders) => orders.some(dueToday)).length
  const declaration = declaredCapacity(vendorId, day)
  const capacity = declaration ? declaration.stops : null

  return {
    vendor_id: vendorId,
    open_stops: stops.size,
    due_today_stops: due,
    overdue_pickups: [...stops.values()].filter((orders) => orders.some((o) => o.state === 'pickup_overdue')).length,
    capacity,
    declared_at: declaration ? declaration.declared_at : null,
    remaining_today: capacity === null ? null : Math.max(0, capacity - due),
  }
}

export function declareCapacity(vendorId: number, stops: number): VendorLoad {
  if (!Number.isInteger(stops) || stops < 0) {
    throw Object.assign(new Error('stops must be a whole number, zero or more'), { status: 400 })
  }
  db.prepare(
    'INSERT INTO vendor_capacity (vendor_id, day, stops, declared_at) VALUES (?, ?, ?, ?)' +
      ' ON CONFLICT (vendor_id, day) DO UPDATE SET stops = excluded.stops, declared_at = excluded.declared_at',
  ).run(vendorId, demoDay(), stops, new Date().toISOString())
  broadcast({ type: 'vendor_capacity', vendor_id: vendorId })
  return vendorLoad(vendorId)
}

function ownOrder(vendorId: number, orderId: number): Order {
  const order = getOrder(orderId)
  if (!order || order.vendor_id !== vendorId) {
    throw Object.assign(new Error(`order ${orderId} not found for this vendor`), { status: 404 })
  }
  return order
}

export function portalConfirm(vendorId: number, orderId: number, etaIso?: string): Order {
  ownOrder(vendorId, orderId)
  const order = applyEvent(orderId, 'vendor_accepted', { eta_iso: etaIso ?? null, source: 'portal' }, 'vendor')
  if (etaIso) notifyFamilyOfEta(order)
  return order
}

export function portalSetEta(vendorId: number, orderId: number, etaIso: string): Order {
  ownOrder(vendorId, orderId)
  const order = applyEvent(orderId, 'eta_set', { eta_iso: etaIso, source: 'portal' }, 'vendor')
  notifyFamilyOfEta(order)
  return order
}

export function portalDecline(vendorId: number, orderId: number, reason?: string): void {
  ownOrder(vendorId, orderId)
  escalate(orderId, `Vendor declined order #${orderId}: ${reason ?? 'no reason given'}`)
}
