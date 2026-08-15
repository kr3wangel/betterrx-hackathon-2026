import { db } from './db'
import { rowToMessage } from './store'
import { SLOT_BASES, slotDigits, digitOffset } from '../shared/slots'
import type { Message } from '../shared/types'

export { SLOT_BASES, SLOT_DEPTH, slotDigits, digitOffset, type SlotDigits } from '../shared/slots'

/**
 * Rotating reply codes for the vendor SMS thread.
 *
 * SMS is one flat thread per phone number with no reply-to. Send a dispatcher three
 * questions in a row and "1" is unattributable — worse, the two older questions are
 * buried and never get answered at all, while the watchdog keeps nagging and pushing
 * them further up the screen.
 *
 * So the digits carry the addressing. Each open question owns a pair, and every message
 * states its own pair ("reply 5 to accept, 6 if you can't"), which means the vendor never
 * has to remember a mapping — they scroll to the buried text and it tells them what to
 * press. Five pairs deep, which is five questions a vendor can answer in any order, days
 * apart.
 *
 * Odd is always yes, even is always no. Rotating the digits freely would have cost the
 * habit a vendor builds over months; rotating the *pair* keeps "the first number is yes"
 * true forever while still making the digit an address.
 *
 * The pair is also what makes the deterministic path real over an actual gateway. A bare
 * "7" arrives as plain text with nothing but a sender, and ownership is enough to route
 * it — no reply-to header, no model.
 */

/**
 * The questions currently outstanding with a vendor, newest first — one per pair.
 *
 * Deduplicated by slot rather than returned raw, because a follow-up reuses its order's
 * pair: an unanswered request and the nag chasing it are two rows and one question. Count
 * the rows instead and a vendor with two open orders gets told they have three, and the
 * clarify text names the same order twice.
 *
 * A row only owns digits while it is unanswered, which is what makes recycling a pair safe.
 */
export function liveQuestions(vendorId: number): Message[] {
  const rows = db
    .prepare(
      `SELECT * FROM messages
         WHERE vendor_id = ? AND recipient_type = 'vendor' AND direction = 'out'
           AND reply_slot IS NOT NULL AND answered_at IS NULL
         ORDER BY id DESC`,
    )
    .all(vendorId) as never[]
  const newestPerSlot = new Map<number, Message>()
  for (const message of rows.map(rowToMessage)) {
    if (!newestPerSlot.has(message.reply_slot!)) newestPerSlot.set(message.reply_slot!, message)
  }
  return [...newestPerSlot.values()]
}

/**
 * The pair this question should use, or null when all five are spoken for.
 *
 * A follow-up about an order we have already asked about reuses that order's pair rather
 * than spending a new one. Without this, watchdog.ts firing v_ack_nag at an unanswered
 * v_order_request would put two live pairs on the same order — two different digits that
 * both mean "accept #1042" — and burn 40% of the vendor's reply space on one question.
 */
export function allocateSlot(vendorId: number, orderId: number | null): number | null {
  const live = liveQuestions(vendorId)
  if (orderId !== null) {
    const existing = live.find((q) => q.order_id === orderId)
    if (existing) return existing.reply_slot
  }
  const taken = new Set(live.map((q) => q.reply_slot))
  return SLOT_BASES.find((base) => !taken.has(base)) ?? null
}

/** Which open question a bare digit answers. Newest wins, so a reused pair resolves to the nag. */
export function resolveDigit(vendorId: number, digit: string): { question: Message; offset: 0 | 1 } | null {
  for (const question of liveQuestions(vendorId)) {
    const offset = digitOffset(question.reply_slot!, digit)
    if (offset !== null) return { question, offset }
  }
  return null
}

/**
 * The newest ANSWERED question whose pair owned this digit — resolveDigit's fallback for
 * the receipt copy only, never for routing. A vendor who repeats a digit right after it
 * applied should hear "order #X was already updated", not "nothing matches": the pair
 * retired the moment their first reply landed, but their mental model hasn't.
 */
export function lastAnsweredOwner(vendorId: number, digit: string): Message | null {
  const rows = db
    .prepare(
      `SELECT * FROM messages
         WHERE vendor_id = ? AND recipient_type = 'vendor' AND direction = 'out'
           AND reply_slot IS NOT NULL AND answered_at IS NOT NULL
         ORDER BY id DESC`,
    )
    .all(vendorId) as never[]
  for (const question of rows.map(rowToMessage)) {
    if (digitOffset(question.reply_slot!, digit) !== null) return question
  }
  return null
}

/**
 * Retire a pair. Every unanswered question sharing it is closed, not just the one that was
 * replied to: a nag and its original request are the same ask, and leaving the request
 * open would keep the pair allocated forever.
 */
export function closeSlot(vendorId: number, slot: number, at = new Date().toISOString()): void {
  db.prepare(
    `UPDATE messages SET answered_at = ?
       WHERE vendor_id = ? AND recipient_type = 'vendor' AND direction = 'out'
         AND reply_slot = ? AND answered_at IS NULL`,
  ).run(at, vendorId, slot)
}
