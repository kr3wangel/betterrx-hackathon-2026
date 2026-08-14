import { describe, expect, it } from 'vitest'
import { defaultTargetAt, resolveTargetAt } from '../server/sla'

const NOW = new Date('2026-08-14T12:00:00Z')

describe('defaultTargetAt', () => {
  it('gives stat orders a same-day window', () => {
    expect(defaultTargetAt('stat', NOW)).toBe('2026-08-14T20:00:00.000Z')
  })

  it('gives urgent orders the same same-day window as stat', () => {
    expect(defaultTargetAt('urgent', NOW)).toBe(defaultTargetAt('stat', NOW))
  })

  it('gives routine orders a 24-hour window', () => {
    expect(defaultTargetAt('routine', NOW)).toBe('2026-08-15T12:00:00.000Z')
  })
})

describe('resolveTargetAt', () => {
  it('keeps an explicitly provided deadline', () => {
    expect(resolveTargetAt('2026-08-20T09:30:00.000Z', 'stat', NOW)).toBe('2026-08-20T09:30:00.000Z')
  })

  it('derives a deadline when none is provided', () => {
    expect(resolveTargetAt(null, 'routine', NOW)).toBe('2026-08-15T12:00:00.000Z')
    expect(resolveTargetAt(undefined, 'stat', NOW)).toBe('2026-08-14T20:00:00.000Z')
    expect(resolveTargetAt('', 'urgent', NOW)).toBe('2026-08-14T20:00:00.000Z')
  })
})
