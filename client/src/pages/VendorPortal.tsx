import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Link2Off, Minus, PackageSearch, Plus, Truck } from 'lucide-react'
import { toast } from 'sonner'
import type { Order, OrderState, VendorLoad } from '../../../shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/EmptyState'
import { PersonaHeader } from '@/components/PersonaHeader'
import { PortalOrderCard } from '@/components/PortalOrderCard'
import { usePortal } from '@/hooks/usePortal'
import {
  mockVendorInventory,
  mockUnitLocations,
  unitLocationLabel,
  type InventoryUnit,
  type UnitLocation,
} from '@/lib/mocks'
import { cn } from '@/lib/utils'

interface Group {
  title: string
  note: string
  states: OrderState[]
  /** Delivered orders stay open for months — show the newest few, count the rest. */
  limit?: number
  newestFirst?: boolean
  more?: (rest: number) => string
}

const GROUPS: Group[] = [
  { title: 'On the way', note: 'Accepted or already on the truck.', states: ['dispatched', 'in_transit'] },
  {
    title: 'Pickups',
    note: 'The patient no longer needs this. Time to bring it home.',
    states: ['pickup_pending', 'pickup_overdue'],
  },
  {
    title: 'At the patient',
    note: 'Delivered and in use — nothing to do until a pickup is called.',
    states: ['delivered'],
    limit: 6,
    newestFirst: true,
    more: (rest) => `+${rest} more units still with a patient — see the Equipment tab.`,
  },
]

const UNIT_ROW_LIMIT = 24

const UNIT_BADGE: Record<UnitLocation, 'muted' | 'secondary' | 'success' | 'destructive'> = {
  in_stock: 'muted',
  out_for_delivery: 'secondary',
  at_patient: 'success',
  overdue_pickup: 'destructive',
}

const UNIT_ORDER: UnitLocation[] = ['overdue_pickup', 'out_for_delivery', 'at_patient', 'in_stock']

function byDeadline(a: Order, b: Order): number {
  const at = a.target_at ? new Date(a.target_at).getTime() : Number.MAX_SAFE_INTEGER
  const bt = b.target_at ? new Date(b.target_at).getTime() : Number.MAX_SAFE_INTEGER
  return at - bt
}

function StatTile({ value, label, tone }: { value: number; label: string; tone?: 'risk' }) {
  return (
    <Card className="gap-1 px-5 py-4">
      <div
        className={cn(
          'font-display text-3xl font-extrabold tabular-nums',
          tone === 'risk' && value > 0 ? 'text-destructive' : 'text-foreground'
        )}
      >
        {value}
      </div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </Card>
  )
}

function loadLine(load: VendorLoad): string {
  const parts: string[] = []
  if (load.open_stops > 0) parts.push(`${load.open_stops} ${load.open_stops === 1 ? 'stop' : 'stops'} open`)
  parts.push(
    parts.length > 0
      ? `${load.due_today_stops} due today`
      : `${load.due_today_stops} ${load.due_today_stops === 1 ? 'stop' : 'stops'} due today`
  )
  if (load.overdue_pickups > 0) {
    parts.push(`${load.overdue_pickups} ${load.overdue_pickups === 1 ? 'pickup' : 'pickups'} overdue`)
  }
  return parts.join(' · ')
}

function declaredLine(load: VendorLoad): string | null {
  if (load.capacity === null) return null
  if (load.capacity === 0) return 'You said: no trucks today.'
  if (load.remaining_today === 0) return 'At capacity for today.'
  return `Room for ${load.remaining_today} more today.`
}

function TodayStrip({
  load,
  onDeclare,
}: {
  load: VendorLoad
  onDeclare: (stops: number) => Promise<VendorLoad>
}) {
  const [saved, setSaved] = useState<VendorLoad | null>(null)
  const [draft, setDraft] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => setSaved(null), [load])

  const shown = saved ?? load
  const value = draft ?? shown.capacity ?? 0
  const declared = declaredLine(shown)

  const save = async () => {
    const rollback = draft
    setDraft(value)
    setSaving(true)
    try {
      setSaved(await onDeclare(value))
      toast.success('The hospice can see your capacity.')
    } catch {
      setDraft(rollback)
      toast.error("That didn't go through — give it another tap.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="gap-4 px-5 py-5 sm:px-7">
      <div>
        <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Today</div>
        <p className="mt-1.5 font-display text-xl font-extrabold tabular-nums text-foreground">
          {loadLine(shown)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <span className="text-sm text-muted-foreground">How many stops can you take today?</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="One fewer stop"
            disabled={saving || value === 0}
            onClick={() => setDraft(Math.max(0, value - 1))}
          >
            <Minus />
          </Button>
          <span
            aria-live="polite"
            className="min-w-10 text-center font-display text-2xl font-extrabold tabular-nums text-foreground"
          >
            {value}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="One more stop"
            disabled={saving}
            onClick={() => setDraft(value + 1)}
          >
            <Plus />
          </Button>
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {declared && (
        <div>
          <p className="text-sm font-semibold text-foreground tabular-nums">{declared}</p>
          <p className="mt-1 text-xs leading-relaxed text-faint">
            The stop counts are ours, from your open orders; the capacity number is yours.
          </p>
        </div>
      )}
    </Card>
  )
}

export default function VendorPortal() {
  const { token } = useParams<{ token: string }>()
  const { vendor, orders, load, loading, error, confirm, setEta, decline, declareCapacity } =
    usePortal(token)

  const [now, setNow] = useState(() => Date.now())
  const [pending, setPending] = useState<Record<number, OrderState>>({})
  const [busy, setBusy] = useState<Record<number, boolean>>({})
  const [declined, setDeclined] = useState<number[]>([])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    setPending((prev) => {
      const next = { ...prev }
      let changed = false
      for (const order of orders) {
        if (next[order.id] === order.state) {
          delete next[order.id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [orders])

  const stateOf = useCallback((order: Order) => pending[order.id] ?? order.state, [pending])

  const act = useCallback(
    async (id: number, expected: OrderState | null, run: () => Promise<void>, done: string) => {
      setBusy((b) => ({ ...b, [id]: true }))
      if (expected) setPending((p) => ({ ...p, [id]: expected }))
      try {
        await run()
        toast.success(done)
      } catch {
        setPending((p) => {
          const next = { ...p }
          delete next[id]
          return next
        })
        toast.error("That didn't go through — give it another tap.")
      } finally {
        setBusy((b) => ({ ...b, [id]: false }))
      }
    },
    []
  )

  const sorted = useMemo(() => [...orders].sort(byDeadline), [orders])
  const waiting = sorted.filter((o) => stateOf(o) === 'ordered')
  const inventory = useMemo(
    () => (vendor ? mockVendorInventory(vendor.id, orders) : []),
    [vendor, orders]
  )
  const unitByOrder = useMemo(
    () => (vendor ? mockUnitLocations(vendor.id, orders) : new Map<number, InventoryUnit>()),
    [vendor, orders]
  )
  const outCount = sorted.filter((o) => ['dispatched', 'in_transit'].includes(stateOf(o))).length
  const pickupCount = sorted.filter((o) =>
    ['pickup_pending', 'pickup_overdue'].includes(stateOf(o))
  ).length
  const overdueCount = sorted.filter((o) => stateOf(o) === 'pickup_overdue').length
  const atPatientCount = sorted.filter((o) => stateOf(o) === 'delivered').length

  if (!token) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<PackageSearch />}
          title="Open the link we texted you"
          description="Your orders live at a private link — no account, no password. Tap it from the text message and this page is yours."
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<Link2Off />}
          title="This link isn't working"
          description="It may have expired or been mistyped. Text the hospice back and they'll send you a fresh one — nothing is lost."
        />
      </div>
    )
  }

  if (loading && !vendor) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (!vendor) return null

  const renderCard = (order: Order) => (
    <PortalOrderCard
      key={order.id}
      order={order}
      displayState={stateOf(order)}
      now={now}
      unit={unitByOrder.get(order.id)}
      busy={!!busy[order.id]}
      declined={declined.includes(order.id)}
      onConfirm={(etaIso) =>
        act(
          order.id,
          'dispatched',
          () => confirm(order.id, etaIso),
          etaIso ? 'Accepted with your ETA — the hospice can see it.' : 'Accepted — the hospice can see it.'
        )
      }
      onSetEta={(etaIso) => act(order.id, null, () => setEta(order.id, etaIso), 'ETA sent to the hospice.')}
      onDecline={(reason) => {
        setDeclined((d) => [...d, order.id])
        void act(
          order.id,
          null,
          () =>
            decline(order.id, reason).catch((err) => {
              setDeclined((d) => d.filter((id) => id !== order.id))
              throw err
            }),
          "Thanks for saying so — they're re-routing it now."
        )
      }}
    />
  )

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PersonaHeader
        persona="Vendor portal"
        title={vendor.name}
        description={
          <>
            {vendor.contact_name ? `Hi ${vendor.contact_name.split(' ')[0]} — e` : 'E'}verything the hospice
            has open with you, in one place. No account, no password.
          </>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <StatTile value={outCount} label="Out for delivery" />
        <StatTile value={pickupCount} label="Pickups" tone={overdueCount > 0 ? 'risk' : undefined} />
        <StatTile value={atPatientCount} label="At a patient" />
      </div>

      {load && <TodayStrip load={load} onDeclare={declareCapacity} />}

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-6 space-y-10">
          {sorted.length === 0 && (
            <EmptyState
              icon={<Truck />}
              title="Nothing open right now"
              description="When the hospice sends you an order it shows up here — and we'll text you too."
            />
          )}

          {waiting.length > 0 && (
            <section className="rounded-3xl bg-coral-tint p-5 sm:p-7">
              <div className="mb-5">
                <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
                  Waiting on you
                </div>
                <div className="mt-1.5 font-display text-3xl font-extrabold tabular-nums text-foreground">
                  {waiting.length}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {waiting.length === 1 ? 'One order needs' : `${waiting.length} orders need`} a yes or a no.
                  One tap and the hospice knows.
                </p>
              </div>
              <div className="space-y-4">{waiting.map(renderCard)}</div>
            </section>
          )}

          {GROUPS.map((group) => {
            const all = sorted.filter((o) => group.states.includes(stateOf(o)))
            if (all.length === 0) return null
            const ordered = group.newestFirst ? [...all].reverse() : all
            const list = group.limit ? ordered.slice(0, group.limit) : ordered
            const rest = all.length - list.length
            return (
              <section key={group.title} className="space-y-4">
                <div>
                  <h2 className="font-display text-xl font-extrabold text-foreground">
                    {group.title} <span className="text-faint tabular-nums">{all.length}</span>
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{group.note}</p>
                </div>
                <div className="space-y-4">{list.map(renderCard)}</div>
                {rest > 0 && group.more && (
                  <p className="text-sm text-muted-foreground tabular-nums">{group.more(rest)}</p>
                )}
              </section>
            )
          })}
        </TabsContent>

        <TabsContent value="equipment" className="mt-6 space-y-6">
          <div className="flex flex-wrap gap-2">
            {UNIT_ORDER.map((location) => {
              const count = inventory.filter((u) => u.location === location).length
              if (count === 0) return null
              return (
                <Badge key={location} variant={UNIT_BADGE[location]} className="tabular-nums">
                  {count} {unitLocationLabel(location).toLowerCase()}
                </Badge>
              )
            })}
          </div>

          <Card className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Where it is</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory
                  .slice()
                  .sort((a, b) => UNIT_ORDER.indexOf(a.location) - UNIT_ORDER.indexOf(b.location))
                  .slice(0, UNIT_ROW_LIMIT)
                  .map((unit) => (
                    <TableRow key={unit.serial}>
                      <TableCell className="font-semibold tabular-nums">{unit.serial}</TableCell>
                      <TableCell>{unit.equipment_name}</TableCell>
                      <TableCell>
                        <Badge variant={UNIT_BADGE[unit.location]}>{unitLocationLabel(unit.location)}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{unit.where}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Card>
          {inventory.length > UNIT_ROW_LIMIT && (
            <p className="text-sm text-muted-foreground tabular-nums">
              Showing {UNIT_ROW_LIMIT} of {inventory.length} units.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Serial numbers and shelf locations are illustrative — the order, status and patient side are live.
          </p>
        </TabsContent>
      </Tabs>

      <p className="border-t border-border pt-5 text-center text-xs leading-relaxed text-faint">
        No account needed. This link shows order numbers, equipment and service area only — never patient
        details.
      </p>
    </div>
  )
}
