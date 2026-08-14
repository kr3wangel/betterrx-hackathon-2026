import { db } from './db'
import type { Escalation, Message, Order, OrderEvent, ParsedMessage, Vendor, VendorStat } from '../shared/types'

type OrderRow = Omit<Order, 'risk_reasons' | 'delivery_verified' | 'pickup_verified'> & {
  risk_reasons: string | null
  delivery_verified: number
  pickup_verified: number
}
type EventRow = Omit<OrderEvent, 'payload'> & { payload: string | null }
type MessageRow = Omit<Message, 'parsed'> & { parsed: string | null }

const ORDER_SELECT = `SELECT o.*,
  EXISTS (SELECT 1 FROM pods p WHERE p.order_id = o.id AND p.kind = 'delivery') AS delivery_verified,
  EXISTS (SELECT 1 FROM pods p WHERE p.order_id = o.id AND p.kind = 'pickup') AS pickup_verified
FROM orders o`

export function rowToOrder(row: OrderRow): Order {
  return {
    ...row,
    risk_reasons: row.risk_reasons ? JSON.parse(row.risk_reasons) : null,
    delivery_verified: !!row.delivery_verified,
    pickup_verified: !!row.pickup_verified,
  }
}

export function rowToEvent(row: EventRow): OrderEvent {
  return { ...row, payload: row.payload ? JSON.parse(row.payload) : null }
}

export function rowToMessage(row: MessageRow): Message {
  return { ...row, parsed: row.parsed ? (JSON.parse(row.parsed) as ParsedMessage) : null }
}

export function getOrder(id: number): Order | null {
  const row = db.prepare(`${ORDER_SELECT} WHERE o.id = ?`).get(id) as OrderRow | undefined
  return row ? rowToOrder(row) : null
}

export function listOrders(state?: string): Order[] {
  const rows = (
    state
      ? db.prepare(`${ORDER_SELECT} WHERE o.state = ? ORDER BY o.created_at DESC`).all(state)
      : db.prepare(`${ORDER_SELECT} ORDER BY o.created_at DESC`).all()
  ) as OrderRow[]
  return rows.map(rowToOrder)
}

export function listOrderEvents(orderId: number): OrderEvent[] {
  const rows = db
    .prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY id ASC')
    .all(orderId) as EventRow[]
  return rows.map(rowToEvent)
}

export function getVendor(id: number): Vendor | null {
  return (db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as Vendor | undefined) ?? null
}

export function vendorStats(vendorId: number): VendorStat[] {
  return db.prepare('SELECT * FROM vendor_stats WHERE vendor_id = ?').all(vendorId) as VendorStat[]
}

export function openEscalation(orderId: number): Escalation | null {
  return (
    (db
      .prepare("SELECT * FROM escalations WHERE order_id = ? AND status = 'open'")
      .get(orderId) as Escalation | undefined) ?? null
  )
}
