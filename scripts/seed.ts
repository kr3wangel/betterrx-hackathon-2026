import { db } from '../server/db'
import { ackNagText, orderRequestText, vendorAckText } from '../server/messaging'
import { slotDigits, SLOT_BASES } from '../server/slots'
import { computeRisk, RISK_THRESHOLD } from '../server/risk'
import { conditionCheckText } from '../server/condition'
import { demoDay } from '../server/portal'
import { getOrder } from '../server/store'
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
  /** Share of deliveries where a driver captures a POD; the rest are the vendor's word. */
  pod_rate: number
  /** When late with no POD, odds the vendor reports it as on time anyway. Feeds the trust gap. */
  fudge_rate: number
  /** Typical hours before this vendor answers a texted question. Feeds median answer time. */
  answer_hours: number
  /**
   * Share of question threads (request + any nag) that never get any answer. The
   * message-level never-answered rate reads higher than this, since an ignored thread
   * contributes two dead texts once the nag fires.
   */
  ignore_rate: number
  /** Stops the dispatcher says they can take in a day, or null for a vendor that never declares. */
  stops_per_day: number | null
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
    pod_rate: 0.86,
    fudge_rate: 0.1,
    answer_hours: 0.5,
    ignore_rate: 0.04,
    stops_per_day: 6,
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
    // Beds need the two-person truck this branch shares with three other counties. Applies
    // on every weekday on purpose — the hero order's deadline lands on a different one each
    // time the demo is run.
    weak_codes: { E0260: 0.09 },
    pickup_hours: 61,
    // The trust-gap story: drivers rarely capture PODs, and a late run gets called in as
    // on-time more often than not. Their claimed rate looks fine; their verified rate doesn't.
    pod_rate: 0.45,
    fudge_rate: 0.55,
    // The responsiveness story: the branch phone sits unwatched, so a texted question
    // waits most of a workday for an answer and nearly a third are never answered at all.
    answer_hours: 7,
    ignore_rate: 0.3,
    // The vendor that fudges deliveries is the one that never tells us its capacity.
    stops_per_day: null,
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
    pod_rate: 0.85,
    fudge_rate: 0.08,
    answer_hours: 1,
    ignore_rate: 0.06,
    stops_per_day: 5,
    notes: 'Regional. Steady, mild weekend softness.',
  },
]

/**
 * The cold start. Phone number out of the hospice's own rolodex, never used before, so it
 * takes no part in the simulated year above and gets NO vendor_stats rows — scenario 3's
 * whole point is a vendor we have nothing on. The risk engine must stay quiet about them
 * rather than invent a rate.
 */
const COLD_START_VENDOR = {
  id: 4,
  name: 'Timpanogos Home Medical',
  phone: '801-555-0404',
  channel: 'sms',
  service_area: 'Provo / Orem',
  contact_name: 'Ray',
}

/**
 * Caregivers, not patients, are the contact for the condition channel. Hospice patients
 * frequently can't answer a phone; the family member who takes delivery at the door can.
 * See server/condition.ts.
 */
const PATIENTS = [
  { id: 1, name: 'Eleanor Vance', address: '412 Maple St', market: 'Salt Lake City', caregiver: 'Marcy Vance', phone: '801-555-1201' },
  { id: 2, name: 'Harold Whitfield', address: '88 Canyon Rd', market: 'Salt Lake City', caregiver: 'Joan Whitfield', phone: '801-555-1202' },
  { id: 3, name: 'Margaret Osei', address: '2201 Bench Dr', market: 'Provo', caregiver: 'Kwame Osei', phone: '385-555-1203' },
  { id: 4, name: 'Frank Delgado', address: '15 Willow Ln', market: 'Provo', caregiver: 'Rosa Delgado', phone: '385-555-1204' },
  { id: 5, name: 'Ruth Nakamura', address: '907 Alta Ave', market: 'Ogden', caregiver: 'Ken Nakamura', phone: '801-555-1205' },
  { id: 6, name: 'Alma Restrepo', address: '3390 Foothill Blvd', market: 'Salt Lake City', caregiver: 'Diego Restrepo', phone: '801-555-1206' },
  { id: 7, name: 'Walter Kimball', address: '77 Center St', market: 'Provo', caregiver: 'Susan Kimball', phone: '385-555-1207' },
  { id: 8, name: 'Dorothy Chen', address: '1425 Harrison Ave', market: 'Ogden', caregiver: 'Lily Chen', phone: '801-555-1208' },
  { id: 9, name: 'Samuel Begay', address: '620 Redwood Rd', market: 'Salt Lake City', caregiver: 'Nina Begay', phone: '801-555-1209' },
  { id: 10, name: 'Rosemary Tillotson', address: '204 Orchard Way', market: 'Ogden', caregiver: 'Grant Tillotson', phone: '801-555-1210' },
  { id: 11, name: 'Gerald Okafor', address: '5561 Cottonwood Ln', market: 'Salt Lake City', caregiver: 'Ada Okafor', phone: '801-555-1211' },
  { id: 12, name: 'Lucille Barrantes', address: '18 Provo Canyon Rd', market: 'Provo', caregiver: 'Elena Barrantes', phone: '385-555-1212' },
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
  /** 1-5 from the caregiver, or null when nobody replied to the text. */
  condition_score: number | null
}

/**
 * Caregiver condition ratings. Beehive runs an older, harder-used fleet, which is the
 * signal the scorecard is meant to expose — a vendor can hit its delivery windows and
 * still be sending out equipment nobody would want in their living room.
 *
 * Only ~68% of households reply. A channel that assumed a 100% response rate would be
 * the tell that this was never tested against reality.
 */
function conditionScoreFor(vendorId: number): number | null {
  if (rand() > 0.68) return null
  const roll = rand()
  if (vendorId === 2) {
    if (roll < 0.06) return 1
    if (roll < 0.17) return 2
    if (roll < 0.42) return 3
    if (roll < 0.78) return 4
    return 5
  }
  if (roll < 0.015) return 1
  if (roll < 0.05) return 2
  if (roll < 0.19) return 3
  if (roll < 0.62) return 4
  return 5
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
      condition_score: conditionScoreFor(vendor.id),
    })
  }
}

// ---------------------------------------------------------------- write

db.exec(
  'DELETE FROM vendor_capacity; DELETE FROM pods; DELETE FROM escalations; DELETE FROM messages; DELETE FROM order_events; DELETE FROM orders; DELETE FROM vendor_stats; DELETE FROM vendors; DELETE FROM patients;',
)

db.exec('DELETE FROM condition_reports;')

const insertPatient = db.prepare(
  'INSERT INTO patients (id, name, status, address, market, caregiver_name, caregiver_phone, contact_ok) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
)
for (const p of PATIENTS) insertPatient.run(p.id, p.name, 'active', p.address, p.market, p.caregiver, p.phone)

const insertVendor = db.prepare(
  'INSERT INTO vendors (id, name, phone, channel, service_area, contact_name) VALUES (?, ?, ?, ?, ?, ?)',
)
for (const v of [...VENDORS, COLD_START_VENDOR])
  insertVendor.run(v.id, v.name, v.phone, v.channel, v.service_area, v.contact_name)

// Today's declared stop capacity. An absent row is itself information — Beehive never
// declares, and the cold-start vendor has nothing until someone taps it.
const insertCapacity = db.prepare(
  'INSERT INTO vendor_capacity (vendor_id, day, stops, declared_at) VALUES (?, ?, ?, ?)',
)
for (const v of VENDORS)
  if (v.stops_per_day !== null) insertCapacity.run(v.id, demoDay(), v.stops_per_day, new Date().toISOString())

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
// Mirrors what sendVendorQuestion() writes for POST /orders — same template key and a real
// reply pair, so the digit router, the watchdog's nag de-dup and slot allocation all
// recognise a seeded thread. A seeded question with no pair would own no digits, and its
// body would promise codes that route nowhere.
const insertVendorMessage = db.prepare(
  "INSERT INTO messages (order_id, vendor_id, direction, body, recipient_type, template, reply_slot, answered_at, created_at) VALUES (?, ?, 'out', ?, 'vendor', ?, ?, ?, ?)",
)
const insertEscalation = db.prepare(
  'INSERT INTO escalations (order_id, reason, status, created_at) VALUES (?, ?, ?, ?)',
)
// A question the seed closes must also show its answer, or the phone renders "Reply 1 to
// accept" bubbles that look open while their pairs are secretly retired — and a vendor
// typing 1 gets told "already updated earlier" about a reply they never saw. The digit
// bubble and its receipt make the seeded thread the conversation it claims to be.
const insertVendorReply = db.prepare(
  "INSERT INTO messages (order_id, vendor_id, direction, body, confidence, review_status, recipient_type, created_at) VALUES (?, ?, 'in', ?, 1, 'auto_applied', 'vendor', ?)",
)
const insertVendorAck = db.prepare(
  "INSERT INTO messages (order_id, vendor_id, direction, body, recipient_type, created_at) VALUES (?, ?, 'out', ?, 'vendor', ?)",
)
const insertCondition = db.prepare(
  'INSERT INTO condition_reports (order_id, vendor_id, patient_id, score, source, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
)

const iso = (d: Date) => d.toISOString()
let nextId = 2000
let materialized = 0

/**
 * Patients the scenarios below put on stage. Their older episodes are materialized only
 * once closed: a leftover `delivered` row joins the pickup cascade the moment the nurse
 * marks the patient deceased, and scenario 2 promises the room exactly two pickups.
 */
const DEMO_PATIENTS = new Set([1, 3, 4, 5])

/**
 * Which pairs each vendor's earlier questions still hold at a given moment — allocateSlot
 * replayed over the simulated timeline, so overlapping questions land on different pairs
 * and the seeded thread demonstrates the rotation for real: a slow vendor's history shows
 * (1,2), (3,4), (5,6) stacked and answered out of order with "3"s and "5"s, not a wall of
 * "1"s. An ignored question holds its pair until the +4h escalation resolves it — that row
 * is already seeded as 'resolved', and the coordinator closing it is what frees the pair.
 * Two open questions must NEVER share a pair: live, the sixth question is refused and
 * re-asked later, so when all five are held the seeded question defers to the moment the
 * earliest pair frees (returned as sentAt) instead of stealing a live pair.
 */
const IGNORED_HOLD_MS = 4 * 3_600_000
type SeedSlotBase = (typeof SLOT_BASES)[number]
const slotHolds = new Map<number, { base: SeedSlotBase; until: number }[]>()
function seedSlot(vendorId: number, at: number, holdMs: number): { base: SeedSlotBase; sentAt: number } {
  let holds = (slotHolds.get(vendorId) ?? []).filter((hold) => hold.until > at)
  let sentAt = at
  let base: SeedSlotBase | undefined = SLOT_BASES.find((b) => !holds.some((hold) => hold.base === b))
  if (base === undefined) {
    holds.sort((a, b) => a.until - b.until)
    const freed = holds.shift()!
    sentAt = freed.until
    base = freed.base
    holds = holds.filter((hold) => hold.until > sentAt)
  }
  holds.push({ base, until: sentAt + holdMs })
  slotHolds.set(vendorId, holds)
  return { base, sentAt }
}

// Chronological, not generation order: slot occupancy replays a timeline, and message ids
// drive thread order on the phones — same-day bubbles must not jump backwards in time.
const toMaterialize = history
  .filter((x) => x.day_offset <= MATERIALIZE_DAYS)
  .sort((a, b) => a.ordered_at.getTime() - b.ordered_at.getTime())

for (const h of toMaterialize) {
  const done = h.picked_up_at !== null
  if (!done && DEMO_PATIENTS.has(h.patient_id)) continue
  const id = nextId++
  const item = byCode(h.code)!

  // Not every delivery gets a driver POD — the rest are the vendor's word, and a late
  // vendor-reported run sometimes gets called in as on-time. The ledger then records the
  // CLAIM (a timestamp just inside the target), which is all the hospice would have known.
  // vendorLeverage() surfaces the difference as the trust gap. Drawn here, after the
  // history loop, so vendor_stats and the scorecards are untouched by these rolls.
  //
  // Keyed off the order id, NOT the shared stream: the shared PRNG is add-and-hash, and
  // the materialize loop burns a near-constant number of draws per seeded day, so a
  // stream-positioned roll repeats daily — it was handing Canyon exactly one ignored
  // thread per day, 2.7× its stated rate, like clockwork.
  const profile = VENDORS.find((v) => v.id === h.vendor_id)!
  const orderRand = mulberry32((id * 0x9e3779b1) | 0)
  const orderBetween = (lo: number, hi: number) => lo + orderRand() * (hi - lo)
  const hasPod = orderRand() < profile.pod_rate
  const fudged = !hasPod && !h.on_time && orderRand() < profile.fudge_rate
  const recorded_at = fudged ? new Date(h.target_at.getTime() - orderBetween(10, 50) * 60_000) : h.delivered_at

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
    iso(recorded_at),
    iso(h.ordered_at),
  )
  insertEvent.run(id, 'order_placed', null, 'hospice', iso(h.ordered_at))

  // The question ledger: every order opened with a request text, answered per the vendor's
  // habits — acceptance lands when they actually replied, not a flat 15 minutes in, and an
  // ignored text gets no acceptance event at all (the order was delivered anyway; they just
  // never answered, which is what never_answered_rate measures). Slow answers and silence
  // get the ack nag the watchdog would have sent, and silence past that gets its escalation.
  // Answered rows keep a slot for realism; an ignored question's pair rotated onward to
  // newer asks long ago, so it carries none — weeks-dead questions must not squat the five
  // live pairs and jam the demo phones.
  const ignoredQuestion = orderRand() < profile.ignore_rate
  const answerDelayMs = profile.answer_hours * orderBetween(0.3, 2.5) * 3_600_000
  const { base: questionSlot, sentAt } = seedSlot(
    h.vendor_id,
    h.ordered_at.getTime(),
    ignoredQuestion ? IGNORED_HOLD_MS : answerDelayMs,
  )
  const answeredAt = ignoredQuestion ? null : new Date(sentAt + answerDelayMs)
  const yesDigit = String(slotDigits(questionSlot)[0])
  const order = getOrder(id)!
  const area = PATIENTS.find((p) => p.id === h.patient_id)!.market
  insertVendorMessage.run(
    id,
    h.vendor_id,
    orderRequestText(order, area, slotDigits(questionSlot)),
    'v_order_request',
    ignoredQuestion ? null : questionSlot,
    answeredAt ? iso(answeredAt) : null,
    iso(new Date(sentAt)),
  )
  const nagAt = new Date(sentAt + 2 * 3_600_000)
  if (ignoredQuestion || answeredAt!.getTime() > nagAt.getTime()) {
    insertVendorMessage.run(
      id,
      h.vendor_id,
      ackNagText(order, slotDigits(questionSlot)),
      'v_ack_nag',
      ignoredQuestion ? null : questionSlot,
      answeredAt ? iso(answeredAt) : null,
      iso(nagAt),
    )
  }
  if (ignoredQuestion) {
    insertEscalation.run(
      id,
      `No response to the automated check-in — order #${id} is still unconfirmed 4h after placement`,
      'resolved',
      iso(new Date(sentAt + IGNORED_HOLD_MS)),
    )
  } else {
    insertVendorReply.run(id, h.vendor_id, yesDigit, iso(answeredAt!))
    insertVendorAck.run(id, h.vendor_id, vendorAckText(order, 'accept', yesDigit), iso(answeredAt!))
    insertEvent.run(id, 'vendor_accepted', null, 'vendor', iso(answeredAt!))
  }

  insertEvent.run(
    id,
    'delivered',
    JSON.stringify({ on_time: h.on_time || fudged }),
    hasPod ? 'driver' : 'vendor',
    iso(recorded_at),
  )
  if (hasPod) insertPod.run(id, 'delivery', null, null, iso(h.delivered_at))

  // A fudged delivery raises no escalation — with no POD and an on-time claim, nobody knew.
  if (!h.on_time && !fudged) {
    insertEscalation.run(
      id,
      `delivered ${(h.hours - (h.target_at.getTime() - h.ordered_at.getTime()) / 3_600_000).toFixed(1)}h after the deadline`,
      'resolved',
      iso(h.delivered_at),
    )
  }
  if (h.condition_score !== null) {
    // Caregiver got the text a couple of hours after delivery and replied.
    const at = new Date(h.delivered_at.getTime() + between(0.5, 6) * 3_600_000)
    const patient = PATIENTS.find((p) => p.id === h.patient_id)!
    // Store the outbound body, same as sendConditionCheck does — otherwise the caregiver
    // phone renders a reply with no message above it.
    insertEvent.run(
      id,
      'family_notified',
      JSON.stringify({
        kind: 'condition_check',
        channel: 'sms',
        to: patient.phone,
        body: conditionCheckText({ equipment_name: item.equipment_name } as Order, patient.caregiver),
      }),
      'system',
      iso(h.delivered_at),
    )
    insertCondition.run(id, h.vendor_id, h.patient_id, h.condition_score, 'caregiver', null, iso(at))
    if (h.condition_score <= 2) {
      insertEscalation.run(
        id,
        `Equipment condition reported as ${h.condition_score}/5 by the household`,
        'resolved',
        iso(at),
      )
    }
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
  placedHoursAgo = 0,
) {
  const item = byCode(code)!
  // The silence ladder and the ack-SLA risk rule both measure from the order_placed event,
  // so a backdated order has to move the event row too, not just created_at.
  const placedAt = hours(-placedHoursAgo)
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
    placedAt,
  )
  insertEvent.run(id, 'order_placed', null, 'hospice', placedAt)
  // An order that already moved past 'ordered' was answered off-camera; recording that
  // releases its pair, so a seeded world doesn't open with four of five codes spoken for.
  // The answer is on camera too — reply bubble and receipt — or the phone would show an
  // open-looking question whose pair is secretly retired.
  //
  // Allocated through the seedSlot replay, NOT live allocateSlot: a backdated question
  // must dodge the pairs that were held at placedAt in thread time, not the ones held now.
  const answeredAt = state === 'ordered' ? null : placedAt
  const placedMs = new Date(placedAt).getTime()
  const { base: slot } = seedSlot(vendorId, placedMs, answeredAt ? 0 : 365 * 24 * 3_600_000)
  insertVendorMessage.run(
    id,
    vendorId,
    orderRequestText(getOrder(id)!, PATIENTS.find((p) => p.id === patientId)?.market ?? '', slotDigits(slot)),
    'v_order_request',
    slot,
    answeredAt,
    placedAt,
  )
  if (answeredAt) {
    insertVendorReply.run(id, vendorId, String(slotDigits(slot)[0]), answeredAt)
    insertVendorAck.run(id, vendorId, vendorAckText(getOrder(id)!, 'accept', String(slotDigits(slot)[0])), answeredAt)
  }
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

/**
 * Beehive is M–F 9–5, so a routine deadline that would land on their weekend is quoted for
 * the Monday. Keeps #1061 off the at-risk panel on every demo date: scenario 3's second
 * order has to be flagged by SILENCE, not by a weekend risk score that fires at seed time.
 */
function nextBusinessDeadline(h: number): number {
  const day = new Date(Date.now() + h * 3_600_000).getDay()
  return day === 6 ? h + 48 : day === 0 ? h + 24 : h
}

if (scenario === 'scenario1') {
  // A (vendor × code × weekday) cell holds ~20 orders, so its on-time rate swings either
  // side of the risk rule's 85% and cannot carry this card alone. The 6h backdate and the
  // 12h deadline are what hold it over the threshold on every demo date (75-100).
  seedOrder(1042, 3, 2, BED, 'ordered', 12, null, 6)
  seedOrder(1043, 3, 3, OXY, 'dispatched', 16, 12)
} else if (scenario === 'scenario2') {
  seedOrder(1050, 5, 1, BED, 'delivered', null, null)
  seedOrder(1051, 5, 1, OXY, 'delivered', null, null)
} else if (scenario === 'scenario3') {
  seedOrder(1060, 4, 4, BED, 'ordered', 20, null)
  seedOrder(1061, 1, 2, CHAIR, 'ordered', nextBusinessDeadline(44), null, 5)
} else {
  seedOrder(1042, 3, 2, BED, 'ordered', 12, null, 6)
  seedOrder(1050, 5, 1, OXY, 'delivered', null, null)
  seedOrder(1060, 4, 4, BED, 'ordered', 20, null)
  seedOrder(1070, 5, 3, CPAP, 'in_transit', 30, 26)
}

// ---------------------------------------------------------------- report + demo check

const orders = db.prepare('SELECT * FROM orders WHERE id < 2000').all() as Order[]
const allStats = db.prepare('SELECT * FROM vendor_stats').all() as VendorStat[]

console.log(`\nseeded '${scenario}'`)
console.log(
  `  patients=${PATIENTS.length} vendors=${VENDORS.length + 1} catalog=${CATALOG.length} codes` +
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
  const rated = mine.filter((h) => h.condition_score !== null)
  const avgCond = rated.reduce((a, h) => a + h.condition_score!, 0) / Math.max(1, rated.length)
  const badRate = rated.filter((h) => h.condition_score! <= 2).length / Math.max(1, rated.length)
  console.log(
    `    ${v.name.padEnd(24)} ${((ot / mine.length) * 100).toFixed(0)}% on-time  ` +
      `pickup avg ${avgPickup.toFixed(0)}h  condition ${avgCond.toFixed(2)}/5 ` +
      `(${(badRate * 100).toFixed(0)}% rated 1-2)  n=${mine.length}`,
  )
}
console.log(
  `    ${COLD_START_VENDOR.name.padEnd(24)} no history — ` +
    `${allStats.filter((s) => s.vendor_id === COLD_START_VENDOR.id).length} vendor_stats rows (the cold start)`,
)

const dowName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const rateFor = (vendorId: number, code: string, dow: number) =>
  allStats.find((s) => s.vendor_id === vendorId && s.hcpcs_code === code && s.day_of_week === dow)

console.log('\n  demo orders — computed risk (threshold ' + RISK_THRESHOLD + '):')
for (const o of orders) {
  const stats = allStats.filter((s) => s.vendor_id === o.vendor_id)
  const r = computeRisk({ ...o, risk_reasons: null }, stats, new Date())
  const flag = r.score >= RISK_THRESHOLD ? 'AT RISK' : 'ok'
  console.log(`    #${o.id} ${o.equipment_name.padEnd(30)} score=${String(r.score).padStart(3)}  ${flag}`)
  for (const reason of r.reasons) console.log(`         · ${reason}`)
  // What the swap-vendor menu is worth on stage today: same code, same deadline weekday.
  if (r.score >= RISK_THRESHOLD && o.target_at) {
    const dow = new Date(o.target_at).getDay()
    const alts = VENDORS.filter((v) => v.id !== o.vendor_id)
      .map((v) => {
        const s = rateFor(v.id, o.hcpcs_code, dow)
        return `${v.name} ${s ? Math.round(s.on_time_rate * 100) + '%' : 'n/a'}`
      })
      .join(' · ')
    console.log(`         swap options (${dowName[dow]} deadline): ${alts}`)
  }
}
console.log(
  '\n  NOTE: risk keys off the TARGET DATE weekday, so scores shift depending on the day' +
    '\n  you seed. Re-run this check on demo morning before rehearsing.\n',
)
