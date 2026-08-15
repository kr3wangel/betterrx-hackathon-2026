import { describe, it, expect } from 'vitest'
import { buildBoard, dischargeReadiness, loadLine, statePill } from '../client/src/lib/board'
import type { Order, VendorLoad } from '../shared/types'

const NOW = new Date('2026-08-14T12:00:00Z')

function order(over: Partial<Order>): Order {
  return {
    id: 1,
    patient_id: 1,
    vendor_id: 1,
    hcpcs_code: 'E0260',
    equipment_name: 'Hospital bed, semi-electric',
    quantity: 1,
    urgency: 'routine',
    target_at: null,
    state: 'pickup_pending',
    eta_at: null,
    risk_score: 0,
    risk_reasons: null,
    delivery_verified: false,
    pickup_verified: false,
    pickup_committed: false,
    family_confirmed: false,
    created_at: NOW.toISOString(),
    ...over,
  }
}

const patientName = () => 'Ruth Nakamura'

describe('statePill for pickups', () => {
  it('reads as waiting until the vendor commits', () => {
    expect(statePill(order({}))).toMatchObject({ tone: 'wait', label: 'Waiting on vendor' })
  })

  it('reads as confirmed once the vendor commits, with no eta of its own', () => {
    const committed = order({ pickup_committed: true })
    expect(committed.eta_at).toBeNull()
    expect(statePill(committed)).toMatchObject({ tone: 'good', label: 'Confirmed ✓' })
  })

  it('still reads as confirmed off a vendor-supplied pickup eta', () => {
    expect(statePill(order({ eta_at: NOW.toISOString() }))).toMatchObject({ tone: 'good', label: 'Confirmed ✓' })
  })
})

describe('grouped pickup row', () => {
  function groupPill(orders: Order[]): string {
    const board = buildBoard(orders, [], patientName, NOW)
    const row = board.onTheWay.find((r) => r.key === 'p1')!
    expect(row.orders).toHaveLength(orders.length)
    return row.pill.label
  }

  it('counts a committed pickup as moving', () => {
    expect(groupPill([order({ id: 1 }), order({ id: 2 })])).toBe('0 of 2 moving')
    expect(groupPill([order({ id: 1, pickup_committed: true }), order({ id: 2 })])).toBe('1 of 2 moving')
    expect(
      groupPill([order({ id: 1, pickup_committed: true }), order({ id: 2, pickup_committed: true })]),
    ).toBe('2 of 2 moving')
  })
})

describe('discharge readiness', () => {
  const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString()
  const delivery = (over: Partial<Order>) => order({ state: 'ordered', target_at: inHours(72), ...over })

  it('reads ready once every delivery is past ordered', () => {
    const r = dischargeReadiness(
      [delivery({ id: 1, state: 'dispatched' }), delivery({ id: 2, state: 'delivered' })],
      NOW,
    )
    expect(r).toMatchObject({ ready: true, tone: 'good', text: 'Ready for discharge — 2 of 2 confirmed' })
  })

  it('names the unconfirmed count while a vendor has not committed', () => {
    const r = dischargeReadiness([delivery({ id: 1, state: 'dispatched' }), delivery({ id: 2 })], NOW)
    expect(r).toMatchObject({ ready: false, tone: 'wait', text: 'NOT ready — 1 of 2 unconfirmed' })
  })

  it('leaves pickups out of the math entirely', () => {
    const pickups = [order({ id: 8 }), order({ id: 9, state: 'pickup_overdue' })]
    expect(dischargeReadiness(pickups, NOW)).toBeNull()
    expect(dischargeReadiness([...pickups, delivery({ id: 1, state: 'dispatched', target_at: inHours(12) })], NOW))
      .toMatchObject({ ready: true, text: 'Ready for discharge — 1 of 1 confirmed' })
  })

  it('speaks up for a single order only when the discharge is close', () => {
    expect(dischargeReadiness([delivery({ id: 1, target_at: inHours(12) })], NOW)).toMatchObject({
      ready: false,
      text: 'NOT ready — 1 of 1 unconfirmed',
    })
    expect(dischargeReadiness([delivery({ id: 1 })], NOW)).toBeNull()
  })

  it('rides along on the board row for the whole patient', () => {
    const board = buildBoard(
      [delivery({ id: 1, state: 'dispatched' }), delivery({ id: 2 })],
      [],
      patientName,
      NOW,
    )
    expect(board.onTheWay.find((r) => r.key === 'p1')!.readiness?.text).toBe('NOT ready — 1 of 2 unconfirmed')
  })
})

describe('single pickup row', () => {
  it('upgrades the pill when the vendor commits', () => {
    const board = buildBoard([order({ id: 1, pickup_committed: true })], [], patientName, NOW)
    expect(board.onTheWay[0].pill).toMatchObject({ tone: 'good', label: 'Confirmed ✓', action: null })
  })

  it('leaves a crisis row on its action pill', () => {
    const board = buildBoard([order({ id: 1, state: 'pickup_overdue', pickup_committed: true })], [], patientName, NOW)
    expect(board.needsYou[0].pill).toMatchObject({ tone: 'act', label: 'Call the vendor', action: 'call' })
  })
})

describe('vendor load line', () => {
  function load(over: Partial<VendorLoad>): VendorLoad {
    return {
      vendor_id: 1,
      open_stops: 3,
      due_today_stops: 3,
      overdue_pickups: 0,
      capacity: null,
      declared_at: null,
      remaining_today: null,
      ...over,
    }
  }

  it('stays blunt about a vendor who has not declared', () => {
    expect(loadLine(load({}))).toEqual({ text: '3 stops open · no capacity signal', warn: false })
  })

  it('renders the room the vendor claims rather than deriving it', () => {
    expect(loadLine(load({ capacity: 5, remaining_today: 2 }))).toEqual({
      text: '3 stops open · says they can take 2 more today',
      warn: false,
    })
  })

  it('separates a full day from a declared zero, warning on both', () => {
    expect(loadLine(load({ capacity: 3, remaining_today: 0 }))).toEqual({
      text: "3 stops open · says they're at capacity today",
      warn: true,
    })
    expect(loadLine(load({ capacity: 0, remaining_today: 0 }))).toEqual({
      text: '3 stops open · says no trucks today',
      warn: true,
    })
  })

  it('speaks of one stop in the singular', () => {
    expect(loadLine(load({ open_stops: 1 })).text).toBe('1 stop open · no capacity signal')
  })
})
