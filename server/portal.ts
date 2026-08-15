import { createHash } from 'node:crypto'
import { db } from './db'
import { notifyFamilyOfEta } from './messaging'
import { applyEvent, escalate } from './statemachine'
import { getOrder, listOrders } from './store'
import type { Order, Vendor } from '../shared/types'

const SECRET = process.env.MAGIC_LINK_SECRET ?? 'demo-secret'
const OPEN_STATES_EXCLUDED = ['picked_up', 'cancelled']

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
  return listOrders().filter((o) => o.vendor_id === vendorId && !OPEN_STATES_EXCLUDED.includes(o.state))
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
