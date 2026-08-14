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

export function magicLink(vendorId: number): string {
  const base = process.env.PORTAL_BASE_URL ?? 'http://localhost:5173'
  return `${base}/portal/${vendorToken(vendorId)}`
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
