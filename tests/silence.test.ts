import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../server/db'
import { ackNagText } from '../server/messaging'
import { applyEvent } from '../server/statemachine'
import { getOrder } from '../server/store'
import { tick } from '../server/watchdog'
import { seedFixtures, seedOrder } from './helpers'

beforeEach(() => {
  seedFixtures()
  delete process.env.ANTHROPIC_API_KEY
})

const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString()

function outbound(orderId: number) {
  return db
    .prepare("SELECT * FROM messages WHERE order_id = ? AND direction = 'out' ORDER BY id")
    .all(orderId) as { body: string; vendor_id: number; created_at: string }[]
}

function openEscalations(orderId: number) {
  return db
    .prepare("SELECT * FROM escalations WHERE order_id = ? AND status = 'open'")
    .all(orderId) as { reason: string }[]
}

describe('ackNagText', () => {
  it('names the order and equipment and carries the magic link', () => {
    const id = seedOrder()
    const text = ackNagText(getOrder(id)!)
    expect(text).toContain(`#${id}`)
    expect(text).toContain('Hospital bed')
    expect(text).toContain('/portal/')
    expect(text).toMatch(/accept or decline/i)
    expect(text).not.toContain('Test Patient')
  })
})

describe('silence ladder: nag', () => {
  it('nags the vendor once ACK_NAG_HOURS have passed without acknowledgment', () => {
    const id = seedOrder({ created_at: hoursAgo(3) })
    tick(new Date())
    const msgs = outbound(id)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].vendor_id).toBe(1)
    expect(msgs[0].body).toBe(ackNagText(getOrder(id)!))
  })

  it('does not re-send the nag on subsequent ticks', () => {
    const id = seedOrder({ created_at: hoursAgo(3) })
    tick(new Date())
    tick(new Date())
    tick(new Date(Date.now() + 60_000))
    expect(outbound(id)).toHaveLength(1)
  })

  it('does not nag before the threshold', () => {
    const id = seedOrder({ created_at: hoursAgo(1) })
    tick(new Date())
    expect(outbound(id)).toHaveLength(0)
  })

  it('does not nag an accepted order', () => {
    const id = seedOrder({ state: 'dispatched', created_at: hoursAgo(6) })
    tick(new Date())
    expect(outbound(id)).toHaveLength(0)
    expect(openEscalations(id)).toHaveLength(0)
  })
})

describe('silence ladder: escalation', () => {
  it('escalates after the nag goes unanswered past ACK_ESCALATE_HOURS', () => {
    const id = seedOrder({ created_at: hoursAgo(6) })
    tick(new Date())
    db.prepare('UPDATE messages SET created_at = ? WHERE order_id = ?').run(hoursAgo(3), id)
    tick(new Date())
    tick(new Date())
    expect(outbound(id)).toHaveLength(1)
    const escalations = openEscalations(id)
    expect(escalations).toHaveLength(1)
    expect(escalations[0].reason).toBe(
      `No response to the automated check-in — order #${id} is still unconfirmed 6h after placement`,
    )
  })

  it('does not escalate before the nag has aged past the window', () => {
    const id = seedOrder({ created_at: hoursAgo(3) })
    tick(new Date())
    tick(new Date())
    expect(openEscalations(id)).toHaveLength(0)
  })

  it('does not escalate when a vendor reply moves the order out of ordered', () => {
    const id = seedOrder({ created_at: hoursAgo(3) })
    tick(new Date())
    applyEvent(id, 'vendor_accepted', null, 'vendor')
    db.prepare("UPDATE messages SET created_at = ? WHERE order_id = ? AND direction = 'out'").run(hoursAgo(3), id)
    tick(new Date())
    expect(openEscalations(id)).toHaveLength(0)
    expect(getOrder(id)!.state).toBe('dispatched')
  })
})
