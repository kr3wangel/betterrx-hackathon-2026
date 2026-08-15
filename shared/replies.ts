import type { MessageTemplate } from './types'

/**
 * Tappable quick replies for the vendor's phone.
 *
 * Why this exists: `SMS-SIM-SPEC.md` §10's argument is that **at a known lifecycle moment a
 * digit has exactly one meaning, so no model needs to read it.** A tap resolves through the
 * server's `REPLY_ROUTES` table with no parse, no confidence score and no review queue —
 * the same determinism the caregiver's 1–5 reply already gets.
 *
 * `digit` MUST exist in `server/sms.ts` `REPLY_ROUTES` for the same template. A button
 * offering a digit the server can't route returns `outcome: 'unmapped'` and silently lands
 * in the human review queue, which on stage looks like the product is broken. `sms.test.ts`
 * asserts the two tables agree, so add a button and the suite tells you if the route is missing.
 *
 * `label` MUST match the wording of the outbound text in `server/messaging.ts` — the message
 * says "Reply 1 to accept, 2 if you can't fill it", so the buttons say exactly that.
 *
 * Vendor templates only. The caregiver thread has its own deterministic path in `condition.ts`.
 */
export interface QuickReply {
  digit: string
  label: string
}

export const QUICK_REPLIES: Partial<Record<MessageTemplate, QuickReply[]>> = {
  v_order_request: [
    { digit: '1', label: 'Accept' },
    { digit: '2', label: "Can't fill it" },
  ],
  v_ack_nag: [
    { digit: '1', label: 'Accept' },
    { digit: '2', label: "Can't fill it" },
  ],
  v_eta_check: [
    { digit: '1', label: "I'm on schedule" },
    { digit: '2', label: "It'll be late" },
  ],
  v_pickup_request: [
    { digit: '1', label: 'Can get it today' },
    { digit: '2', label: 'Give a window' },
  ],
}
