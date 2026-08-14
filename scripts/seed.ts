import { db } from '../server/db'

const scenario = process.argv[2] ?? 'full'

db.exec('DELETE FROM pods; DELETE FROM escalations; DELETE FROM messages; DELETE FROM order_events; DELETE FROM orders; DELETE FROM vendor_stats; DELETE FROM vendors; DELETE FROM patients;')

const insertPatient = db.prepare('INSERT INTO patients (id, name, status, address, market) VALUES (?, ?, ?, ?, ?)')
insertPatient.run(1, 'Eleanor Vance', 'active', '412 Maple St', 'Salt Lake City')
insertPatient.run(2, 'Harold Whitfield', 'active', '88 Canyon Rd', 'Salt Lake City')
insertPatient.run(3, 'Margaret Osei', 'active', '2201 Bench Dr', 'Provo')
insertPatient.run(4, 'Frank Delgado', 'active', '15 Willow Ln', 'Provo')
insertPatient.run(5, 'Ruth Nakamura', 'active', '907 Alta Ave', 'Ogden')

const insertVendor = db.prepare('INSERT INTO vendors (id, name, phone, channel, service_area, contact_name) VALUES (?, ?, ?, ?, ?, ?)')
insertVendor.run(1, 'Wasatch Medical Supply', '801-555-0101', 'sms', 'Salt Lake City / Ogden', 'Dana')
insertVendor.run(2, 'Beehive DME Co', '801-555-0202', 'sms', 'Salt Lake City / Provo', 'Marcus')
insertVendor.run(3, 'Canyon Home Medical', '385-555-0303', 'sms', 'Provo / Ogden', 'Priya')

const insertStat = db.prepare('INSERT INTO vendor_stats (vendor_id, hcpcs_code, day_of_week, on_time_rate, avg_delivery_hours, sample_size) VALUES (?, ?, ?, ?, ?, ?)')
const CODES = [
  ['E0260', 'Hospital bed, semi-electric'],
  ['E1390', 'Oxygen concentrator'],
  ['K0001', 'Standard wheelchair'],
  ['E0601', 'CPAP device'],
] as const

for (let dow = 0; dow < 7; dow++) {
  for (const [code] of CODES) {
    insertStat.run(1, code, dow, dow === 5 && code === 'E0260' ? 0.62 : 0.93, 8, 40)
    insertStat.run(2, code, dow, 0.72, 16, 25)
    insertStat.run(3, code, dow, 0.9, 10, 30)
  }
}

const insertOrder = db.prepare(
  'INSERT INTO orders (id, patient_id, vendor_id, hcpcs_code, equipment_name, quantity, urgency, target_at, state, eta_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
)
const insertEvent = db.prepare("INSERT INTO order_events (order_id, type, payload, actor) VALUES (?, ?, ?, ?)")

const hours = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString()

function seedOrder(
  id: number,
  patientId: number,
  vendorId: number,
  codeIdx: number,
  state: string,
  targetInHours: number | null,
  etaInHours: number | null,
) {
  const [code, name] = CODES[codeIdx]
  insertOrder.run(id, patientId, vendorId, code, name, 1, targetInHours !== null && targetInHours < 24 ? 'urgent' : 'routine', targetInHours === null ? null : hours(targetInHours), state, etaInHours === null ? null : hours(etaInHours))
  insertEvent.run(id, 'order_placed', null, 'hospice')
  if (['dispatched', 'in_transit', 'delivered', 'pickup_pending'].includes(state)) {
    insertEvent.run(id, 'vendor_accepted', null, 'vendor')
  }
  if (['in_transit', 'delivered', 'pickup_pending'].includes(state)) {
    insertEvent.run(id, 'out_for_delivery', null, 'vendor')
  }
  if (['delivered', 'pickup_pending'].includes(state)) {
    insertEvent.run(id, 'delivered', JSON.stringify({ pod: true }), 'driver')
  }
  if (state === 'pickup_pending') {
    insertEvent.run(id, 'pickup_triggered', null, 'system')
  }
}

if (scenario === 'scenario1') {
  seedOrder(1042, 1, 2, 0, 'ordered', 16, null)
  seedOrder(1043, 1, 2, 1, 'dispatched', 16, 12)
} else if (scenario === 'scenario2') {
  seedOrder(1050, 2, 1, 0, 'delivered', null, null)
  seedOrder(1051, 2, 1, 1, 'delivered', null, null)
} else if (scenario === 'scenario3') {
  seedOrder(1060, 3, 1, 0, 'dispatched', 20, null)
  seedOrder(1061, 4, 1, 2, 'dispatched', 44, null)
} else {
  seedOrder(1042, 1, 2, 0, 'ordered', 16, null)
  seedOrder(1050, 2, 1, 1, 'delivered', null, null)
  seedOrder(1060, 3, 1, 0, 'dispatched', 20, null)
  seedOrder(1070, 5, 3, 3, 'in_transit', 30, 26)
}

console.log(`seeded '${scenario}' — patients=5 vendors=3 orders=${(db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }).c}`)
