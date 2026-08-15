import { useState, type KeyboardEvent } from 'react'
import { isPickup, plainItem, statePill, whenAnchor, formatWhen } from '../../lib/board'
import type { BoardRow as Row, Pill } from '../../lib/board'
import { RowDetail } from './RowDetail'
import { SwapVendorDialog } from './SwapVendorDialog'
import { cn } from '@/lib/utils'
import { useHighlight } from '../../lib/highlight'
import type { Order, Vendor } from '../../../../shared/types'

const PILL_TONE: Record<Pill['tone'], string> = {
  act: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  good: 'bg-[#E6F4EC] text-success',
  wait: 'bg-[#EEF1F3] text-muted-foreground',
}

export const ROW_GRID =
  'sm:grid sm:grid-cols-[minmax(0,1.2fr)_minmax(0,.9fr)_minmax(0,1.1fr)_minmax(0,1fr)_160px] sm:items-center sm:gap-x-4'

const ROW_FOCUS = 'rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const CELL = 'sm:min-w-0 sm:truncate'

function rowKeyDown(toggle: () => void) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    toggle()
  }
}

export function ColumnHeaders() {
  return (
    <div
      className={cn(
        'hidden px-5 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint',
        ROW_GRID
      )}
    >
      <span>Who</span>
      <span>Action</span>
      <span>Item</span>
      <span>When</span>
      <span />
    </div>
  )
}

export function BoardRow({ row, vendors, lead }: { row: Row; vendors: Vendor[]; lead?: boolean }) {
  const [open, setOpen] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const single = row.orders.length === 1 ? row.orders[0] : null
  const red = row.atRisk || (row.when?.overdue ?? false)
  const acked = useHighlight().isPulsing(row.orders.map((o) => o.id))

  const onPill = () => {
    if (row.pill.action === 'swap') setSwapping(true)
    else setOpen(true)
  }

  return (
    <div
      data-order-ids={row.orders.map((o) => o.id).join(' ')}
      className={cn(
        'mb-2.5 rounded-[14px] bg-card px-5',
        lead ? 'py-4 text-[15px] shadow-[0_1px_4px_rgba(38,50,64,.08)]' : 'py-[15px] text-[14.5px] shadow-[0_1px_3px_rgba(38,50,64,.06)]',
        acked && 'row-ack'
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        className={cn('cursor-pointer', ROW_FOCUS, ROW_GRID)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={rowKeyDown(() => setOpen((o) => !o))}
      >
        <div className="flex items-baseline justify-between gap-3 sm:contents">
          <span className={cn('font-[750] sm:col-start-1 sm:row-start-1', CELL)}>{row.who}</span>
          <span
            className={cn(
              'text-[13px] font-normal tabular-nums sm:col-start-4 sm:row-start-1 sm:text-[14px]',
              CELL,
              red ? 'text-destructive' : 'text-faint'
            )}
          >
            {row.when?.text ?? '—'}
          </span>
        </div>

        <div className="mt-0.5 text-[13px] text-muted-foreground sm:contents sm:text-[length:inherit]">
          <span className={cn('sm:col-start-2 sm:row-start-1 sm:text-foreground', CELL)}>{row.action}</span>
          <span aria-hidden="true" className="sm:hidden">
            {' · '}
          </span>
          <span className={cn('sm:col-start-3 sm:row-start-1', CELL)}>{row.item}</span>
        </div>

        <PillView pill={row.pill} onAct={onPill} />
      </div>

      {open && single && <RowDetail order={single} vendor={vendors.find((v) => v.id === single.vendor_id)} />}
      {open && !single && <GroupLines orders={row.orders} vendors={vendors} />}

      {single && swapping && (
        <SwapVendorDialog order={single} who={row.who} open onOpenChange={setSwapping} />
      )}
    </div>
  )
}

function PillView({ pill, onAct }: { pill: Pill; onAct: () => void }) {
  // min-h-11 is the design system's 44px touch floor — this is the board's only CTA.
  const base = cn(
    'mt-2.5 flex min-h-11 w-full items-center justify-center rounded-[10px] px-2 text-center text-[13px] font-bold sm:col-start-5 sm:row-start-1 sm:mt-0 sm:w-40',
    PILL_TONE[pill.tone]
  )
  if (pill.action === null) return <span className={base}>{pill.label}</span>
  return (
    <button
      className={cn(base, 'transition-colors')}
      onClick={(e) => {
        e.stopPropagation()
        onAct()
      }}
    >
      {pill.label}
    </button>
  )
}

function GroupLines({ orders, vendors }: { orders: Order[]; vendors: Vendor[] }) {
  const [openId, setOpenId] = useState<number | null>(null)
  const now = new Date()
  return (
    <div className="border-t border-border pt-3" onClick={(e) => e.stopPropagation()}>
      {orders.map((o) => {
        const anchor = whenAnchor(o)
        const pill = statePill(o)
        return (
          <div key={o.id}>
            <div
              role="button"
              tabIndex={0}
              aria-expanded={openId === o.id}
              className={cn('cursor-pointer py-2 text-[13.5px]', ROW_FOCUS, ROW_GRID)}
              onClick={() => setOpenId((id) => (id === o.id ? null : o.id))}
              onKeyDown={rowKeyDown(() => setOpenId((id) => (id === o.id ? null : o.id)))}
            >
              <span className={cn('text-muted-foreground sm:col-start-1 sm:row-start-1', CELL)}>
                {isPickup(o) ? 'Pickup' : 'Delivery'}
              </span>
              <span className={cn('sm:col-span-2 sm:col-start-2 sm:row-start-1', CELL)}>
                {plainItem(o.equipment_name)}
              </span>
              <span className={cn('tabular-nums text-faint sm:col-start-4 sm:row-start-1', CELL)}>
                {anchor ? formatWhen(anchor, now).text : '—'}
              </span>
              <span
                className={cn(
                  'mt-1.5 block w-full rounded-[10px] py-1.5 text-center text-[12px] font-bold sm:col-start-5 sm:row-start-1 sm:mt-0 sm:w-40',
                  PILL_TONE[pill.tone]
                )}
              >
                {pill.label}
              </span>
            </div>
            {openId === o.id && <RowDetail order={o} vendor={vendors.find((v) => v.id === o.vendor_id)} />}
          </div>
        )
      })}
    </div>
  )
}
