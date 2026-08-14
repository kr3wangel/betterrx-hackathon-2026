import { describe, expect, it } from 'vitest'
import { CONDITION_ALERT_AT, CONDITION_SCALE, conditionCheckText, parseConditionReply } from '../server/condition'
import type { Order } from '../shared/types'

describe('parseConditionReply', () => {
  it('reads a bare digit', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(parseConditionReply(String(n))).toBe(n)
  })

  it('reads a digit with commentary, which is how people actually text', () => {
    expect(parseConditionReply('2 - one of the wheels sticks')).toBe(2)
    expect(parseConditionReply("I'd say a 4")).toBe(4)
    expect(parseConditionReply('5!! thank you')).toBe(5)
    expect(parseConditionReply('  3  ')).toBe(3)
  })

  it('reads spelled-out numbers', () => {
    expect(parseConditionReply('three')).toBe(3)
    expect(parseConditionReply('Five, looks brand new')).toBe(5)
  })

  it('reads "out of five" phrasing without mistaking the scale for the score', () => {
    expect(parseConditionReply('4/5')).toBe(4)
    expect(parseConditionReply('2 out of 5')).toBe(2)
  })

  it('returns null rather than guessing when the reply is ambiguous', () => {
    expect(parseConditionReply('3 or 4')).toBeNull()
    expect(parseConditionReply('between 2 and 3')).toBeNull()
  })

  it('returns null when there is no rating at all', () => {
    expect(parseConditionReply('')).toBeNull()
    expect(parseConditionReply('   ')).toBeNull()
    expect(parseConditionReply('thanks so much')).toBeNull()
    expect(parseConditionReply('who is this?')).toBeNull()
  })

  it('does not mistake the English word "one" in a sentence for a rating', () => {
    expect(parseConditionReply('one of the wheels sticks badly')).toBeNull()
    expect(parseConditionReply('two of the side rails are loose here')).toBeNull()
  })

  it('rejects out-of-range numbers instead of clamping them', () => {
    expect(parseConditionReply('10')).toBeNull()
    expect(parseConditionReply('0')).toBeNull()
    expect(parseConditionReply('7')).toBeNull()
  })

  it('does not read a digit out of the middle of a longer number', () => {
    // "801-555-0101" must not parse as a 1.
    expect(parseConditionReply('801-555-0101')).toBeNull()
  })
})

describe('condition scale', () => {
  it('alerts on the bottom two rungs only', () => {
    expect(CONDITION_ALERT_AT).toBe(2)
    expect(CONDITION_SCALE[1]).toBe('Unusable')
    expect(CONDITION_SCALE[5]).toBe('Like new')
  })
})

describe('conditionCheckText', () => {
  const order = {
    id: 42,
    equipment_name: 'Hospital bed, semi-electric',
  } as Order

  it('asks about the equipment and never about the care', () => {
    const body = conditionCheckText(order, 'Marcy')
    expect(body).toContain('Marcy')
    expect(body).toContain('hospital bed, semi-electric')
    expect(body.toLowerCase()).toContain('clean and working')
    expect(body).toContain('1-5')
    expect(body).toContain('STOP')
    // Nothing that reads as a care-satisfaction survey.
    expect(body.toLowerCase()).not.toContain('satisf')
    expect(body.toLowerCase()).not.toContain('your care')
  })

  it('works without a caregiver name on file', () => {
    expect(conditionCheckText(order, '')).toContain('your hospice team')
  })
})
