import { db } from './db'
import { applyEvent } from './statemachine'
import { listOrders } from './store'
import { pickupRequestText, sendToVendor } from './messaging'
import type { PatientStatus } from '../shared/types'

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
): PatientStatusResult {
  db.prepare('UPDATE patients SET status = ? WHERE id = ?').run(status, patientId)

  const triggered: number[] = []
  if (status === 'deceased' || status === 'discharged') {
    const patient = db.prepare('SELECT market FROM patients WHERE id = ?').get(patientId) as
      | { market: string }
      | undefined
    const delivered = listOrders('delivered').filter((o) => o.patient_id === patientId)
    for (const order of delivered) {
      applyEvent(order.id, 'pickup_triggered', { patient_status: status, source }, source === 'nurse' ? 'hospice' : 'system')
      sendToVendor(order.vendor_id, order.id, pickupRequestText(order, patient?.market), 'v_pickup_request')
      triggered.push(order.id)
    }
  }
  return { patient_id: patientId, status, pickups_triggered: triggered }
}
