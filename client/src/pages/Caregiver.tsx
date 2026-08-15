import { Fragment, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useLive } from '../lib/useLive'
import { Bubble, DayDivider, Linkify, newDay, PhoneScreen, ThreadEmpty } from '../components/PhoneScreen'
import { isOpenQuestion } from '../components/QuickReplies'
import type {
  CaregiverReplyResult,
  ConditionReport,
  Message,
  Order,
  Patient,
  SmsReplyResult,
} from '../../../shared/types'

/**
 * The family caregiver's phone — a demo prop, not a product surface. Unlisted.
 *
 * There is no SMS gateway; this is the stand-in. Open it on a real handset over the venue
 * LAN and it needs no explaining: the driver captures proof of delivery, the check sends
 * itself, the household taps a number, and the hospice board lights up over SSE.
 *
 * One thread per household, keyed by patient (SMS-SIM-SPEC §10.1) — the delivery confirm,
 * its chained condition check, and the pickup notices are all the same conversation with
 * the same phone. Digits route through POST /api/messages/reply; the template on the
 * question is what gives a "1" its meaning, so no model reads this thread at all.
 */


const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

interface Household {
  patient: Patient
  rows: Message[]
  /** A delivered order whose household could decently be asked, for the manual check. */
  askableOrderId: number | null
}

export default function Caregiver() {
  const { data: messages } = useLive(() => api.get<Message[]>('/api/messages'))
  const { data: orders } = useLive(() => api.get<Order[]>('/api/orders'))
  const { data: patients } = useLive(() => api.get<Patient[]>('/api/patients'))
  const [patientId, setPatientId] = useState<number | null>(null)

  const households = useMemo<Household[]>(() => {
    const family = (messages ?? []).filter((m) => m.recipient_type === 'family')
    const out: Household[] = []
    for (const patient of patients ?? []) {
      const rows = family.filter((m) => m.patient_id === patient.id).sort((a, b) => a.id - b.id)
      const askable =
        patient.status === 'deceased'
          ? null
          : ((orders ?? []).filter((o) => o.patient_id === patient.id && o.state === 'delivered').sort((a, b) => b.id - a.id)[0]
              ?.id ?? null)
      if (rows.length || askable) out.push({ patient, rows, askableOrderId: askable })
    }
    // Live conversations first; a year of seeded history means nobody scrolls the rest.
    return out
      .sort((a, b) => (b.rows.at(-1)?.id ?? 0) - (a.rows.at(-1)?.id ?? 0) || (b.askableOrderId ?? 0) - (a.askableOrderId ?? 0))
      .slice(0, 15)
  }, [messages, orders, patients])

  useEffect(() => {
    if (patientId === null && households.length) setPatientId(households[0].patient.id)
  }, [households, patientId])

  const selected = households.find((h) => h.patient.id === patientId)

  if (!selected) {
    return (
      <div className="flex h-[100dvh] items-center justify-center px-6 text-center text-sm text-slate-400">
        No household threads yet. Capture a proof of delivery on <b className="mx-1">/driver</b> and the check sends
        itself.
      </div>
    )
  }

  return (
    <Thread
      key={selected.patient.id}
      household={selected}
      picker={
        <select
          className="max-w-[13rem] truncate rounded-md border-0 bg-transparent text-[11px] text-slate-400 outline-none"
          value={patientId ?? ''}
          onChange={(e) => setPatientId(Number(e.target.value))}
        >
          {households.map(({ patient, rows }) => (
            <option key={patient.id} value={patient.id}>
              {patient.caregiver_name || 'Caregiver'} · caring for {patient.name}
              {rows.length ? '' : ' · no messages'}
            </option>
          ))}
        </select>
      }
    />
  )
}

type Item = { kind: 'msg'; at: string; message: Message; index: number } | { kind: 'report'; at: string; report: ConditionReport }

function Thread({ household, picker }: { household: Household; picker: React.ReactNode }) {
  const { patient, rows, askableOrderId } = household
  const activeOrderId = rows.at(-1)?.order_id ?? askableOrderId
  const { data: reports, reload: reloadReports } = useLive(
    () =>
      activeOrderId
        ? api.get<ConditionReport[]>(`/api/orders/${activeOrderId}/condition`)
        : Promise.resolve<ConditionReport[]>([]),
    [activeOrderId],
  )
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [legacy, setLegacy] = useState<CaregiverReplyResult | null>(null)

  // The one question a typed digit answers: the newest still open. Nothing is tappable —
  // a household on a real phone types "4" into the box like any other text.
  const openQuestion = useMemo(() => [...rows].reverse().find(isOpenQuestion), [rows])
  const hasCheck = rows.some((m) => m.template === 'f_condition_check')

  const thread = useMemo<Item[]>(() => {
    const items: Item[] = rows.map((message, index) => ({ kind: 'msg', at: message.created_at, message, index }))
    // A reply routed through /api/messages/reply is already a row above. Ratings recorded
    // through the older /condition-reply route are not, so they only render when this
    // order's thread has no inbound row of its own — one bubble per answer, never two.
    const threaded = rows.some((m) => m.direction === 'in' && m.order_id === activeOrderId)
    if (!threaded) {
      for (const report of reports ?? []) items.push({ kind: 'report', at: report.created_at, report })
    }
    return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  }, [rows, reports, activeOrderId])

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    try {
      if (openQuestion) {
        // Thread-aware: the server derives order and template from the question, and the
        // condition rating still goes through parseConditionReply() unchanged. The outcome
        // shows on the bubble's own receipt line — a real phone adds nothing underneath.
        setLegacy(null)
        await api.post<SmsReplyResult>('/api/messages/reply', { reply_to_message_id: openQuestion.id, body })
      } else if (activeOrderId) {
        setLegacy(await api.post<CaregiverReplyResult>(`/api/orders/${activeOrderId}/condition-reply`, { body }))
        reloadReports()
      }
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  return (
    <PhoneScreen
      title={patient.caregiver_name || 'Caregiver'}
      subtitle={`${patient.caregiver_phone || '—'} · caring for ${patient.name}`}
      picker={picker}
      scrollKey={`${thread.length}:${sending}:${legacy?.score ?? ''}`}
      draft={draft}
      onDraft={setDraft}
      onSend={send}
      sending={sending}
    >
      {thread.length === 0 && (
        <ThreadEmpty>
          No messages yet.
          {!hasCheck && askableOrderId && (
            <button
              onClick={() => api.post(`/api/orders/${askableOrderId}/condition-check`, {})}
              className="mt-3 block w-full rounded-full border border-slate-300 py-1.5 text-slate-600 hover:bg-slate-50"
            >
              Send the condition check
            </button>
          )}
        </ThreadEmpty>
      )}

      {thread.map((item, i) => {
        // Meta is the timestamp and nothing else — a real handset annotates no outcomes.
        const divider = newDay(thread[i - 1]?.at, item.at) && <DayDivider iso={item.at} />
        if (item.kind === 'report') {
          return (
            <Fragment key={`r${item.report.id}`}>
              {divider}
              <Bubble side="sent" meta={time(item.at)}>
                <span className="text-lg font-semibold">{item.report.score}</span>
                {item.report.comment ? ` — ${item.report.comment}` : ''}
              </Bubble>
            </Fragment>
          )
        }

        const m = item.message
        const mine = m.direction === 'in'
        return (
          <Fragment key={m.id}>
            {divider}
            <Bubble side={mine ? 'sent' : 'received'} meta={time(m.created_at)}>
              <Linkify text={m.body} />
            </Bubble>
          </Fragment>
        )
      })}

      {/* Delivery-receipt style status, so the consequence reads as part of the conversation. */}
      {legacy && (
        <div className="pt-1 text-right text-[11px]">
          {legacy.needs_review ? (
            <span className="text-amber-600">Couldn't read a rating — sent to a person rather than guessed</span>
          ) : legacy.escalated ? (
            <span className="text-red-600">Flagged to the hospice · vendor scorecard updated</span>
          ) : (
            <span className="text-slate-400">Recorded · vendor scorecard updated</span>
          )}
        </div>
      )}
    </PhoneScreen>
  )
}
