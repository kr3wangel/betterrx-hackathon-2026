import 'dotenv/config'

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set — add it to .env first.')
  process.exit(1)
}
process.env.DB_PATH = ':memory:'

const { db } = await import('../server/db')
const { handleInbound } = await import('../server/messaging')
const { getOrder } = await import('../server/store')

db.prepare("INSERT INTO patients (id, name, market) VALUES (1, 'Eleanor Vance', 'SLC')").run()
db.prepare("INSERT INTO vendors (id, name) VALUES (1, 'Wasatch Medical Supply')").run()

const insertOrder = db.prepare(
  "INSERT INTO orders (id, patient_id, vendor_id, hcpcs_code, equipment_name, state, target_at) VALUES (?, 1, 1, ?, ?, ?, ?)",
)
const hours = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString()

insertOrder.run(101, 'E0260', 'Hospital bed, semi-electric', 'ordered', hours(40))
insertOrder.run(102, 'E1390', 'Oxygen concentrator', 'in_transit', hours(40))
insertOrder.run(103, 'K0001', 'Standard wheelchair', 'pickup_pending', null)
insertOrder.run(104, 'E0601', 'CPAP device', 'ordered', hours(60))

const CASES: { body: string; expect: string; note?: string }[] = [
  { body: 'yes we got it, bed will be there thurs by 10am', expect: 'accept', note: 'ETA should resolve to an actual Thursday 10:00' },
  { body: 'dropped off the O2 at the house, daughter signed for it', expect: 'delivered', note: 'should match the oxygen concentrator (#102)' },
  { body: 'running behind on the bed, probably late afternoon now', expect: 'delay', note: 'should escalate + set fuzzy ETA' },
  { body: 'we can grab the wheelchair friday', expect: 'pickup_scheduled', note: 'pickup window on #103' },
  { body: 'who is this?', expect: 'unknown', note: 'must go to review queue, NOT auto-apply' },
  { body: "cant do the cpap this week, truck's down", expect: 'decline', note: 'should escalate' },
]

console.log(`model: ${process.env.PARSE_MODEL || 'claude-haiku-4-5 (default)'}`)

let pass = 0
for (const [i, c] of CASES.entries()) {
  console.log(`\n─── ${i + 1}/6: "${c.body}"`)
  const started = Date.now()
  const message = await handleInbound(1, c.body)
  const p = message.parsed
  const ok = p?.intent === c.expect
  if (ok) pass++
  console.log(
    `    ${ok ? '✅' : '❌'} intent=${p?.intent ?? 'none'} (expected ${c.expect}) · order=${message.order_id ?? '—'} · conf=${p ? Math.round(p.confidence * 100) + '%' : '—'} · ${message.review_status} · ${Date.now() - started}ms`,
  )
  if (p?.eta_iso) console.log(`    eta → ${new Date(p.eta_iso).toString()}`)
  if (c.note) console.log(`    check: ${c.note}`)
}

console.log('\n─── resulting order states')
for (const id of [101, 102, 103, 104]) {
  const o = getOrder(id)!
  console.log(`    #${id} ${o.equipment_name}: ${o.state}${o.eta_at ? ` (eta ${o.eta_at})` : ''}`)
}
const escalations = db.prepare("SELECT order_id, reason FROM escalations WHERE status = 'open'").all() as {
  order_id: number
  reason: string
}[]
console.log('\n─── escalations')
for (const e of escalations) console.log(`    #${e.order_id}: ${e.reason.slice(0, 90)}`)

console.log(`\n${pass}/6 intents correct — token usage per call is in the [llm] lines above (feeds deliverable B).`)
