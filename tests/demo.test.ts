import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../server/db'
import { stageSilence } from '../server/demo'
import { seedFixtures } from './helpers'

// The combined world is a process, not a function, so it runs against a throwaway file DB.
describe('seed demo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'demo-seed-'))
  const path = join(dir, 'seed.db')
  execFileSync('npx', ['tsx', 'scripts/seed.ts', 'demo'], {
    env: { ...process.env, DB_PATH: path },
    stdio: 'ignore',
  })
  const seeded = new Database(path)
  const staged = seeded
    .prepare('SELECT o.id, o.state, o.vendor_id, p.name FROM orders o JOIN patients p ON p.id = o.patient_id WHERE o.id < 2000 ORDER BY o.id')
    .all() as { id: number; state: string; vendor_id: number; name: string }[]

  afterAll(() => {
    seeded.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('stages all three scenarios at once, on different patients', () => {
    expect(staged).toEqual([
      { id: 1042, state: 'ordered', vendor_id: 2, name: 'Margaret Osei' },
      { id: 1043, state: 'dispatched', vendor_id: 3, name: 'Margaret Osei' },
      { id: 1050, state: 'delivered', vendor_id: 1, name: 'Ruth Nakamura' },
      { id: 1051, state: 'delivered', vendor_id: 1, name: 'Ruth Nakamura' },
      { id: 1060, state: 'ordered', vendor_id: 4, name: 'Frank Delgado' },
    ])
  })

  it('leaves Eleanor Vance unseeded — her silence clock would fire during scenario 1', () => {
    expect(staged.some((o) => o.name === 'Eleanor Vance')).toBe(false)
  })

  it('backdates Margaret’s at-risk order 6h and leaves Frank’s inside the nag grace window', () => {
    const placed = (id: number) =>
      (
        seeded
          .prepare("SELECT created_at FROM order_events WHERE order_id = ? AND type = 'order_placed'")
          .get(id) as { created_at: string }
      ).created_at
    const hoursAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000
    expect(hoursAgo(placed(1042))).toBeCloseTo(6, 1)
    expect(hoursAgo(placed(1060))).toBeCloseTo(0, 1)
  })

  it('sends no nag and raises no escalation at seed time', () => {
    expect(seeded.prepare("SELECT id FROM messages WHERE order_id < 2000 AND template = 'v_ack_nag'").all()).toEqual([])
    expect(seeded.prepare('SELECT id FROM escalations WHERE order_id < 2000').all()).toEqual([])
  })
})

describe('stageSilence', () => {
  beforeEach(() => {
    seedFixtures()
    db.prepare(
      "INSERT INTO patients (id, name, market, caregiver_name, caregiver_phone, contact_ok) VALUES (9, 'Eleanor Vance', 'Salt Lake City', 'Marcy Vance', '801-555-1201', 1)",
    ).run()
    db.prepare("INSERT INTO vendors (id, name) VALUES (9, 'Beehive DME Co')").run()
  })

  it('places the order backdated 5h — row AND the order_placed the ladder anchors to', () => {
    const order = stageSilence()
    const event = db
      .prepare("SELECT created_at FROM order_events WHERE order_id = ? AND type = 'order_placed'")
      .get(order.id) as { created_at: string }
    const hoursAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000

    expect(order.state).toBe('ordered')
    expect(order.patient_id).toBe(9)
    expect(order.vendor_id).toBe(9)
    expect(hoursAgo(order.created_at)).toBeCloseTo(5, 1)
    expect(hoursAgo(event.created_at)).toBeCloseTo(5, 1)
  })

  it('sends the outbound request with a live reply pair', () => {
    const order = stageSilence()
    const message = db
      .prepare("SELECT template, reply_slot, body FROM messages WHERE order_id = ? AND direction = 'out'")
      .get(order.id) as { template: string; reply_slot: number; body: string }

    expect(message.template).toBe('v_order_request')
    expect(message.reply_slot).not.toBeNull()
    expect(message.body).toContain(`#${order.id}`)
  })

  it('refuses a second staging while the order is still open', () => {
    const order = stageSilence()
    expect(() => stageSilence()).toThrowError(/already staged/)
    expect((db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }).c).toBe(1)
    expect(order.id).toBe(1061)
  })

  it('refuses to stage against a world that was never seeded', () => {
    db.exec("DELETE FROM patients WHERE name = 'Eleanor Vance'")
    expect(() => stageSilence()).toThrowError(/run the seed first/)
  })
})
