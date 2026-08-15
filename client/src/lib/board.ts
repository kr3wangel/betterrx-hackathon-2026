import type { Escalation, Order, VendorScorecard } from '../../../shared/types'
import { isLive, isNeedsYou } from './atRisk'

export type PillTone = 'act' | 'good' | 'wait'
export type RowAction = 'swap' | 'call' | null

export interface Pill {
  tone: PillTone
  label: string
  action: RowAction
}

export interface When {
  text: string
  overdue: boolean
}

export interface BoardRow {
  key: string
  who: string
  action: string
  item: string
  when: When | null
  pill: Pill
  orders: Order[]
  atRisk: boolean
}

export interface DoneLedgerRow {
  id: number
  item: string
  who: string
  verified: boolean
  at: string | null
}

export interface Board {
  needsYou: BoardRow[]
  onTheWay: BoardRow[]
  later: { rows: BoardRow[]; nothingDueBefore: string | null }
  done: { completions: number; withPod: number; ledger: DoneLedgerRow[] }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const PICKUP_STATES = ['pickup_pending', 'pickup_overdue']
const HORIZON_DAYS = 6
const DONE_WINDOW_DAYS = 7

export function isPickup(order: Order): boolean {
  return PICKUP_STATES.includes(order.state)
}

export function plainItem(equipmentName: string): string {
  return equipmentName.split(',')[0].trim()
}

/**
 * A pickup has no deadline column of its own — the trigger only moves state — so the
 * promised pickup time is the vendor's ETA and the delivery target is the fallback.
 */
export function whenAnchor(order: Order): string | null {
  return isPickup(order) ? (order.eta_at ?? order.target_at) : (order.target_at ?? order.eta_at)
}

function clockLabel(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const hour12 = h % 12 === 0 ? 12 : h % 12
  const suffix = h < 12 ? 'AM' : 'PM'
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${String(m).padStart(2, '0')}${suffix}`
}

function calendarDaysApart(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((b - a) / 86_400_000)
}

function elapsedLabel(ms: number): string {
  const hours = ms / 3_600_000
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))}m overdue`
  if (hours < 24) return `${Math.round(hours)}h overdue`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} overdue`
}

export function formatWhen(iso: string, now: Date): When {
  const d = new Date(iso)
  const ms = d.getTime() - now.getTime()
  if (ms < 0) return { text: elapsedLabel(-ms), overdue: true }
  const days = calendarDaysApart(now, d)
  if (days === 0) return { text: 'Today', overdue: false }
  if (days === 1) return { text: 'Tomorrow', overdue: false }
  if (days <= HORIZON_DAYS) return { text: WEEKDAYS[d.getDay()], overdue: false }
  return { text: `${MONTHS[d.getMonth()]} ${d.getDate()}`, overdue: false }
}

function pluralItem(equipmentName: string): string {
  const name = plainItem(equipmentName).toLowerCase()
  return name.endsWith('s') ? name : `${name}s`
}

export function decisionLine(card: VendorScorecard, order: Order, now: Date): string {
  if (card.total_samples === 0) return 'New — no history yet'
  const dow = new Date(order.target_at ?? now).getDay()
  const cell = card.stats.find((s) => s.hcpcs_code === order.hcpcs_code && s.day_of_week === dow)
  if (cell && cell.sample_size > 0) {
    return `${Math.round(cell.on_time_rate * 100)}% on-time for ${pluralItem(order.equipment_name)} on ${WEEKDAYS[dow]}`
  }
  const overall = card.overall_on_time_rate
  return overall === null ? 'New — no history yet' : `${Math.round(overall * 100)}% on-time overall`
}

export function statePill(order: Order): Pill {
  if (isPickup(order)) {
    return order.eta_at
      ? { tone: 'good', label: 'Confirmed ✓', action: null }
      : { tone: 'wait', label: 'Waiting on vendor', action: null }
  }
  if (order.state === 'dispatched') return { tone: 'good', label: 'Accepted ✓', action: null }
  if (order.state === 'in_transit') return { tone: 'good', label: 'On the truck', action: null }
  return { tone: 'wait', label: 'Waiting on vendor', action: null }
}

function crisisPill(order: Order): Pill {
  return isPickup(order)
    ? { tone: 'act', label: 'Call the vendor', action: 'call' }
    : { tone: 'act', label: 'Swap vendor', action: 'swap' }
}

function singleRow(order: Order, patientName: (id: number) => string, atRisk: boolean, now: Date): BoardRow {
  const anchor = whenAnchor(order)
  return {
    key: `o${order.id}`,
    who: patientName(order.patient_id),
    action: isPickup(order) ? 'Pickup' : 'Delivery',
    item: plainItem(order.equipment_name),
    when: anchor ? formatWhen(anchor, now) : null,
    pill: atRisk ? crisisPill(order) : statePill(order),
    orders: [order],
    atRisk,
  }
}

function groupRow(orders: Order[], patientName: (id: number) => string, now: Date): BoardRow {
  const anchors = orders.map(whenAnchor).filter((a): a is string => a !== null)
  const soonest = anchors.sort()[0] ?? null
  const moving = orders.filter((o) => statePill(o).tone === 'good').length
  const actions = new Set(orders.map((o) => (isPickup(o) ? 'Pickup' : 'Delivery')))
  return {
    key: `p${orders[0].patient_id}`,
    who: patientName(orders[0].patient_id),
    action: actions.size === 1 ? [...actions][0] : 'Delivery & pickup',
    item: `${orders.length} items`,
    when: soonest ? formatWhen(soonest, now) : null,
    pill: { tone: 'good', label: `${moving} of ${orders.length} moving`, action: null },
    orders,
    atRisk: false,
  }
}

function rowSortKey(row: BoardRow): number {
  const anchors = row.orders.map(whenAnchor).filter((a): a is string => a !== null)
  if (anchors.length === 0) return Number.MAX_SAFE_INTEGER
  return Math.min(...anchors.map((a) => new Date(a).getTime()))
}

function bySoonest(a: BoardRow, b: BoardRow): number {
  return rowSortKey(a) - rowSortKey(b)
}

export function buildBoard(
  orders: Order[],
  escalations: Escalation[],
  patientName: (id: number) => string,
  now: Date = new Date(),
): Board {
  const escalated = new Set(escalations.map((e) => e.order_id))
  const live = orders.filter(isLive)

  const needsYouOrders = live.filter((o) => isNeedsYou(o, escalated))
  const needsYouIds = new Set(needsYouOrders.map((o) => o.id))
  const needsYou = needsYouOrders
    .map((o) => singleRow(o, patientName, true, now))
    .sort((a, b) => {
      const aOverdue = a.when?.overdue ?? false
      const bOverdue = b.when?.overdue ?? false
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
      return aOverdue ? rowSortKey(a) - rowSortKey(b) : bySoonest(a, b)
    })

  const rest = live.filter((o) => !needsYouIds.has(o.id))
  const byPatient = new Map<number, Order[]>()
  for (const o of rest) {
    const bucket = byPatient.get(o.patient_id)
    if (bucket) bucket.push(o)
    else byPatient.set(o.patient_id, [o])
  }

  const allRows = [...byPatient.values()]
    .map((group) => (group.length > 1 ? groupRow(group, patientName, now) : singleRow(group[0], patientName, false, now)))
    .sort(bySoonest)

  // A row with no date at all is not "due beyond 6 days" — it has nothing to be late for,
  // so it stays visible rather than hiding behind the collapse.
  const horizon = now.getTime() + HORIZON_DAYS * 86_400_000
  const isLater = (r: BoardRow) => {
    const key = rowSortKey(r)
    return key !== Number.MAX_SAFE_INTEGER && key > horizon
  }
  const onTheWay = allRows.filter((r) => !isLater(r))
  const laterRows = allRows.filter(isLater)
  const firstDated = laterRows.map(rowSortKey)[0]

  const windowStart = now.getTime() - DONE_WINDOW_DAYS * 86_400_000
  const completedAt = (o: Order) => o.eta_at ?? o.created_at
  const completed = orders
    .filter((o) => (o.state === 'delivered' || o.state === 'picked_up') && new Date(completedAt(o)).getTime() >= windowStart)
    .sort((a, b) => new Date(completedAt(b)).getTime() - new Date(completedAt(a)).getTime())
  const hasPod = (o: Order) => (o.state === 'picked_up' ? o.pickup_verified : o.delivery_verified)

  return {
    needsYou,
    onTheWay,
    later: {
      rows: laterRows,
      nothingDueBefore: firstDated ? WEEKDAYS[new Date(firstDated).getDay()] : null,
    },
    done: {
      completions: completed.length,
      withPod: completed.filter(hasPod).length,
      ledger: completed.map((o) => ({
        id: o.id,
        item: plainItem(o.equipment_name),
        who: patientName(o.patient_id),
        verified: hasPod(o),
        at: completedAt(o),
      })),
    },
  }
}
