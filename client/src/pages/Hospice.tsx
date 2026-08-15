import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { fmt, useLive } from '../lib/useLive'
import { buildBoard } from '../lib/board'
import type { BoardRow as Row } from '../lib/board'
import { BoardRow, ColumnHeaders } from '../components/board/BoardRow'
import { ReviewQueueDialog } from '../components/board/ReviewQueueDialog'
import { EvidenceBadge } from '@/components/EvidenceBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Escalation, Message, Order, Patient, Vendor } from '../../../shared/types'

export default function Hospice() {
  const orders = useLive(() => api.get<Order[]>('/api/orders'))
  const patients = useLive(() => api.get<Patient[]>('/api/patients'))
  const vendors = useLive(() => api.get<Vendor[]>('/api/vendors'))
  const escalations = useLive(() => api.get<Escalation[]>('/api/escalations?status=open'))
  const reviewQueue = useLive(() => api.get<Message[]>('/api/messages?review_status=needs_review'))

  const [showLater, setShowLater] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showReview, setShowReview] = useState(false)

  const nameOf = useMemo(() => {
    const map = new Map((patients.data ?? []).map((p) => [p.id, p.name]))
    return (id: number) => map.get(id) ?? `Patient ${id}`
  }, [patients.data])

  const board = useMemo(
    () => buildBoard(orders.data ?? [], escalations.data ?? [], nameOf),
    [orders.data, escalations.data, nameOf]
  )
  const queue = reviewQueue.data ?? []

  const loaded =
    orders.data !== null &&
    patients.data !== null &&
    vendors.data !== null &&
    escalations.data !== null &&
    reviewQueue.data !== null
  const failed =
    orders.failed || patients.failed || vendors.failed || escalations.failed || reviewQueue.failed
  const waitingOnPhoto = board.done.completions - board.done.withPod

  return (
    <div className="mx-auto max-w-[860px] pb-9">
      <div className="mb-7 flex items-center justify-end">
        <Link
          to="/order"
          className="rounded-[10px] bg-primary px-5 py-2.5 text-[13px] font-bold text-primary-foreground transition-colors hover:bg-[#d2694c]"
        >
          + New order
        </Link>
      </div>

      {failed && (
        <div
          role="alert"
          className="mb-2.5 rounded-[14px] bg-destructive/10 px-5 py-4 text-[14.5px] font-semibold text-destructive"
        >
          Can't reach the server — this board may be out of date. Still trying.
        </div>
      )}

      {!loaded ? (
        !failed && <BoardSkeleton />
      ) : (
        <>
          <p className="sr-only" aria-live="polite">
            {board.needsYou.length === 0
              ? 'Nothing needs a person right now.'
              : `${board.needsYou.length} ${board.needsYou.length === 1 ? 'order needs' : 'orders need'} someone.`}
          </p>

          <SectionTitle label="Needs you" count={board.needsYou.length} alarm />
          <ColumnHeaders />
          {board.needsYou.length === 0 && queue.length === 0 && (
            <div className="mb-2.5 rounded-[14px] bg-card px-5 py-4 text-[14.5px] text-muted-foreground shadow-[0_1px_3px_rgba(38,50,64,.06)]">
              Nothing needs a person right now.
            </div>
          )}
          {board.needsYou.map((row) => (
            <BoardRow key={row.key} row={row} vendors={vendors.data ?? []} lead />
          ))}
          {queue.length > 0 && (
            <button
              className="mb-2.5 flex w-full items-center justify-between gap-3 rounded-[14px] bg-card px-5 py-4 text-left text-[14.5px] shadow-[0_1px_4px_rgba(38,50,64,.08)]"
              onClick={() => setShowReview(true)}
            >
              <span>
                {queue.length} vendor {queue.length === 1 ? 'reply needs' : 'replies need'} review
              </span>
              <span className="font-bold text-primary">open ▸</span>
            </button>
          )}

          <SectionTitle label="On the way" count={board.onTheWay.length + board.later.rows.length} />
          {board.onTheWay.length === 0 && board.later.rows.length === 0 && (
            <div className="mb-2.5 rounded-[14px] bg-card px-5 py-4 text-[14px] text-muted-foreground shadow-[0_1px_3px_rgba(38,50,64,.06)]">
              Nothing in motion.
            </div>
          )}
          {board.onTheWay.map((row) => (
            <BoardRow key={row.key} row={row} vendors={vendors.data ?? []} />
          ))}
          {board.later.rows.length > 0 && (
            <LaterRow
              rows={board.later.rows}
              nothingDueBefore={board.later.nothingDueBefore}
              open={showLater}
              onToggle={() => setShowLater((o) => !o)}
              vendors={vendors.data ?? []}
            />
          )}

          <SectionTitle label="Done" count={board.done.completions} suffix="this week" />
          <div className="rounded-[14px] bg-card px-5 py-3.5 shadow-[0_1px_3px_rgba(38,50,64,.05)]">
            <div className="flex flex-wrap items-center justify-between gap-3 text-[14px] text-muted-foreground">
              <span>
                {board.done.completions === 0
                  ? 'Nothing has been closed out this week yet.'
                  : waitingOnPhoto === 0
                    ? 'Every delivery had a photo and a signature.'
                    : `${waitingOnPhoto} ${waitingOnPhoto === 1 ? 'is' : 'are'} still waiting on a photo.`}
              </span>
              <span className="w-full rounded-[10px] bg-[#E6F4EC] py-2.5 text-center text-[13px] font-bold text-success sm:w-40">
                ✓ {board.done.withPod} of {board.done.completions}
              </span>
            </div>
            {board.done.completions > 0 && (
              <>
                <button
                  className="mt-2.5 text-[13px] font-semibold text-primary"
                  onClick={() => setShowHistory((o) => !o)}
                >
                  {showHistory ? 'history ▾' : 'history ▸'}
                </button>
                {showHistory && (
                  <ul className="mt-2.5 space-y-1.5 border-t border-border pt-3 text-[13px]">
                    {board.done.ledger.map((entry) => (
                      <li key={entry.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="tabular-nums text-faint">#{entry.id}</span>
                        <span>{entry.item}</span>
                        <span className="text-muted-foreground">{entry.who}</span>
                        <EvidenceBadge verified={entry.verified} />
                        <span className="ml-auto tabular-nums text-faint">{fmt(entry.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {queue.length === 0 && (
            <p className="mt-9 text-center text-[13px] text-faint">Review queue is empty</p>
          )}

          <ReviewQueueDialog
            queue={queue}
            orders={orders.data ?? []}
            open={showReview}
            onOpenChange={setShowReview}
          />
        </>
      )}
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div aria-hidden="true">
      <SkeletonSection rows={3} lead />
      <SkeletonSection rows={2} />
      <SkeletonSection rows={1} />
    </div>
  )
}

function SkeletonSection({ rows, lead }: { rows: number; lead?: boolean }) {
  return (
    <>
      <Skeleton className="mb-2.5 mt-[26px] h-[15px] w-32" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn('mb-2.5 rounded-[14px]', lead ? 'h-14' : 'h-[52px]')} />
      ))}
    </>
  )
}

function SectionTitle({
  label,
  count,
  suffix,
  alarm,
}: {
  label: string
  count: number
  suffix?: string
  alarm?: boolean
}) {
  return (
    <div className="mb-2.5 mt-[26px] font-display text-[15px] font-extrabold tracking-tight">
      {label}{' '}
      <span className={cn('tabular-nums', alarm ? 'text-destructive' : 'text-faint')}>
        · {count}
        {suffix ? ` ${suffix}` : ''}
      </span>
    </div>
  )
}

function LaterRow({
  rows,
  nothingDueBefore,
  open,
  onToggle,
  vendors,
}: {
  rows: Row[]
  nothingDueBefore: string | null
  open: boolean
  onToggle: () => void
  vendors: Vendor[]
}) {
  return (
    <>
      <button
        className="mb-2 flex w-full items-center justify-between gap-3 rounded-[14px] bg-card px-5 py-3.5 text-left text-[14px] text-faint shadow-[0_1px_3px_rgba(38,50,64,.05)]"
        onClick={onToggle}
      >
        <span>
          {rows.length} more,{' '}
          {nothingDueBefore ? `nothing due before ${nothingDueBefore}` : 'nothing with a date yet'}
        </span>
        <span className="w-40 text-center text-[13px]">{open ? 'hide ▴' : 'show ▾'}</span>
      </button>
      {open && rows.map((row) => <BoardRow key={row.key} row={row} vendors={vendors} />)}
    </>
  )
}
