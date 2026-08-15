import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../server/db'
import { setPatientStatus } from '../server/pickups'
import { liveQuestions } from '../server/slots'
import { getOrder, rowToMessage } from '../server/store'
import { seedFixtures, seedOrder } from './helpers'
import type { Message, OrderEvent } from '../shared/types'

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

// The vendor's unit of work is the trip, not the order. Ruth dies with a bed and a
// concentrator in the house: one truck, one door, one decision — so one text and one
// reply pair, with the manifest carried out of band.
describe('trip batching', () => {
  function vendorOutbound(vendorId = 1): Message[] {
    return (
      db
        .prepare(
          "SELECT * FROM messages WHERE vendor_id = ? AND recipient_type = 'vendor' AND direction = 'out' ORDER BY id",
        )
        .all(vendorId) as never[]
    ).map(rowToMessage)
  }

  function manifest(messageId: number): number[] {
    return (
      db.prepare('SELECT order_id FROM message_orders WHERE message_id = ? ORDER BY order_id').all(messageId) as {
        order_id: number
      }[]
    ).map((r) => r.order_id)
  }

  it('asks once for a two-item stop, anchored on the first order', () => {
    const bed = seedOrder({ state: 'delivered' })
    const oxygen = seedOrder({
      state: 'delivered',
      equipment_name: 'Oxygen concentrator, portable',
      hcpcs_code: 'E1390',
    })

    const result = setPatientStatus(1, 'deceased', 'nurse')

    expect(result.pickups_triggered).toEqual([bed, oxygen])
    const outbound = vendorOutbound()
    expect(outbound).toHaveLength(1)
    expect(outbound[0].template).toBe('v_pickup_group')
    expect(outbound[0].order_id).toBe(bed)
    expect(liveQuestions(1)).toHaveLength(1)
    expect(manifest(outbound[0].id)).toEqual([bed, oxygen])
  })

  it('names the count and every item, and no patient', () => {
    seedOrder({ state: 'delivered' })
    seedOrder({ state: 'delivered', equipment_name: 'Oxygen concentrator, portable', hcpcs_code: 'E1390' })

    setPatientStatus(1, 'deceased', 'nurse')

    const body = vendorOutbound()[0].body
    expect(body).toContain('2 items from one home')
    expect(body).toContain('hospital bed')
    expect(body).toContain('oxygen concentrator')
    expect(body).toMatch(/if you can get both today/)
    expect(body).not.toContain('Test Patient')
  })

  it('stays on the single template when two vendors owe one item each', () => {
    seedOrder({ state: 'delivered', vendor_id: 1 })
    seedOrder({ state: 'delivered', vendor_id: 2, equipment_name: 'Walker, folding' })

    setPatientStatus(1, 'deceased', 'nurse')

    for (const vendorId of [1, 2]) {
      const outbound = vendorOutbound(vendorId)
      expect(outbound).toHaveLength(1)
      expect(outbound[0].template).toBe('v_pickup_request')
      expect(manifest(outbound[0].id)).toEqual([])
    }
  })
})
