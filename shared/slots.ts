/**
 * The digit arithmetic behind rotating reply codes, shared because both sides need it.
 *
 * The server allocates and routes (server/slots.ts); the phone simulator only labels a
 * bubble after the fact. Duplicating the pairing rule in the client would be a second
 * RISK_THRESHOLD — two copies that drift, and the drift shows up as a reply annotated with
 * the wrong meaning. The stateful half stays on the server; only the maths lives here.
 */

/** Odd is always yes, even is always no. See server/slots.ts for why the pair rotates. */
export const SLOT_BASES = [1, 3, 5, 7, 9] as const

export const SLOT_DEPTH = SLOT_BASES.length

export type SlotDigits = readonly [yes: string, no: string]

/** 9 pairs with 0, not with 10 — a keypad has ten keys and "10" is two keystrokes. */
export function slotDigits(base: number): SlotDigits {
  return [String(base), String(base === 9 ? 0 : base + 1)]
}

export function digitOffset(base: number, digit: string): 0 | 1 | null {
  const [yes, no] = slotDigits(base)
  if (digit === yes) return 0
  if (digit === no) return 1
  return null
}
