import { digitOffset } from '../../../shared/slots'
import type { FamilyTemplate, Message, VendorTemplate } from '../../../shared/types'

/**
 * Reading digit replies in the two phone simulators.
 *
 * There used to be tappable buttons here. There aren't now, and shouldn't be: these
 * screens stand in for SMS on a real handset, which has no buttons — a vendor or a family
 * types "7" into the box like any other text. The file keeps its name to avoid churning
 * imports mid-build; what it holds is the read side.
 *
 * A digit under a known question is deterministic — server/sms.ts maps template x position
 * to an action, at confidence 1.0 with no model call. That table is authoritative and the
 * client never decides the action. Bubbles carry no outcome annotations anymore — a real
 * handset shows only the time, and the parse result is the hospice board's story — so the
 * labels below have exactly one client job left: deciding whether a typed body is a digit
 * some open question owns, which picks "sending…" over "reading…" while a send is in flight.
 *
 * Vendor labels are positional because vendor digits rotate: which pair a question owns is
 * what addresses it in a flat SMS thread, so a digit can only be resolved against the
 * question's own slot. Family labels stay literal — one question at a time in a household
 * thread, and f_condition_check's 1-5 is a rating whose digits are the meaning.
 */

const VENDOR_LABELS: Partial<Record<VendorTemplate, readonly [string, string]>> = {
  v_order_request: ['Accept', "Can't fill"],
  v_ack_nag: ['Accept', "Can't fill"],
  v_eta_check: ['On schedule', 'Delayed'],
  v_pickup_request: ['Today', 'Later'],
}

const FAMILY_LABELS: Partial<Record<FamilyTemplate, Record<string, string>>> = {
  f_delivery_confirm: { '1': "Yes, it's here", '2': 'No, not yet' },
  f_condition_check: { '1': 'Unusable', '2': 'Poor', '3': 'Acceptable', '4': 'Good', '5': 'Like new' },
}

/** Just enough of a question to label a reply to it: what it asked, and which pair it owns. */
export interface Answerable {
  template: Message['template']
  reply_slot: number | null
}

export function digitLabel(question: Answerable | null | undefined, digit: string): string | null {
  const template = question?.template
  if (!template) return null
  if (!template.startsWith('v_')) return FAMILY_LABELS[template as FamilyTemplate]?.[digit] ?? null

  const pair = VENDOR_LABELS[template as VendorTemplate]
  if (!pair || question.reply_slot === null) return null
  const offset = digitOffset(question.reply_slot, digit)
  return offset === null ? null : pair[offset]
}

/** An outbound question still waiting on an answer, with digits we know how to render. */
export function isOpenQuestion(m: Message): boolean {
  if (m.direction !== 'out' || !m.template || m.answered_at) return false
  return m.template.startsWith('v_')
    ? m.reply_slot !== null && !!VENDOR_LABELS[m.template as VendorTemplate]
    : !!FAMILY_LABELS[m.template as FamilyTemplate]
}

