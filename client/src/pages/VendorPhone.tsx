import { Fragment, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useLive } from '../lib/useLive'
import { Bubble, Linkify, PhoneScreen, ThreadEmpty } from '../components/PhoneScreen'
import { QuickReplies, ReplyReceipt, answeredQuestion, digitLabel, isOpenQuestion } from '../components/QuickReplies'
import type { Message, SmsReplyResult, Vendor } from '../../../shared/types'

/**
 * The DME dispatcher's phone — a demo prop, not a product surface. Unlisted.
 *
 * This is the sponsor's stated baseline. FAQ §3: "Design for a vendor who may never log
 * into anything and only ever responds via a confirmation email or text (SMS/magic-link
 * style)." So the vendor side of this product IS a text thread, and the demo should show
 * the thread rather than a portal.
 *
 * The contrast with /caregiver is the whole AI argument. A dispatcher types prose —
 * "bed's on the truck, prob 3ish" — so that gets a model, with a confidence gate and a
 * human review queue underneath. A caregiver types a digit, so that gets a regex.
 *
 * Two doors to the same room: free text goes to POST /api/messages/inbound and the parse
 * gate; a tapped digit goes to POST /api/messages/reply and the template routing table,
 * where it costs no model call at all.
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

/** What happened to a reply the vendor sent: a tapped digit, parsed prose, or neither. */
function replyMeta(m: Message, label: string | null) {
  if (label) {
    return (
      <>
        {' · '}
        <span className="text-slate-500">{label}</span>
        {m.review_status === 'auto_applied' && <span className="text-green-600"> · applied · no model needed</span>}
        {m.review_status === 'needs_review' && <span className="text-amber-600"> · sent to a person</span>}
      </>
    )
  }
  if (m.parsed) {
    return (
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
    )
  }
  return m.review_status === 'auto_applied' ? (
    <span className="text-green-600"> · applied</span>
  ) : (
    <span className="text-amber-600"> · awaiting review</span>
  )
}

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
  // vendor_id filtering excludes recipient_type = 'family' server-side, so household
  // texts can never surface in a vendor's thread.
  const { data: messages } = useLive(() => api.get<Message[]>(`/api/messages?vendor_id=${vendor.id}`))
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [reply, setReply] = useState<SmsReplyResult | null>(null)

  const thread = useMemo(() => messages ?? [], [messages])

  async function send() {
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      await api.post('/api/messages/inbound', { vendor_id: vendor.id, body: draft.trim() })
      setDraft('')
      setReply(null)
    } finally {
      setSending(false)
    }
  }

  return (
    <PhoneScreen
      title={vendor.contact_name || vendor.name}
      subtitle={`${vendor.name} · ${vendor.phone}`}
      picker={picker}
      scrollKey={`${thread.length}:${sending}:${reply?.message_id ?? ''}`}
      draft={draft}
      onDraft={setDraft}
      onSend={send}
      sending={sending}
    >
      {thread.length === 0 && (
        <ThreadEmpty>No messages yet. Place an order on the hospice board and the request lands here.</ThreadEmpty>
      )}

      {thread.map((m, i) => {
        // 'out' is hospice → vendor, so on the vendor's own phone it reads as received.
        const mine = m.direction === 'in'
        const digit = mine && /^[1-9]$/.test(m.body.trim()) ? m.body.trim() : null
        const label = digit ? digitLabel(answeredQuestion(thread, i)?.template ?? null, digit) : null
        return (
          <Fragment key={m.id}>
            <Bubble
              side={mine ? 'sent' : 'received'}
              meta={
                <>
                  {time(m.created_at)}
                  {mine && replyMeta(m, label)}
                </>
              }
            >
              <Linkify text={m.body} />
            </Bubble>
            {isOpenQuestion(m) && <QuickReplies message={m} onResult={setReply} />}
            {mine && reply?.message_id === m.id && <ReplyReceipt result={reply} />}
          </Fragment>
        )
      })}

      {/* Until the SSE refetch brings the new row in, the receipt is the only feedback. */}
      {reply && !thread.some((m) => m.id === reply.message_id) && <ReplyReceipt result={reply} />}

      {sending && (
        <Bubble side="sent">
          <span className="opacity-70">reading…</span>
        </Bubble>
      )}
    </PhoneScreen>
  )
}
