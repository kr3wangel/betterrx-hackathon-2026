import { db } from '../server/db'

export function seedFixtures() {
  db.exec(
    'DELETE FROM condition_reports; DELETE FROM pods; DELETE FROM escalations; DELETE FROM message_orders; DELETE FROM messages; DELETE FROM order_events; DELETE FROM orders; DELETE FROM vendor_stats; DELETE FROM vendors; DELETE FROM patients;',
  )
  db.prepare(
    "INSERT INTO patients (id, name, market, caregiver_name, caregiver_phone, contact_ok) VALUES (1, 'Test Patient', 'SLC', 'Test Caregiver', '801-555-0101', 1)",
  ).run()
  db.prepare(
    "INSERT INTO patients (id, name, market, caregiver_name, caregiver_phone, contact_ok) VALUES (2, 'Opted Out', 'SLC', 'No Texts', '801-555-0202', 0)",
  ).run()
  db.prepare("INSERT INTO vendors (id, name) VALUES (1, 'Vendor One'), (2, 'Vendor Two')").run()
}

export function seedOrder(overrides: Record<string, unknown> = {}): number {
  const defaults = {
    patient_id: 1,
    vendor_id: 1,
    hcpcs_code: 'E0260',
    equipment_name: 'Hospital bed',
    state: 'ordered',
    target_at: null,
    eta_at: null,
    risk_score: null,
    created_at: new Date().toISOString(),
  }
  const row = { ...defaults, ...overrides }
  const result = db
    .prepare(
      'INSERT INTO orders (patient_id, vendor_id, hcpcs_code, equipment_name, state, target_at, eta_at, risk_score, created_at) VALUES (@patient_id, @vendor_id, @hcpcs_code, @equipment_name, @state, @target_at, @eta_at, @risk_score, @created_at)',
    )
    .run(row)
  return Number(result.lastInsertRowid)
}
