import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../server/db'
import { recordPodCondition } from '../server/pods'
import { rowToPod } from '../server/store'
import { seedFixtures, seedOrder } from './helpers'
import type { Pod, PodKind } from '../shared/types'

beforeEach(seedFixtures)

function insertPod(orderId: number, kind: PodKind, condition: string | null): Pod {
  db.prepare('INSERT INTO pods (order_id, kind, condition) VALUES (?, ?, ?)').run(orderId, kind, condition)
  const row = db.prepare('SELECT * FROM pods WHERE order_id = ? ORDER BY id DESC').get(orderId) as never
  return rowToPod(row)
}

function openReasons(orderId: number): string[] {
  return (
    db.prepare("SELECT reason FROM escalations WHERE order_id = ? AND status = 'open'").all(orderId) as {
      reason: string
    }[]
  ).map((r) => r.reason)
}

describe('condition storage', () => {
  it('round-trips a condition through the pod mapper', () => {
    const id = seedOrder({ state: 'in_transit' })
    const stored = recordPodCondition(id, 'delivery', { clean: true, functional: true, patient_ready: true })
    const pod = insertPod(id, 'delivery', stored)
    expect(pod.condition).toEqual({ clean: true, functional: true, patient_ready: true })
  })

  it('leaves condition null when the driver sends none', () => {
    const id = seedOrder({ state: 'in_transit' })
    const stored = recordPodCondition(id, 'delivery', undefined)
    expect(stored).toBeNull()
    expect(insertPod(id, 'delivery', stored).condition).toBeNull()
    expect(openReasons(id)).toHaveLength(0)
  })
})

describe('condition escalations', () => {
  it('all-true delivery opens no escalation', () => {
    const id = seedOrder({ state: 'in_transit' })
    recordPodCondition(id, 'delivery', { clean: true, functional: true, patient_ready: true })
    expect(openReasons(id)).toHaveLength(0)
  })

  it('a single failed check opens exactly one escalation naming it', () => {
    const id = seedOrder({ state: 'in_transit' })
    recordPodCondition(id, 'delivery', { clean: false, functional: true, patient_ready: true })
    const reasons = openReasons(id)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toBe(`Equipment condition flagged at delivery for order #${id} — not clean`)
  })

  it('lists every failed check in one escalation', () => {
    const id = seedOrder({ state: 'in_transit' })
    recordPodCondition(id, 'delivery', { clean: true, functional: false, patient_ready: false })
    expect(openReasons(id)).toEqual([
      `Equipment condition flagged at delivery for order #${id} — not functional, not patient-ready`,
    ])
  })

  it('a failed check on a pickup pod opens no escalation', () => {
    const id = seedOrder({ state: 'pickup_pending' })
    const stored = recordPodCondition(id, 'pickup', { clean: false, functional: false, patient_ready: false })
    expect(openReasons(id)).toHaveLength(0)
    expect(insertPod(id, 'pickup', stored).condition).toEqual({
      clean: false,
      functional: false,
      patient_ready: false,
    })
  })
})
