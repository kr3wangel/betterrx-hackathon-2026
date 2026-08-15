import { describe, it, expect } from 'vitest'
import {
  isNarratableType,
  decideNarration,
  collapseNarrations,
  shortEquipment,
  firstName,
} from '../client/src/lib/narration'
import type { NarrationDecision, NarrationWorld } from '../client/src/lib/narration'
import type { Expectation } from '../client/src/lib/expectedEvents'
import type { Order, OrderEventType, Patient, ServerEvent, Vendor } from '../shared/types'

const NOW = new Date('2026-08-14T12:00:00Z').getTime()
const AT = '2026-08-14T12:00:00Z'

function order(over: Partial<Order> = {}): Order {
  return {
    id: 1042,
    patient_id: 7,
    vendor_id: 3,
    hcpcs_code: 'E0260',
    equipment_name: 'Hospital bed, semi-electric',
    quantity: 1,
    urgency: 'routine',
    target_at: null,
    state: 'ordered',
    eta_at: null,
    risk_score: null,
    risk_reasons: null,
    delivery_verified: false,
    pickup_verified: false,
    pickup_committed: false,
    family_confirmed: false,
    created_at: AT,
    ...over,
  }
}

function patient(over: Partial<Patient> = {}): Patient {
  return {
    id: 7,
    name: 'Frank Delacroix',
    status: 'active',
    address: '12 Elm St',
    market: 'SLC',
    caregiver_name: 'Marie Delacroix',
    caregiver_phone: '555-0100',
    contact_ok: 1,
    ...over,
  }
}

function vendor(over: Partial<Vendor> = {}): Vendor {
  return {
    id: 3,
    name: 'Beehive',
    phone: '555-0199',
    channel: 'sms',
    service_area: 'SLC',
    contact_name: 'Dana',
    ...over,
  }
}

function makeWorld(over: Partial<NarrationWorld> = {}): NarrationWorld {
  return {
    orders: [order()],
    patients: [patient()],
    vendors: [vendor()],
    escalations: [],
    ...over,
  }
}

function orderEvent(event_type: OrderEventType, over: Partial<Order> = {}): ServerEvent {
  return { type: 'order_event', at: AT, order_id: 1042, event_type, state: over.state ?? 'ordered' }
}

function narrated(decision: NarrationDecision) {
  if (!decision.narrate) throw new Error(`expected a narration, got ${decision.reason}`)
  return decision
}

// Keyed by the union so adding an OrderEventType fails typecheck here instead of going unnarrated.
const NARRATES: Record<OrderEventType, boolean> = {
  order_placed: true,
  vendor_accepted: true,
  eta_set: true,
  out_for_delivery: true,
  delivered: true,
  pickup_triggered: true,
  pickup_overdue: true,
  picked_up: true,
  vendor_swapped: true,
  cancelled: true,
  family_confirmed: true,
  risk_updated: false,
  family_notified: false,
}

describe('isNarratableType', () => {
  it('is false for heartbeat and message, true for escalation and a real order event', () => {
    expect(isNarratableType({ type: 'heartbeat', at: AT })).toBe(false)
    expect(isNarratableType({ type: 'message', at: AT, message_id: 1, vendor_id: 3, direction: 'in' })).toBe(false)
    expect(isNarratableType({ type: 'escalation', at: AT, order_id: 1042, escalation_id: 9 })).toBe(true)
    expect(isNarratableType(orderEvent('vendor_accepted'))).toBe(true)
  })

  it('is false for the muted order-event types, so a risk storm costs no fetches', () => {
    expect(isNarratableType(orderEvent('risk_updated'))).toBe(false)
    expect(isNarratableType(orderEvent('family_notified'))).toBe(false)
  })
})

describe('noise rules', () => {
  it('never narrates risk_updated', () => {
    expect(decideNarration(orderEvent('risk_updated'), makeWorld(), [], NOW)).toEqual({
      narrate: false,
      reason: 'muted_type',
    })
  })

  it('never narrates family_notified', () => {
    expect(decideNarration(orderEvent('family_notified'), makeWorld(), [], NOW)).toEqual({
      narrate: false,
      reason: 'muted_type',
    })
  })

  it('narrates every other order event type', () => {
    for (const [type, expected] of Object.entries(NARRATES) as [OrderEventType, boolean][]) {
      const decision = decideNarration(orderEvent(type), makeWorld(), [], NOW)
      expect(decision.narrate, `${type} should ${expected ? '' : 'not '}narrate`).toBe(expected)
    }
  })
})

describe('enrichment', () => {
  it('joins vendor, patient and equipment into one sentence', () => {
    const decision = narrated(decideNarration(orderEvent('vendor_accepted'), makeWorld(), [], NOW))
    expect(decision.title).toBe("Beehive accepted Frank's hospital bed")
  })

  it('falls back to the order number when the patient is unknown', () => {
    const world = makeWorld({ patients: [] })
    const decision = narrated(decideNarration(orderEvent('vendor_accepted'), world, [], NOW))
    expect(decision.title).toContain('Order #1042')
    expect(decision.title).not.toContain("'s")
  })

  it('does not narrate an event for an order it has never heard of', () => {
    const world = makeWorld({ orders: [] })
    expect(decideNarration(orderEvent('vendor_accepted'), world, [], NOW)).toEqual({
      narrate: false,
      reason: 'not_narratable',
    })
  })

  it('says "signed for" only when a POD backs the delivery', () => {
    const verified = makeWorld({ orders: [order({ state: 'delivered', delivery_verified: true })] })
    expect(narrated(decideNarration(orderEvent('delivered'), verified, [], NOW)).title).toContain('signed for')

    const claimed = makeWorld({ orders: [order({ state: 'delivered', delivery_verified: false })] })
    const title = narrated(decideNarration(orderEvent('delivered'), claimed, [], NOW)).title
    expect(title).toContain('Beehive')
    expect(title).not.toContain('signed for')
  })

  it('carries the escalation reason and an alert tone', () => {
    const world = makeWorld({
      orders: [order({ state: 'pickup_overdue' })],
      escalations: [{ id: 9, order_id: 1042, reason: 'Pickup is 6 hours past the window', status: 'open', created_at: AT }],
    })
    const decision = narrated(
      decideNarration({ type: 'escalation', at: AT, order_id: 1042, escalation_id: 9 }, world, [], NOW),
    )
    expect(decision.tone).toBe('alert')
    expect(decision.title).toBe("Frank's pickup is overdue — escalated")
    expect(decision.description).toBe('Pickup is 6 hours past the window')
  })

  it('still narrates an escalation whose record has not landed yet', () => {
    const world = makeWorld({ orders: [order({ state: 'pickup_overdue' })] })
    const decision = narrated(
      decideNarration({ type: 'escalation', at: AT, order_id: 1042, escalation_id: 9 }, world, [], NOW),
    )
    expect(decision.description).toBeNull()
  })
})

describe('own-action suppression', () => {
  const liveOrder: Expectation = { key: 'order:1042', types: null, until: NOW + 1000 }

  it('suppresses an event the user just caused', () => {
    expect(decideNarration(orderEvent('vendor_accepted'), makeWorld(), [liveOrder], NOW)).toEqual({
      narrate: false,
      reason: 'own_action',
    })
  })

  it('prunes by the injected now, not the wall clock', () => {
    const expired: Expectation = { ...liveOrder, until: NOW - 1 }
    expect(decideNarration(orderEvent('vendor_accepted'), makeWorld(), [expired], NOW).narrate).toBe(true)
  })

  it('suppresses by patient for actions that fan out across orders', () => {
    const byPatient: Expectation = { key: 'patient:7', types: null, until: NOW + 1000 }
    expect(decideNarration(orderEvent('pickup_triggered'), makeWorld(), [byPatient], NOW)).toEqual({
      narrate: false,
      reason: 'own_action',
    })
  })

  it('lets an unrelated event through a narrowed patient expectation', () => {
    const narrowed: Expectation = { key: 'patient:7', types: ['pickup_triggered'], until: NOW + 1000 }
    expect(decideNarration(orderEvent('vendor_accepted'), makeWorld(), [narrowed], NOW).narrate).toBe(true)
  })
})

describe('collapseNarrations', () => {
  const decide = (type: OrderEventType, id = 1042) => {
    const world = makeWorld({ orders: [order({ id }), order({ id: 1042 })] })
    return decideNarration(
      { type: 'order_event', at: AT, order_id: id, event_type: type, state: 'ordered' },
      world,
      [],
      NOW,
    )
  }

  it('turns repeats on one order into a single counted toast', () => {
    const toasts = collapseNarrations([decide('order_placed'), decide('vendor_accepted'), decide('out_for_delivery')])
    expect(toasts).toEqual([
      { title: "3 updates on Frank's hospital bed", description: null, tone: 'good', pulseOrderIds: [1042] },
    ])
  })

  it('leaves separate orders alone', () => {
    const toasts = collapseNarrations([decide('vendor_accepted', 1), decide('vendor_accepted', 2), decide('vendor_accepted', 3)])
    expect(toasts).toHaveLength(3)
    for (const toast of toasts) expect(toast.title).toBe("Beehive accepted Frank's hospital bed")
  })

  it('handles a mixed batch', () => {
    const toasts = collapseNarrations([decide('vendor_accepted', 1), decide('out_for_delivery', 1), decide('vendor_accepted', 2)])
    expect(toasts).toHaveLength(2)
    expect(toasts[0].title).toContain('2 updates')
    expect(toasts[1].title).toBe("Beehive accepted Frank's hospital bed")
  })

  it('drops suppressed decisions and returns nothing for an empty batch', () => {
    expect(collapseNarrations([])).toEqual([])
    expect(collapseNarrations([{ narrate: false, reason: 'muted_type' }])).toEqual([])
  })
})

describe('purity', () => {
  it('returns deep-equal output and mutates nothing', () => {
    const world = makeWorld()
    const expectations: Expectation[] = [{ key: 'order:99', types: null, until: NOW + 1000 }]
    const worldBefore = structuredClone(world)
    const expectationsBefore = structuredClone(expectations)

    const first = decideNarration(orderEvent('vendor_accepted'), world, expectations, NOW)
    const second = decideNarration(orderEvent('vendor_accepted'), world, expectations, NOW)

    expect(first).toEqual(second)
    expect(world).toEqual(worldBefore)
    expect(expectations).toEqual(expectationsBefore)
  })
})

describe('sentence helpers', () => {
  it('shortens equipment to the text before the first comma', () => {
    expect(shortEquipment('Hospital bed, semi-electric')).toBe('hospital bed')
    expect(shortEquipment('Oxygen concentrator')).toBe('oxygen concentrator')
  })

  it('takes the first name only', () => {
    expect(firstName('Frank Delacroix')).toBe('Frank')
    expect(firstName('Ruth')).toBe('Ruth')
  })
})
