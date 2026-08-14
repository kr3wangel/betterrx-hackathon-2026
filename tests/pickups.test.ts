import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../server/db'
import { setPatientStatus } from '../server/pickups'
import { getOrder } from '../server/store'
import { seedFixtures, seedOrder } from './helpers'
import type { OrderEvent } from '../shared/types'

beforeEach(() => {
  seedFixtures()
})

function lastPickupEvent(orderId: number): OrderEvent | undefined {
  const row = db
    .prepare("SELECT * FROM order_events WHERE order_id = ? AND type = 'pickup_triggered' ORDER BY id DESC")
    .get(orderId) as Record<string, unknown> | undefined
  if (!row) return undefined
  return { ...row, payload: row.payload ? JSON.parse(row.payload as string) : null } as OrderEvent
}

describe('setPatientStatus', () => {
  it('nurse-reported death triggers pickup on delivered orders with actor hospice', () => {
    const id = seedOrder({ state: 'delivered' })
    const result = setPatientStatus(1, 'deceased', 'nurse')
    expect(result.pickups_triggered).toEqual([id])
    expect(getOrder(id)!.state).toBe('pickup_pending')
    const event = lastPickupEvent(id)!
    expect(event.actor).toBe('hospice')
    expect(event.payload).toMatchObject({ patient_status: 'deceased', source: 'nurse' })
  })

  it('EMR-reported status records actor system', () => {
    const id = seedOrder({ state: 'delivered' })
    setPatientStatus(1, 'discharged', 'emr')
    const event = lastPickupEvent(id)!
    expect(event.actor).toBe('system')
    expect(event.payload).toMatchObject({ source: 'emr' })
  })

  it('updates the patient row', () => {
    setPatientStatus(1, 'deceased', 'nurse')
    const patient = db.prepare('SELECT status FROM patients WHERE id = 1').get() as { status: string }
    expect(patient.status).toBe('deceased')
  })

  it('sends the vendor a pickup request for each triggered order', () => {
    const id = seedOrder({ state: 'delivered', vendor_id: 2 })
    setPatientStatus(1, 'deceased', 'nurse')
    const messages = db.prepare("SELECT * FROM messages WHERE order_id = ? AND direction = 'out'").all(id)
    expect(messages).toHaveLength(1)
    expect((messages[0] as { body: string }).body).toMatch(/pickup/i)
  })

  it('leaves non-delivered orders untouched', () => {
    const id = seedOrder({ state: 'in_transit' })
    const result = setPatientStatus(1, 'deceased', 'nurse')
    expect(result.pickups_triggered).toEqual([])
    expect(getOrder(id)!.state).toBe('in_transit')
  })

  it('triggers nothing when status is active', () => {
    seedOrder({ state: 'delivered' })
    const result = setPatientStatus(1, 'active', 'nurse')
    expect(result.pickups_triggered).toEqual([])
  })
})
