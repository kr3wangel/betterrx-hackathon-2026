import type { Message, MessageTemplate, SmsReplyResult } from '../../../shared/types'

/**
 * Reading digit replies in the two phone simulators.
 *
 * There used to be tappable buttons here. There aren't now, and shouldn't be: these
 * screens stand in for SMS on a real handset, which has no buttons — a vendor or a family
 * types "1" into the box like any other text. The file keeps its name to avoid churning
 * imports mid-build; what it holds is the read side.
 *
 * A digit under a known question is deterministic — server/sms.ts REPLY_ROUTES maps
 * template x digit to an action, at confidence 1.0 with no model call. That table is
 * authoritative; the labels below are cosmetic, used to annotate a bubble after the fact
 * ("1 · Today"), and the client never decides the action.
 */

const DIGIT_LABELS: Partial<Record<MessageTemplate, Record<string, string>>> = {
  v_order_request: { '1': 'Accept', '2': "Can't fill" },
  v_ack_nag: { '1': 'Accept', '2': "Can't fill" },
  v_eta_check: { '1': 'On schedule', '2': 'Delayed' },
  v_pickup_request: { '1': 'Today', '2': 'Later' },
  f_delivery_confirm: { '1': "Yes, it's here", '2': 'No, not yet' },
  f_condition_check: { '1': 'Unusable', '2': 'Poor', '3': 'Acceptable', '4': 'Good', '5': 'Like new' },
}

export function digitLabel(template: MessageTemplate | null, digit: string): string | null {
  return (template && DIGIT_LABELS[template]?.[digit]) ?? null
}

/** An outbound question still waiting on an answer, with digits we know how to render. */
export function isOpenQuestion(m: Message): boolean {
  return m.direction === 'out' && !!m.template && !m.answered_at && !!DIGIT_LABELS[m.template]
}

/** The question an inbound bubble answers: the nearest templated outbound above it. */
export function answeredQuestion(thread: Message[], index: number): Message | undefined {
  for (let i = index - 1; i >= 0; i--) {
    const m = thread[i]
    if (m.direction === 'out' && m.template) return m
  }
  return undefined
}

/** Delivery-receipt line, so the consequence of a reply reads as part of the conversation. */
export function ReplyReceipt({ result }: { result: SmsReplyResult }) {
  const digit = result.digit ? `${result.digit}${digitLabel(result.template, result.digit) ? ` · ${digitLabel(result.template, result.digit)}` : ''} — ` : ''

  if (result.outcome === 'applied') {
    return (
      <div className="pt-1 text-right text-[11px] text-green-600">
        {digit}applied{result.digit ? ' · no model needed' : ''}
      </div>
    )
  }
  if (result.outcome === 'prompt') {
    return <div className="pt-1 text-right text-[11px] text-slate-400">{digit}we texted back a question</div>
  }
  return (
    <div className="pt-1 text-right text-[11px] text-amber-600">
      {result.outcome === 'unmapped'
        ? "Couldn't match that to the question — sent to a person rather than guessed"
        : 'Sent to a person rather than guessed'}
    </div>
  )
}
