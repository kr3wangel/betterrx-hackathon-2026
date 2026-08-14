import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useLive } from '../lib/useLive'
import { Bubble, PhoneScreen, ThreadEmpty } from '../components/PhoneScreen'
import type { CaregiverReplyResult, ConditionReport, Order, OrderEvent, Patient } from '../../../shared/types'

/**
 * The family caregiver's phone — a demo prop, not a product surface. Unlisted.
 *
 * There is no SMS gateway; this is the stand-in. Open it on a real handset over the venue
 * LAN and it needs no explaining: the driver captures proof of delivery, the check sends
 * itself, the household taps a number, and the hospice board lights up over SSE.
 *
 * Parsing is deterministic — see server/condition.ts. That is the deliberate contrast with
 * /vendor-phone, where a dispatcher's prose gets a model.
 */

const SCALE: Record<number, string> = {
  1: 'Unusable',
  2: 'Poor',
  3: 'Acceptable',
  4: 'Good',
  5: 'Like new',
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

interface OrderDetail {
  order: Order
  events: OrderEvent[]
}

type Msg =
  | { side: 'received'; at: string; body: string }
  | { side: 'sent'; at: string; score: number; comment: string | null }

export default function Caregiver() {
  const { data: orders } = useLive(() => api.get<Order[]>('/api/orders'))
  const { data: patients } = useLive(() => api.get<Patient[]>('/api/patients'))
  const [orderId, setOrderId] = useState<number | null>(null)

  // Only households that could decently be asked: delivered, and the patient still living.
  const askable = useMemo(() => {
    const byId = new Map((patients ?? []).map((p) => [p.id, p]))
    return (orders ?? [])
      .filter((o) => o.state === 'delivered')
      .map((o) => ({ order: o, patient: byId.get(o.patient_id) }))
      .filter((x) => x.patient && x.patient.status !== 'deceased')
      .sort((a, b) => b.order.id - a.order.id)
      // A year of seeded history means ~150 delivered orders. Nobody scrolls that on stage.
      .slice(0, 15)
  }, [orders, patients])

  useEffect(() => {
    if (orderId === null && askable.length) setOrderId(askable[0].order.id)
  }, [askable, orderId])

  const selected = askable.find((x) => x.order.id === orderId)

  if (!selected?.patient) {
    return (
      <div className="flex h-[100dvh] items-center justify-center px-6 text-center text-sm text-slate-400">
        No delivered orders to ask about. Capture a proof of delivery on <b className="mx-1">/driver</b> and the check
        sends itself.
      </div>
    )
  }

  return (
    <Thread
      key={selected.order.id}
      orderId={selected.order.id}
      patient={selected.patient}
      picker={
        <select
          className="max-w-[13rem] truncate rounded-md border-0 bg-transparent text-[11px] text-slate-400 outline-none"
          value={orderId ?? ''}
          onChange={(e) => setOrderId(Number(e.target.value))}
        >
          {askable.map(({ order, patient }) => (
            <option key={order.id} value={order.id}>
              #{order.id} · {order.equipment_name} · {patient?.name}
            </option>
          ))}
        </select>
      }
    />
  )
}

function Thread({ orderId, patient, picker }: { orderId: number; patient: Patient; picker: React.ReactNode }) {
  const { data: detail, reload: reloadDetail } = useLive(() => api.get<OrderDetail>(`/api/orders/${orderId}`))
  const { data: reports, reload: reloadReports } = useLive(() =>
    api.get<ConditionReport[]>(`/api/orders/${orderId}/condition`),
  )
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<CaregiverReplyResult | null>(null)

  const check = (detail?.events ?? []).find(
    (e) => e.type === 'family_notified' && (e.payload as { kind?: string } | null)?.kind === 'condition_check',
  )
  const checkBody = (check?.payload as { body?: string } | null)?.body

  const thread: Msg[] = useMemo(() => {
    const out: Msg[] = []
    if (check && checkBody) out.push({ side: 'received', at: check.created_at, body: checkBody })
    for (const r of reports ?? []) out.push({ side: 'sent', at: r.created_at, score: r.score, comment: r.comment })
    return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  }, [check, checkBody, reports])

  async function send() {
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      setResult(await api.post<CaregiverReplyResult>(`/api/orders/${orderId}/condition-reply`, { body: draft.trim() }))
      setDraft('')
      reloadDetail()
      reloadReports()
    } finally {
      setSending(false)
    }
  }

  return (
    <PhoneScreen
      title={patient.caregiver_name || 'Caregiver'}
      subtitle={`${patient.caregiver_phone || '—'} · caring for ${patient.name}`}
      picker={picker}
      scrollKey={`${thread.length}:${result?.score}:${result?.needs_review}`}
      draft={draft}
      onDraft={setDraft}
      onSend={send}
      sending={sending}
    >
      {thread.length === 0 && (
        <ThreadEmpty>
          No messages yet.
          {!checkBody && (
            <button
              onClick={async () => {
                await api.post(`/api/orders/${orderId}/condition-check`, {})
                reloadDetail()
              }}
              className="mt-3 block w-full rounded-full border border-slate-300 py-1.5 text-slate-600 hover:bg-slate-50"
            >
              Send the condition check
            </button>
          )}
        </ThreadEmpty>
      )}

      {thread.map((m, i) => (
        <Bubble
          key={`${m.side}-${m.at}-${i}`}
          side={m.side}
          meta={
            <>
              {time(m.at)}
              {m.side === 'sent' && ` · ${SCALE[m.score]}`}
            </>
          }
        >
          {m.side === 'received' ? (
            m.body
          ) : (
            <>
              <span className="text-lg font-semibold">{m.score}</span>
              {m.comment ? ` — ${m.comment}` : ''}
            </>
          )}
        </Bubble>
      ))}

      {/* Delivery-receipt style status, so the consequence reads as part of the conversation. */}
      {result && (
        <div className="pt-1 text-right text-[11px]">
          {result.needs_review ? (
            <span className="text-amber-600">Couldn't read a rating — sent to a person rather than guessed</span>
          ) : result.escalated ? (
            <span className="text-red-600">Flagged to the hospice · vendor scorecard updated</span>
          ) : (
            <span className="text-slate-400">Recorded · vendor scorecard updated</span>
          )}
        </div>
      )}
    </PhoneScreen>
  )
}
