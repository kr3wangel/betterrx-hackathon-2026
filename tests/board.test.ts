import { describe, it, expect } from 'vitest'
import { buildBoard, statePill } from '../client/src/lib/board'
import type { Order } from '../shared/types'

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
