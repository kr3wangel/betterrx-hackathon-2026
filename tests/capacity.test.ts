import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../server/db'
import { declareCapacity, demoDay, resolveToken, vendorLoad, vendorToken } from '../server/portal'
import { seedFixtures, seedOrder } from './helpers'

beforeEach(() => {
  seedFixtures()
  db.exec('DELETE FROM vendor_capacity')
})

const today = () => demoDay()
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()

describe('demoDay', () => {
  it('is the UTC calendar day, the one day function seed and reader share', () => {
    expect(demoDay()).toBe(new Date().toISOString().slice(0, 10))
    expect(demoDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('vendorLoad stop grouping', () => {
  it('counts two deliveries to one household as one stop', () => {
    seedOrder({ vendor_id: 1, patient_id: 1 })
    seedOrder({ vendor_id: 1, patient_id: 1, hcpcs_code: 'E0431', equipment_name: 'Oxygen' })
    expect(vendorLoad(1).open_stops).toBe(1)
  })

  it('counts a delivery and a pickup at one household as two stops', () => {
    seedOrder({ vendor_id: 1, patient_id: 1 })
    seedOrder({ vendor_id: 1, patient_id: 1, state: 'pickup_pending' })
    expect(vendorLoad(1).open_stops).toBe(2)
  })

  it('ignores other vendors and closed orders', () => {
    seedOrder({ vendor_id: 2, patient_id: 1 })
    seedOrder({ vendor_id: 1, patient_id: 1, state: 'delivered' })
    expect(vendorLoad(1).open_stops).toBe(0)
  })

  it('counts overdue pickups separately from open stops', () => {
    seedOrder({ vendor_id: 1, patient_id: 1, state: 'pickup_overdue' })
    seedOrder({ vendor_id: 1, patient_id: 2, state: 'pickup_pending' })
    const load = vendorLoad(1)
    expect(load.open_stops).toBe(2)
    expect(load.overdue_pickups).toBe(1)
  })
})

describe('vendorLoad due today', () => {
  it('counts a delivery targeted today', () => {
    seedOrder({ vendor_id: 1, patient_id: 1, target_at: hoursFromNow(2) })
    expect(vendorLoad(1).due_today_stops).toBe(1)
  })

  it('skips a delivery targeted a week out', () => {
    seedOrder({ vendor_id: 1, patient_id: 1, target_at: hoursFromNow(24 * 7) })
    expect(vendorLoad(1).due_today_stops).toBe(0)
  })

  it('counts an overdue delivery, whatever day its target fell on', () => {
    seedOrder({ vendor_id: 1, patient_id: 1, target_at: hoursFromNow(-24 * 3) })
    expect(vendorLoad(1).due_today_stops).toBe(1)
  })

  // A triggered pickup has no date: "as soon as you can" is the whole instruction.
  it('counts an undated pickup', () => {
    seedOrder({ vendor_id: 1, patient_id: 1, state: 'pickup_pending', target_at: null })
    expect(vendorLoad(1).due_today_stops).toBe(1)
  })

  it('counts a stop once even when several of its orders are due', () => {
    seedOrder({ vendor_id: 1, patient_id: 1, target_at: hoursFromNow(1) })
    seedOrder({ vendor_id: 1, patient_id: 1, target_at: hoursFromNow(3) })
    expect(vendorLoad(1).due_today_stops).toBe(1)
  })
})

describe('remaining_today', () => {
  it('is null when the vendor has not declared', () => {
    seedOrder({ vendor_id: 1, patient_id: 1, target_at: hoursFromNow(1) })
    const load = vendorLoad(1)
    expect(load.capacity).toBeNull()
    expect(load.declared_at).toBeNull()
    expect(load.remaining_today).toBeNull()
  })

  it('is capacity minus due-today stops', () => {
    seedOrder({ vendor_id: 1, patient_id: 1, target_at: hoursFromNow(1) })
    seedOrder({ vendor_id: 1, patient_id: 2, target_at: hoursFromNow(1) })
    declareCapacity(1, 5)
    expect(vendorLoad(1).remaining_today).toBe(3)
  })

  it('clamps at zero when the day is oversubscribed', () => {
    for (let i = 1; i <= 7; i++) {
      db.prepare('INSERT INTO patients (id, name) VALUES (?, ?)').run(100 + i, `Patient ${i}`)
      seedOrder({ vendor_id: 1, patient_id: 100 + i, target_at: hoursFromNow(1) })
    }
    declareCapacity(1, 5)
    const load = vendorLoad(1)
    expect(load.due_today_stops).toBe(7)
    expect(load.remaining_today).toBe(0)
  })

  it('treats a declared zero as a real declaration, not an absent one', () => {
    declareCapacity(1, 0)
    const load = vendorLoad(1)
    expect(load.capacity).toBe(0)
    expect(load.remaining_today).toBe(0)
  })
})

describe('declareCapacity', () => {
  it('writes today’s row and returns the fresh load', () => {
    const load = declareCapacity(1, 6)
    expect(load.vendor_id).toBe(1)
    expect(load.capacity).toBe(6)
    expect(load.declared_at).not.toBeNull()
    const row = db.prepare('SELECT * FROM vendor_capacity WHERE vendor_id = ? AND day = ?').get(1, today())
    expect(row).toBeTruthy()
  })

  it('overwrites a second declaration on the same day rather than stacking rows', () => {
    declareCapacity(1, 6)
    declareCapacity(1, 3)
    const rows = db.prepare('SELECT * FROM vendor_capacity WHERE vendor_id = ?').all(1)
    expect(rows).toHaveLength(1)
    expect(vendorLoad(1).capacity).toBe(3)
  })

  it('rejects a negative or fractional declaration', () => {
    expect(() => declareCapacity(1, -1)).toThrow()
    expect(() => declareCapacity(1, 2.5)).toThrow()
  })

  it('leaves yesterday’s declaration alone', () => {
    db.prepare('INSERT INTO vendor_capacity (vendor_id, day, stops, declared_at) VALUES (?, ?, ?, ?)').run(
      1,
      '2020-01-01',
      9,
      '2020-01-01T00:00:00.000Z',
    )
    declareCapacity(1, 4)
    expect(vendorLoad(1, '2020-01-01').capacity).toBe(9)
    expect(vendorLoad(1).capacity).toBe(4)
  })
})

// The portal write is token-scoped: the token resolves to the vendor it belongs to, so a
// declaration posted with the wrong token can only ever land on that other vendor.
describe('token ownership', () => {
  it('a declaration made under vendor 2’s token never shows on vendor 1’s load', () => {
    const wrong = resolveToken(vendorToken(2))!
    declareCapacity(wrong.id, 8)
    expect(vendorLoad(1).capacity).toBeNull()
    expect(vendorLoad(2).capacity).toBe(8)
  })

  it('an unknown token resolves to no vendor at all', () => {
    expect(resolveToken('not-a-real-token')).toBeNull()
  })
})

// The seeded world has to carry the story: two vendors declare, Beehive never does, and the
// cold-start vendor has nothing until it is tapped. Run against a throwaway file DB because
// the seed script is a process, not a function.
describe('seeded declarations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'capacity-seed-'))
  const path = join(dir, 'seed.db')
  execFileSync('npx', ['tsx', 'scripts/seed.ts'], { env: { ...process.env, DB_PATH: path }, stdio: 'ignore' })
  const seeded = new Database(path)
  const rows = seeded
    .prepare('SELECT vendor_id, stops FROM vendor_capacity WHERE day = ?')
    .all(demoDay()) as { vendor_id: number; stops: number }[]

  afterAll(() => {
    seeded.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('declares today for Wasatch and Canyon', () => {
    expect(rows.find((r) => r.vendor_id === 1)?.stops).toBe(6)
    expect(rows.find((r) => r.vendor_id === 3)?.stops).toBe(5)
  })

  it('leaves Beehive and the cold-start vendor undeclared', () => {
    expect(rows.find((r) => r.vendor_id === 2)).toBeUndefined()
    expect(rows.find((r) => r.vendor_id === 4)).toBeUndefined()
  })
})
