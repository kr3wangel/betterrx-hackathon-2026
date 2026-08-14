import { db } from '../server/db'
import { computeRisk, RISK_THRESHOLD } from '../server/risk'
import { CATALOG, byCode } from '../shared/catalog'
import type { Order, VendorStat } from '../shared/types'

const scenario = process.argv[2] ?? 'full'

/**
 * Synthetic world for the DME bounty.
 *
 * What is real: the equipment catalog — which codes exist, how common they are, and
 * roughly what Medicare allows for them — comes from the CMS DMEPOS Public Use File
 * (see shared/catalog.ts). FAQ §6 names that file as the legitimate public baseline.
 *
 * What is synthetic: every patient, vendor, order, delivery time, and outcome. CMS
 * publishes billing, not logistics — there is no public delivery-timing data, so all
 * timeliness here is invented from stated vendor profiles below.
 *
 * Vendor performance stats are DERIVED from the simulated history rather than typed in
 * by hand, so "why is this vendor 62%?" has an answer: because these orders happened.
 *
 * Deterministic: fixed PRNG seed, so rehearsal and stage produce identical data.
 */

// ---------------------------------------------------------------- deterministic RNG

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20260814)
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
const between = (lo: number, hi: number) => lo + rand() * (hi - lo)

// ---------------------------------------------------------------- world definition

interface VendorProfile {
  id: number
  name: string
  phone: string
  channel: string
  service_area: string
  contact_name: string
  /** Baseline share of orders that beat their deadline. */
  base_on_time: number
  /** Typical hours from order to delivery. */
  base_hours: number
  /** Weekdays (0=Sun) where this vendor degrades, and by how much. */
  weak_days: Partial<Record<number, number>>
  /** Codes this vendor handles badly — heavy items need a two-person truck. */
  weak_codes: Partial<Record<string, number>>
  /** Hours after a pickup trigger before retrieval, on average. */
  pickup_hours: number
  notes: string
}

const VENDORS: VendorProfile[] = [
  {
    id: 1,
    name: 'Wasatch Medical Supply',
    phone: '801-555-0101',
    channel: 'sms',
    service_area: 'Salt Lake City / Ogden',
    contact_name: 'Dana',
    base_on_time: 0.94,
    base_hours: 7,
    // The story the risk engine is meant to surface: strong all week, falls apart on
    // Friday specifically for the heavy items. No one would hand-code this rule.
    weak_days: { 5: 0.34 },
    weak_codes: { E0260: 0.06, E0277: 0.08, E0630: 0.05 },
    pickup_hours: 20,
    notes: 'Regional. Reliable except Friday heavy-item runs.',
  },
  {
    id: 2,
    name: 'Beehive DME Co',
    phone: '801-555-0202',
    channel: 'sms',
    service_area: 'Salt Lake City / Provo',
    contact_name: 'Marcus',
    base_on_time: 0.71,
    base_hours: 19,
    // National branch: nobody works the weekend, so Sat/Sun orders rot.
    weak_days: { 0: 0.3, 6: 0.28 },
    weak_codes: {},
    pickup_hours: 61,
    notes: 'National branch, M–F 9–5. Slow, and pickups drift for days.',
  },
  {
    id: 3,
    name: 'Canyon Home Medical',
    phone: '385-555-0303',
    channel: 'sms',
    service_area: 'Provo / Ogden',
    contact_name: 'Priya',
    base_on_time: 0.9,
    base_hours: 10,
    weak_days: { 6: 0.12 },
    weak_codes: {},
    pickup_hours: 26,
    notes: 'Regional. Steady, mild weekend softness.',
  },
]

const PATIENTS = [
  { id: 1, name: 'Eleanor Vance', address: '412 Maple St', market: 'Salt Lake City' },
  { id: 2, name: 'Harold Whitfield', address: '88 Canyon Rd', market: 'Salt Lake City' },
  { id: 3, name: 'Margaret Osei', address: '2201 Bench Dr', market: 'Provo' },
  { id: 4, name: 'Frank Delgado', address: '15 Willow Ln', market: 'Provo' },
  { id: 5, name: 'Ruth Nakamura', address: '907 Alta Ave', market: 'Ogden' },
  { id: 6, name: 'Alma Restrepo', address: '3390 Foothill Blvd', market: 'Salt Lake City' },
  { id: 7, name: 'Walter Kimball', address: '77 Center St', market: 'Provo' },
  { id: 8, name: 'Dorothy Chen', address: '1425 Harrison Ave', market: 'Ogden' },
  { id: 9, name: 'Samuel Begay', address: '620 Redwood Rd', market: 'Salt Lake City' },
  { id: 10, name: 'Rosemary Tillotson', address: '204 Orchard Way', market: 'Ogden' },
  { id: 11, name: 'Gerald Okafor', address: '5561 Cottonwood Ln', market: 'Salt Lake City' },
  { id: 12, name: 'Lucille Barrantes', address: '18 Provo Canyon Rd', market: 'Provo' },
]

/** CMS national beneficiary counts as demand weights — oxygen and CPAP dominate, as they do in reality. */
const MIX = CATALOG.flatMap((c) => Array(Math.max(1, Math.round(c.national_benes / 25_000))).fill(c.hcpcs_code) as string[])

const VENDOR_BY_MARKET: Record<string, number[]> = {
  'Salt Lake City': [1, 2],
  Provo: [2, 3],
  Ogden: [1, 3],
}

// ---------------------------------------------------------------- simulation

const HISTORY_DAYS = 365
const MATERIALIZE_DAYS = 10
/** A multi-branch hospice across three markets. Enough volume that per-weekday cells stand alone. */
const ORDERS_PER_DAY = 26
/** Below this, a (vendor × code × weekday) cell is noise — back off to a coarser stratum. */
const MIN_CELL = 12
const DAY = 86_400_000

interface SimOrder {
  day_offset: number
  patient_id: number
  vendor_id: number
  code: string
  ordered_at: Date
  target_at: Date
  delivered_at: Date
  on_time: boolean
  hours: number
  dow: number
  pickup_triggered_at: Date | null
  picked_up_at: Date | null
  condition_ok: boolean
}

function onTimeOdds(v: VendorProfile, code: string, dow: number): number {
  return Math.max(0.05, v.base_on_time - (v.weak_days[dow] ?? 0) - (v.weak_codes[code] ?? 0))
}

const now = new Date()
const history: SimOrder[] = []

for (let d = HISTORY_DAYS; d >= 1; d--) {
  const dayStart = new Date(now.getTime() - d * DAY)
  for (let n = 0; n < ORDERS_PER_DAY; n++) {
    const patient = pick(PATIENTS)
    // Draw the vendor id once — evaluating pick() inside find()'s predicate would
    // redraw per element and usually match nothing.
    const vendorId = pick(VENDOR_BY_MARKET[patient.market])
    const vendor = VENDORS.find((v) => v.id === vendorId)
    const code = pick(MIX)
    const item = byCode(code)
    if (!vendor || !item) throw new Error(`bad world config: vendor=${vendorId} code=${code}`)

    const ordered_at = new Date(dayStart.getTime() + between(7, 17) * 3_600_000)
    const targetHours = item.typical_urgency === 'urgent' ? between(6, 12) : between(20, 30)
    const target_at = new Date(ordered_at.getTime() + targetHours * 3_600_000)
    const dow = target_at.getDay()

    const odds = onTimeOdds(vendor, code, dow)
    const on_time = rand() < odds
    // Late deliveries miss by a believable margin, not by a token minute.
    const hours = on_time
      ? Math.max(1, vendor.base_hours * between(0.55, 0.95))
      : targetHours + between(1.5, 14)
    const delivered_at = new Date(ordered_at.getTime() + hours * 3_600_000)

    // ~38% of episodes end in a death/discharge that triggers retrieval.
    let pickup_triggered_at: Date | null = null
    let picked_up_at: Date | null = null
    if (rand() < 0.38) {
      pickup_triggered_at = new Date(delivered_at.getTime() + between(2, 20) * DAY)
      picked_up_at = new Date(pickup_triggered_at.getTime() + vendor.pickup_hours * between(0.5, 1.9) * 3_600_000)
    }

    history.push({
      day_offset: d,
      patient_id: patient.id,
      vendor_id: vendor.id,
      code,
      ordered_at,
      target_at,
      delivered_at,
      on_time,
      hours,
      dow,
      pickup_triggered_at,
      picked_up_at,
      condition_ok: rand() > (vendor.id === 2 ? 0.11 : 0.03),
    })
  }
}

// ---------------------------------------------------------------- write

db.exec(
  'DELETE FROM pods; DELETE FROM escalations; DELETE FROM messages; DELETE FROM order_events; DELETE FROM orders; DELETE FROM vendor_stats; DELETE FROM vendors; DELETE FROM patients;',
)

const insertPatient = db.prepare('INSERT INTO patients (id, name, status, address, market) VALUES (?, ?, ?, ?, ?)')
for (const p of PATIENTS) insertPatient.run(p.id, p.name, 'active', p.address, p.market)

const insertVendor = db.prepare(
  'INSERT INTO vendors (id, name, phone, channel, service_area, contact_name) VALUES (?, ?, ?, ?, ?, ?)',
)
for (const v of VENDORS) insertVendor.run(v.id, v.name, v.phone, v.channel, v.service_area, v.contact_name)

// Vendor stats derived from the simulated year, not hand-typed.
const insertStat = db.prepare(
  'INSERT INTO vendor_stats (vendor_id, hcpcs_code, day_of_week, on_time_rate, avg_delivery_hours, sample_size) VALUES (?, ?, ?, ?, ?, ?)',
)
type Bucket = { n: number; onTime: number; hours: number }
const add = (m: Map<string, Bucket>, key: string, h: SimOrder) => {
  const b = m.get(key) ?? { n: 0, onTime: 0, hours: 0 }
  b.n++
  if (h.on_time) b.onTime++
  b.hours += h.hours
  m.set(key, b)
}
const byDow = new Map<string, Bucket>()
const byCodeOnly = new Map<string, Bucket>()
for (const h of history) {
  add(byDow, `${h.vendor_id}|${h.code}|${h.dow}`, h)
  add(byCodeOnly, `${h.vendor_id}|${h.code}`, h)
}

/**
 * Statistical back-off. A (vendor × code × weekday) cell with five orders in it is
 * noise, and reporting "20% on-time (n=5)" as if it were a finding is exactly the
 * manufactured precision FAQ §6 penalises. So: use the weekday cell when it has real
 * support, otherwise fall back to the vendor's record for that equipment across all
 * days, and only then to the stated profile.
 */
for (const v of VENDORS) {
  for (const item of CATALOG) {
    for (let dow = 0; dow < 7; dow++) {
      const cell = byDow.get(`${v.id}|${item.hcpcs_code}|${dow}`)
      const coarse = byCodeOnly.get(`${v.id}|${item.hcpcs_code}`)
      const src =
        cell && cell.n >= MIN_CELL ? cell : coarse && coarse.n >= MIN_CELL ? coarse : null

      const on_time_rate = src ? src.onTime / src.n : onTimeOdds(v, item.hcpcs_code, dow)
      const avg_hours = src ? src.hours / src.n : v.base_hours
      const sample = src ? src.n : (cell?.n ?? 0)

      insertStat.run(
        v.id,
        item.hcpcs_code,
        dow,
        Number(on_time_rate.toFixed(3)),
        Number(avg_hours.toFixed(1)),
        sample,
      )
    }
  }
}

// Materialize the recent slice as real orders. The stats above cover a full year; the
// app only stores the last month of order rows, which is normal for an operational system.
const insertOrder = db.prepare(
  'INSERT INTO orders (id, patient_id, vendor_id, hcpcs_code, equipment_name, quantity, urgency, target_at, state, eta_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
)
const insertEvent = db.prepare(
  'INSERT INTO order_events (order_id, type, payload, actor, created_at) VALUES (?, ?, ?, ?, ?)',
)
const insertPod = db.prepare(
  'INSERT INTO pods (order_id, kind, photo_path, signature_path, captured_at) VALUES (?, ?, ?, ?, ?)',
)
const insertMessage = db.prepare(
  'INSERT INTO messages (order_id, vendor_id, direction, body, parsed, confidence, review_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
)
const insertEscalation = db.prepare(
  'INSERT INTO escalations (order_id, reason, status, created_at) VALUES (?, ?, ?, ?)',
)

const iso = (d: Date) => d.toISOString()
let nextId = 2000
let materialized = 0

for (const h of history.filter((x) => x.day_offset <= MATERIALIZE_DAYS)) {
  const id = nextId++
  const item = byCode(h.code)!
  const done = h.picked_up_at !== null
  insertOrder.run(
    id,
    h.patient_id,
    h.vendor_id,
    h.code,
    item.equipment_name,
    1,
    item.typical_urgency,
    iso(h.target_at),
    done ? 'picked_up' : 'delivered',
    iso(h.delivered_at),
    iso(h.ordered_at),
  )
  insertEvent.run(id, 'order_placed', null, 'hospice', iso(h.ordered_at))
  insertEvent.run(id, 'vendor_accepted', null, 'vendor', iso(new Date(h.ordered_at.getTime() + 900_000)))
  insertEvent.run(id, 'delivered', JSON.stringify({ on_time: h.on_time }), 'driver', iso(h.delivered_at))
  insertPod.run(id, 'delivery', null, null, iso(h.delivered_at))

  if (!h.on_time) {
    insertEscalation.run(
      id,
      `delivered ${(h.hours - (h.target_at.getTime() - h.ordered_at.getTime()) / 3_600_000).toFixed(1)}h after the deadline`,
      'resolved',
      iso(h.delivered_at),
    )
  }
  if (!h.condition_ok) {
    insertEscalation.run(id, 'equipment arrived in unacceptable condition', 'resolved', iso(h.delivered_at))
  }
  if (h.pickup_triggered_at) {
    insertEvent.run(id, 'pickup_triggered', null, 'system', iso(h.pickup_triggered_at))
  }
  if (h.picked_up_at) {
    insertEvent.run(id, 'picked_up', null, 'driver', iso(h.picked_up_at))
    insertPod.run(id, 'pickup', null, null, iso(h.picked_up_at))
  }
  materialized++
}

// ---------------------------------------------------------------- demo scenarios

const hours = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString()

function seedOrder(
  id: number,
  patientId: number,
  vendorId: number,
  code: string,
  state: string,
  targetInHours: number | null,
  etaInHours: number | null,
) {
  const item = byCode(code)!
  insertOrder.run(
    id,
    patientId,
    vendorId,
    code,
    item.equipment_name,
    1,
    targetInHours !== null && targetInHours < 24 ? 'urgent' : 'routine',
    targetInHours === null ? null : hours(targetInHours),
    state,
    etaInHours === null ? null : hours(etaInHours),
    new Date().toISOString(),
  )
  insertEvent.run(id, 'order_placed', null, 'hospice', new Date().toISOString())
  if (['dispatched', 'in_transit', 'delivered', 'pickup_pending'].includes(state)) {
    insertEvent.run(id, 'vendor_accepted', null, 'vendor', new Date().toISOString())
  }
  if (['in_transit', 'delivered', 'pickup_pending'].includes(state)) {
    insertEvent.run(id, 'out_for_delivery', null, 'vendor', new Date().toISOString())
  }
  if (['delivered', 'pickup_pending'].includes(state)) {
    insertEvent.run(id, 'delivered', JSON.stringify({ pod: true }), 'driver', new Date().toISOString())
  }
  if (state === 'pickup_pending') {
    insertEvent.run(id, 'pickup_triggered', null, 'system', new Date().toISOString())
  }
}

const BED = 'E0260'
const OXY = 'E1390'
const CHAIR = 'K0001'
const CPAP = 'E0601'

if (scenario === 'scenario1') {
  seedOrder(1042, 1, 2, BED, 'ordered', 16, null)
  seedOrder(1043, 1, 2, OXY, 'dispatched', 16, 12)
} else if (scenario === 'scenario2') {
  seedOrder(1050, 2, 1, BED, 'delivered', null, null)
  seedOrder(1051, 2, 1, OXY, 'delivered', null, null)
} else if (scenario === 'scenario3') {
  seedOrder(1060, 3, 1, BED, 'dispatched', 20, null)
  seedOrder(1061, 4, 1, CHAIR, 'dispatched', 44, null)
} else {
  seedOrder(1042, 1, 2, BED, 'ordered', 16, null)
  seedOrder(1050, 2, 1, OXY, 'delivered', null, null)
  seedOrder(1060, 3, 1, BED, 'dispatched', 20, null)
  seedOrder(1070, 5, 3, CPAP, 'in_transit', 30, 26)
}

// ---------------------------------------------------------------- report + demo check

const orders = db.prepare('SELECT * FROM orders WHERE id < 2000').all() as Order[]
const allStats = db.prepare('SELECT * FROM vendor_stats').all() as VendorStat[]

console.log(`\nseeded '${scenario}'`)
console.log(
  `  patients=${PATIENTS.length} vendors=${VENDORS.length} catalog=${CATALOG.length} codes` +
    `\n  history: ${history.length} simulated orders over ${HISTORY_DAYS}d, ${materialized} materialized (last ${MATERIALIZE_DAYS}d)` +
    `\n  vendor_stats derived from simulated history — not hand-typed`,
)

console.log('\n  vendor on-time (derived, all codes):')
for (const v of VENDORS) {
  const mine = history.filter((h) => h.vendor_id === v.id)
  const ot = mine.filter((h) => h.on_time).length
  const pickups = mine.filter((h) => h.picked_up_at && h.pickup_triggered_at)
  const avgPickup =
    pickups.reduce((a, h) => a + (h.picked_up_at!.getTime() - h.pickup_triggered_at!.getTime()) / 3_600_000, 0) /
    Math.max(1, pickups.length)
  console.log(
    `    ${v.name.padEnd(24)} ${((ot / mine.length) * 100).toFixed(0)}% on-time  ` +
      `pickup avg ${avgPickup.toFixed(0)}h  n=${mine.length}`,
  )
}

console.log('\n  demo orders — computed risk (threshold ' + RISK_THRESHOLD + '):')
for (const o of orders) {
  const stats = allStats.filter((s) => s.vendor_id === o.vendor_id)
  const r = computeRisk({ ...o, risk_reasons: null }, stats, new Date())
  const flag = r.score >= RISK_THRESHOLD ? 'AT RISK' : 'ok'
  console.log(`    #${o.id} ${o.equipment_name.padEnd(30)} score=${String(r.score).padStart(3)}  ${flag}`)
  for (const reason of r.reasons) console.log(`         · ${reason}`)
}
console.log(
  '\n  NOTE: risk keys off the TARGET DATE weekday, so scores shift depending on the day' +
    '\n  you seed. Re-run this check on demo morning before rehearsing.\n',
)
