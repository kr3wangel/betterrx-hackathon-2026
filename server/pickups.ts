import { db } from './db'
import { applyEvent } from './statemachine'
import { listOrders } from './store'
import { pickupGroupText, pickupRequestText, sendVendorQuestion } from './messaging'
import type { Order, PatientStatus, RoleId } from '../shared/types'

export type PatientStatusSource = 'nurse' | 'emr'

export interface PatientStatusResult {
  patient_id: number
  status: PatientStatus
  pickups_triggered: number[]
}

export function setPatientStatus(
  patientId: number,
  status: PatientStatus,
  source: PatientStatusSource,
  actorRole: RoleId | null = null,
): PatientStatusResult {
  db.prepare('UPDATE patients SET status = ? WHERE id = ?').run(status, patientId)

  const triggered: number[] = []
  if (status === 'deceased' || status === 'discharged') {
    const patient = db.prepare('SELECT market FROM patients WHERE id = ?').get(patientId) as
      | { market: string }
      | undefined
    const delivered = listOrders('delivered')
      .filter((o) => o.patient_id === patientId)
      .sort((a, b) => a.id - b.id)

    const stops = new Map<number, Order[]>()
    for (const order of delivered) {
      applyEvent(
        order.id,
        'pickup_triggered',
        { patient_status: status, source },
        source === 'nurse' ? 'hospice' : 'system',
        actorRole,
      )
      const stop = stops.get(order.vendor_id) ?? []
      stop.push(order)
      stops.set(order.vendor_id, stop)
      triggered.push(order.id)
    }

    // One truck, one door, one decision. Two items a vendor must collect from the same home
    // are one trip, so they cost one text and one of that vendor's five reply pairs — the
    // manifest rides in message_orders and the reply fans back out per order.
    for (const [vendorId, orders] of stops) {
      if (orders.length === 1) {
        sendVendorQuestion(vendorId, orders[0].id, 'v_pickup_request', (digits) =>
          pickupRequestText(orders[0], patient?.market, digits),
        )
      } else {
        sendVendorQuestion(
          vendorId,
          orders[0].id,
          'v_pickup_group',
          (digits) => pickupGroupText(orders, patient?.market, digits),
          orders.map((o) => o.id),
        )
      }
    }
  }
  return { patient_id: patientId, status, pickups_triggered: triggered }
}
