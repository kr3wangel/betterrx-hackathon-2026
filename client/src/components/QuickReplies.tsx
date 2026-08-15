import { useState } from 'react'
import { api } from '../lib/api'
import type { Message, MessageTemplate, SmsReplyResult } from '../../../shared/types'

/**
 * Tappable digit replies for the two phone simulators.
 *
 * A digit under a known question is deterministic — server/sms.ts REPLY_ROUTES maps
 * template x digit to an action, at confidence 1.0 with no model call. That table is
 * authoritative; the labels below are cosmetic and the client never decides the action.
 * It only says which bubble is being answered (`reply_to_message_id`), and the server
 * derives vendor, patient, order and template from that row.
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

export function QuickReplies({
  message,
  onResult,
}: {
  message: Message
  onResult?: (result: SmsReplyResult) => void
}) {
  const [busy, setBusy] = useState(false)
  const options = message.template ? Object.entries(DIGIT_LABELS[message.template] ?? {}) : []
  if (!options.length) return null

  return (
    <div className="flex flex-wrap justify-end gap-1.5 pt-1.5">
      {options.map(([digit, label]) => (
        <button
          key={digit}
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              onResult?.(
                await api.post<SmsReplyResult>('/api/messages/reply', {
                  reply_to_message_id: message.id,
                  digit,
                }),
              )
            } finally {
              setBusy(false)
            }
          }}
          className="rounded-full border border-blue-600 px-3 py-1.5 text-[12px] font-medium text-blue-700 active:bg-blue-50 disabled:opacity-40"
        >
          <span className="font-semibold tabular-nums">{digit}</span> · {label}
        </button>
      ))}
    </div>
  )
}

/** Delivery-receipt line, so the consequence of a tap reads as part of the conversation. */
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
