import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useLive } from '../lib/useLive'
import { Bubble, Linkify, PhoneScreen, ThreadEmpty } from '../components/PhoneScreen'
import { digitLabel, isOpenQuestion } from '../components/QuickReplies'
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
 * There are no reply buttons here, and there shouldn't be: this stands in for SMS on a
 * real handset, which has none. Everything is typed into the one box. What splits the two
 * paths is the *content* — a bare digit against an open question resolves through the
 * template routing table for no model call, anything else goes to the parse gate — and
 * the split is decided by the server (handleReply), never by this screen.
 */

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
  // vendor_id filtering excludes recipient_type = 'family' server-side, so household
  // texts can never surface in a vendor's thread.
  const { data: messages } = useLive(() => api.get<Message[]>(`/api/messages?vendor_id=${vendor.id}`))
  const [draft, setDraft] = useState('')
  // Which path is in flight, not just whether one is: a digit never reaches a model, so it
  // must not say "reading…". This is the only place that distinction is visible live.
  const [pending, setPending] = useState<null | 'digit' | 'prose'>(null)
  const sending = pending !== null

  const thread = useMemo(() => messages ?? [], [messages])

  // There are no reply buttons, because SMS has none — a vendor on a real handset types
  // "7" into the box like any other text. Whether that reaches a model is decided by
  // whether some open question owns the digit, which is the same question the server asks.
  const ownsDigit = (body: string) => thread.some((m) => isOpenQuestion(m) && digitLabel(m, body))

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setPending(ownsDigit(body) ? 'digit' : 'prose')
    try {
      // Exactly what a gateway webhook posts: a sender and a body, no reply-to. The server
      // resolves an owned digit through the routing table with no model, and everything
      // else through the parse gate — this screen carries no routing knowledge at all.
      // The outcome renders as the bubble's own receipt line once the SSE refetch lands;
      // a real phone shows nothing extra under a sent text, so neither do we.
      await api.post<SmsReplyResult>('/api/messages/inbound', { vendor_id: vendor.id, body })
      setDraft('')
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

      {/* Meta is the timestamp and nothing else. A real handset shows no parse outcome
          under a sent text — the vendor's phone has never heard of our review queue.
          What happened to a reply is the hospice board's story: the state pill flips
          when a parse auto-applies, and the review queue holds what didn't. */}
      {thread.map((m) => {
        // 'out' is hospice → vendor, so on the vendor's own phone it reads as received.
        const mine = m.direction === 'in'
        return (
          <Bubble key={m.id} side={mine ? 'sent' : 'received'} meta={time(m.created_at)}>
            <Linkify text={m.body} />
          </Bubble>
        )
      })}

      {sending && (
        <Bubble side="sent">
          <span className="opacity-70">{pending === 'prose' ? 'reading…' : 'sending…'}</span>
        </Bubble>
      )}
    </PhoneScreen>
  )
}
