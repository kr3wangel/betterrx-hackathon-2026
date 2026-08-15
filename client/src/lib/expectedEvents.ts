import type { OrderEventType } from '../../../shared/types'

export type ExpectKey = `order:${number}` | `patient:${number}`

export interface Expectation {
  key: ExpectKey
  /** null = suppress every event type for this key. */
  types: OrderEventType[] | null
  until: number
}

const DEFAULT_MS = 6000

let live: Expectation[] = []

/**
 * Call immediately BEFORE the POST, never after: applyEvent() broadcasts inside the request
 * handler, so the SSE frame and the HTTP response race and the frame usually wins.
 */
export function expectOwn(keys: ExpectKey[], opts?: { types?: OrderEventType[]; ms?: number }): void {
  const until = Date.now() + (opts?.ms ?? DEFAULT_MS)
  const types = opts?.types ?? null
  for (const key of keys) live.push({ key, types, until })
}

/** Live view, pruned of expired entries. Passed into decideNarration() as data. */
export function activeExpectations(now: number): Expectation[] {
  live = live.filter((e) => e.until > now)
  return live.slice()
}
