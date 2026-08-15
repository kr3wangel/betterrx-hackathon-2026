import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useLive } from '../lib/useLive'
import { Bubble, PhoneScreen, ThreadEmpty } from '../components/PhoneScreen'
import { QUICK_REPLIES } from '../../../shared/replies'
import type { Message, Vendor } from '../../../shared/types'

/**
 * The DME dispatcher's phone — a demo prop, not a product surface. Unlisted.
 *
 * This is the sponsor's stated baseline. FAQ §3: "Design for a vendor who may never log
 * into anything and only ever responds via a confirmation email or text (SMS/magic-link
 * style)." So the vendor side of this product IS a text thread, and the demo should show
 * the thread rather than a portal.
 *
 * Two reply paths on one screen, and the difference IS the AI argument:
 *
 *   Tap a quick reply  → POST /api/messages/reply → the template x digit table in
 *                        server/sms.ts. Deterministic. No model, no confidence score,
 *                        nothing to review. At a known lifecycle moment a digit has
 *                        exactly one meaning (SMS-SIM-SPEC §10).
 *   Type prose         → POST /api/messages/inbound → Claude, with a 0.8 confidence gate
 *                        and a human review queue underneath. "bed's on the truck, prob
 *                        3ish" is genuinely ambiguous, so it genuinely needs a model.
 *
 * Same thread, same ledger, two trust levels — we spend the model only where the ambiguity
 * is real. /caregiver is the same principle with the model removed entirely: a 1–5 rating
 * is a digit, so it gets a regex.
 */

const INTENT_TONE: Record<string, string> = {
  accept: 'text-green-600',
  delivered: 'text-green-600',
  picked_up: 'text-green-600',
  out_for_delivery: 'text-blue-600',
  eta_update: 'text-blue-600',
  pickup_scheduled: 'text-blue-600',
  delay: 'text-amber-600',
  decline: 'text-red-600',
  unknown: 'text-slate-400',
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function VendorPhone() {
  const { data: vendors } = useLive(() => api.get<Vendor[]>('/api/vendors'))
  const [vendorId, setVendorId] = useState(1)
  const vendor = vendors?.find((v) => v.id === vendorId)

  if (!vendor) return <div className="flex h-[100dvh] items-center justify-center text-sm text-slate-400">Loading…</div>

  return (
    <Thread
      key={vendor.id}
      vendor={vendor}
      picker={
        <select
          className="max-w-[15rem] truncate rounded-md border-0 bg-transparent text-[11px] text-slate-400 outline-none"
          value={vendorId}
          onChange={(e) => setVendorId(Number(e.target.value))}
        >
          {(vendors ?? []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} · {v.contact_name}
            </option>
          ))}
        </select>
      }
    />
  )
}

function Thread({ vendor, picker }: { vendor: Vendor; picker: React.ReactNode }) {
  const { data: messages } = useLive(() => api.get<Message[]>(`/api/messages?vendor_id=${vendor.id}`))
  const [draft, setDraft] = useState('')
  // Which path is in flight, not just whether one is: a tap never runs a model, so it must
  // not show "reading…". The pending state is the only place that distinction is visible.
  const [pending, setPending] = useState<null | 'parse' | 'tap'>(null)
  const sending = pending !== null

  const thread = useMemo(() => messages ?? [], [messages])

  // Quick replies attach to the most recent question only. An older unanswered one staying
  // tappable would let a vendor answer a question the thread has already moved past.
  const openQuestion = useMemo(() => {
    const last = [...thread].reverse().find((m) => m.direction === 'out' && m.template)
    if (!last?.template || last.answered_at) return null
    const replies = QUICK_REPLIES[last.template]
    return replies ? { id: last.id, replies } : null
  }, [thread])

  async function send() {
    if (!draft.trim() || sending) return
    setPending('parse')
    try {
      await api.post('/api/messages/inbound', { vendor_id: vendor.id, body: draft.trim() })
      setDraft('')
    } finally {
      setPending(null)
    }
  }

  /** A tap is deterministic — it resolves through the server's route table, never a model. */
  async function tapReply(digit: string) {
    if (!openQuestion || sending) return
    setPending('tap')
    try {
      await api.post('/api/messages/reply', { reply_to_message_id: openQuestion.id, digit })
    } finally {
      setPending(null)
    }
  }

  return (
    <PhoneScreen
      title={vendor.contact_name || vendor.name}
      subtitle={`${vendor.name} · ${vendor.phone}`}
      picker={picker}
      scrollKey={`${thread.length}:${sending}`}
      draft={draft}
      onDraft={setDraft}
      onSend={send}
      sending={sending}
    >
      {thread.length === 0 && (
        <ThreadEmpty>No messages yet. Place an order on the hospice board and the request lands here.</ThreadEmpty>
      )}

      {thread.map((m) => {
        // 'out' is hospice → vendor, so on the vendor's own phone it reads as received.
        const mine = m.direction === 'in'
        return (
          <Bubble
            key={m.id}
            side={mine ? 'sent' : 'received'}
            meta={
              <>
                {time(m.created_at)}
                {mine && m.parsed && (
                  <>
                    {' · '}
                    <span className={INTENT_TONE[m.parsed.intent] ?? 'text-slate-400'}>
                      read as {m.parsed.intent.replace(/_/g, ' ')}
                    </span>
                    {' · '}
                    {Math.round((m.parsed.confidence ?? 0) * 100)}%
                    {m.review_status === 'needs_review' && <span className="text-amber-600"> · sent to a person</span>}
                    {m.review_status === 'auto_applied' && <span className="text-green-600"> · applied</span>}
                  </>
                )}
                {mine && !m.parsed && <span className="text-amber-600"> · awaiting review</span>}
              </>
            }
          >
            {m.body}
          </Bubble>
        )
      })}

      {openQuestion && !sending && (
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {openQuestion.replies.map((r) => (
            <button
              key={r.digit}
              type="button"
              onClick={() => tapReply(r.digit)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 shadow-sm active:bg-slate-100"
            >
              <span className="tabular-nums text-slate-400">{r.digit}</span> · {r.label}
            </button>
          ))}
        </div>
      )}

      {pending && (
        <Bubble side="sent">
          <span className="opacity-70">{pending === 'parse' ? 'reading…' : 'sending…'}</span>
        </Bubble>
      )}
    </PhoneScreen>
  )
}
