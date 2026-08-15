import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, PhoneOff, ShieldAlert, TrendingUp } from 'lucide-react'
import type {
  Order,
  Patient,
  ReportSummary,
  VendorCondition,
  VendorLeverage,
  VendorScorecard,
} from '../../../shared/types'
import { PersonaHeader } from '@/components/PersonaHeader'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useLive } from '@/lib/useLive'
import { selectBoardOrders } from '@/lib/atRisk'
import { byCode } from '@/lib/domain'
import {
  COST_APPROVAL_THRESHOLD_USD,
  mockApprovals,
  mockPatientCostOfCare,
  type ApprovalStatus,
  type CostApproval,
} from '@/lib/mocks'

// The DON persona name shown on approve/deny actions.
const DON_ACTOR = 'S. Reyes, DON'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface ReportsData {
  summary: ReportSummary
  scorecards: VendorScorecard[]
  conditions: VendorCondition[]
  leverage: VendorLeverage[]
  orders: Order[]
  patients: Patient[]
}

function loadReports(): Promise<ReportsData> {
  return Promise.all([
    api.get<ReportSummary>('/api/reports/summary'),
    api.get<VendorScorecard[]>('/api/reports/vendor-scorecards'),
    api.get<VendorCondition[]>('/api/vendors/condition'),
    api.get<VendorLeverage[]>('/api/reports/vendor-leverage'),
    api.get<Order[]>('/api/orders'),
    api.get<Patient[]>('/api/patients'),
  ]).then(([summary, scorecards, conditions, leverage, orders, patients]) => ({
    summary,
    scorecards,
    conditions,
    leverage,
    orders,
    patients,
  }))
}

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`
const pct = (rate: number) => `${Math.round(rate * 100)}%`

export default function Reports() {
  const navigate = useNavigate()
  const { data, failed, reload } = useLive<ReportsData>(loadReports)

  return (
    <div className="space-y-7">
      <PersonaHeader
        persona="Director of Nursing"
        title="Reports"
        description="Oversight across vendors — performance, cost, and the calls no one had to make."
        actions={
          <Button variant="outline" className="rounded-xl" onClick={() => navigate('/hospice')}>
            View board
          </Button>
        }
      />

      {failed && !data ? (
        <EmptyState
          title="Couldn't load the reports"
          description="We can't reach the server right now. Nothing is lost — try again in a moment."
          action={
            <Button variant="outline" className="rounded-xl" onClick={reload}>
              Try again
            </Button>
          }
        />
      ) : !data ? (
        <ReportsSkeleton />
      ) : (
        <>
          {failed && (
            <div
              role="alert"
              className="rounded-[14px] bg-destructive/10 px-5 py-4 text-sm font-semibold text-destructive"
            >
              Can't reach the server — these numbers may be out of date. Still trying.
            </div>
          )}
          <KpiRow data={data} />
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <VendorScorecards scorecards={data.scorecards} conditions={data.conditions} />
            <CostOfCare orders={data.orders} patients={data.patients} />
          </div>
          <ContractLeverage leverage={data.leverage} />
          <CostApprovals orders={data.orders} />
        </>
      )}
    </div>
  )
}

// --- KPI row ------------------------------------------------------------------

function KpiRow({ data }: { data: ReportsData }) {
  const { summary, scorecards, conditions } = data

  // On-time across all vendors, weighted by sample size (the real seeded spread).
  const onTime = useMemo(() => {
    let weighted = 0
    let samples = 0
    for (const s of scorecards) {
      if (s.overall_on_time_rate == null) continue
      weighted += s.overall_on_time_rate * s.total_samples
      samples += s.total_samples
    }
    return samples ? weighted / samples : null
  }, [scorecards])

  // Average 1-5 equipment condition across vendors, weighted by report count.
  const avgCondition = useMemo(() => {
    let weighted = 0
    let reports = 0
    for (const c of conditions) {
      weighted += c.avg_score * c.reports
      reports += c.reports
    }
    return reports ? weighted / reports : null
  }, [conditions])

  return (
    <div className="space-y-3">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Hero: the coral "white card on a coral block" move. */}
        <div className="rounded-2xl bg-primary p-6 text-primary-foreground shadow-[0_1px_2px_rgba(38,50,64,.04),0_14px_34px_-20px_rgba(38,50,64,.20)]">
          <div className="flex items-start justify-between gap-2">
            <PhoneOff className="size-5 opacity-80" />
            <span
              className="rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
              title="Synthetic: counted off a simulated year of orders in the seeded event ledger — the counting rule is printed below the row"
            >
              synthetic
            </span>
          </div>
          <div className="mt-3 font-display text-5xl font-extrabold tabular-nums tracking-tight">
            {summary.calls_avoided}
          </div>
          <div className="mt-1.5 text-sm font-semibold leading-snug">
            phone calls that never happened
          </div>
          {/* All four counters, because the server sums all four into the hero above. */}
          <div className="mt-1 text-xs text-primary-foreground/80">
            {summary.calls_avoided_breakdown.auto_applied_messages} vendor texts auto-applied ·{' '}
            {summary.calls_avoided_breakdown.vendor_self_service_updates} vendor self-updates ·{' '}
            {summary.calls_avoided_breakdown.auto_triggered_pickups} auto-triggered pickups ·{' '}
            {summary.calls_avoided_breakdown.household_confirmations} household confirmations
          </div>
        </div>

        <KpiCard
          icon={<TrendingUp className="size-5" />}
          value={onTime == null ? '—' : pct(onTime)}
          label="deliveries on time"
          tone="success"
        />
        <KpiCard
          icon={<CheckCircle2 className="size-5" />}
          value={avgCondition == null ? '—' : avgCondition.toFixed(1)}
          label="avg equipment condition (1–5)"
        />
        <KpiCard
          icon={<ShieldAlert className="size-5" />}
          value={String(summary.open_escalations)}
          label="open escalations"
          tone={summary.open_escalations > 0 ? 'risk' : undefined}
        />
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">Where the calls-avoided number comes from.</span>{' '}
        Synthetic demo data — most of it is the seeded year of history, not this session. The counting
        rule, verbatim from the server: {summary.calls_avoided_definition}
      </p>
    </div>
  )
}

function KpiCard({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode
  value: string
  label: string
  tone?: 'success' | 'risk'
}) {
  const valueColor =
    tone === 'success' ? 'text-success' : tone === 'risk' ? 'text-destructive' : 'text-foreground'
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-muted-foreground">{icon}</div>
        <div className={`mt-3 font-display text-4xl font-extrabold tabular-nums tracking-tight ${valueColor}`}>
          {value}
        </div>
        <div className="mt-1.5 text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  )
}

// --- Vendor scorecards --------------------------------------------------------

// The delivery SLA the seeded vendors are graded against: the share of orders that
// landed on time. We show it as a bar so a lagging vendor reads instantly.
function VendorScorecards({
  scorecards,
  conditions,
}: {
  scorecards: VendorScorecard[]
  conditions: VendorCondition[]
}) {
  const conditionById = useMemo(() => {
    const map = new Map<number, VendorCondition>()
    for (const c of conditions) map.set(c.vendor_id, c)
    return map
  }, [conditions])

  // Sort worst on-time first — the DON wants the problem vendor at the top.
  const rows = useMemo(
    () =>
      [...scorecards].sort(
        (a, b) => (a.overall_on_time_rate ?? 1) - (b.overall_on_time_rate ?? 1),
      ),
    [scorecards],
  )

  // The lagging vendor's worst equipment × weekday cell — a human routing hint. Cells the
  // seed couldn't support carry sample_size 0, and a routing recommendation off no
  // deliveries is exactly the manufactured precision FAQ §6 penalises.
  const worst = rows[0]
  const worstCell = useMemo(() => {
    if (!worst) return null
    return (
      [...worst.stats]
        .filter((s) => s.sample_size > 0)
        .sort((a, b) => a.on_time_rate - b.on_time_rate)[0] ?? null
    )
  }, [worst])

  return (
    <Card>
      <CardHeader>
        <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
          Vendor scorecards
        </div>
        <CardTitle className="text-base text-muted-foreground">
          On-time, equipment condition, and delivery SLA per vendor
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">On-time</TableHead>
              <TableHead className="text-right">Condition</TableHead>
              <TableHead className="w-40">SLA met</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => {
              const rate = s.overall_on_time_rate
              const cond = conditionById.get(s.vendor.id)
              const low = rate != null && rate < 0.75
              return (
                <TableRow key={s.vendor.id}>
                  <TableCell className="font-medium text-foreground">
                    {s.vendor.name}
                    <div className="text-xs font-normal text-faint">
                      {s.total_samples} {s.total_samples === 1 ? 'delivery' : 'deliveries'} measured
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {rate == null ? '—' : pct(rate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {cond ? cond.avg_score.toFixed(1) : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${low ? 'bg-destructive' : 'bg-success'}`}
                        style={{ width: `${Math.round((rate ?? 0) * 100)}%` }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {worst && worstCell && worstCell.on_time_rate < 0.75 && (
          <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">{worst.vendor.name}</span> runs late on{' '}
            {DAYS[worstCell.day_of_week]}{' '}
            {byCode(worstCell.hcpcs_code)?.equipment_name ?? worstCell.hcpcs_code}{' '}
            orders ({pct(worstCell.on_time_rate)} on-time across {worstCell.sample_size}{' '}
            {worstCell.sample_size === 1 ? 'delivery' : 'deliveries'}) — consider routing urgent{' '}
            {DAYS[worstCell.day_of_week]} discharges elsewhere.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// --- Cost of care -------------------------------------------------------------

function CostOfCare({ orders, patients }: { orders: Order[]; patients: Patient[] }) {
  // Only patients that actually have DME orders — an empty cost card helps no one.
  const withOrders = useMemo(() => {
    const ids = new Set(orders.map((o) => o.patient_id))
    return patients.filter((p) => ids.has(p.id))
  }, [orders, patients])

  const [patientId, setPatientId] = useState<number | null>(null)
  const selectedId = patientId ?? withOrders[0]?.id ?? null
  const patient = withOrders.find((p) => p.id === selectedId) ?? null

  if (!patient) {
    return (
      <Card>
        <CardHeader>
          <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
            Cost of care
          </div>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No patient DME spend yet"
            description="Cost of care appears once a patient has orders."
          />
        </CardContent>
      </Card>
    )
  }

  const cost = mockPatientCostOfCare(patient.id, orders)
  const max = Math.max(cost.med_spend_usd, cost.dme_spend_usd, 1)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
            Cost of care
          </div>
          <Select value={String(selectedId)} onValueChange={(v) => setPatientId(Number(v))}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {withOrders.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CardTitle className="mt-1 text-lg">{patient.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <SpendBar
          label="Medication (BetterRX)"
          amount={cost.med_spend_usd}
          width={cost.med_spend_usd / max}
          color="bg-secondary"
          source="synthetic"
        />
        <SpendBar
          label="DME equipment"
          amount={cost.dme_spend_usd}
          width={cost.dme_spend_usd / max}
          color="bg-primary"
          source="CMS"
        />
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="font-semibold">Total cost of care</span>
          <span className="font-display text-lg font-extrabold tabular-nums">
            {usd(cost.total_usd)}
          </span>
        </div>
        {/*
          These two bars are not the same kind of number and the screen should not pretend
          otherwise. FAQ §6 penalises manufactured precision, and BetterRX is a pharmacy
          company — the medication figure is the one a judge would recognise as invented.
          Under the hospice benefit, medications for the terminal diagnosis sit inside the
          per-diem exactly like DME, so no public per-claim figure exists to ground it in.
          Saying so is a stronger answer than a better-looking fake.
        */}
        <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Where these come from.</span> DME is
          priced from the real CMS Medicare DMEPOS Public Use File — average allowed amount per
          HCPCS code, plus a synthetic $35 setup fee. Medication spend is synthetic: hospice
          drugs for the terminal diagnosis are paid inside the Medicare per-diem, so no public
          per-patient figure exists to source it from.
        </p>
      </CardContent>
    </Card>
  )
}

function SpendBar({
  label,
  amount,
  width,
  color,
  source,
}: {
  label: string
  amount: number
  width: number
  color: string
  /** Provenance badge — a real figure and an invented one must not look alike. */
  source?: 'CMS' | 'synthetic'
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {label}
          {source && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                source === 'CMS'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}
              title={
                source === 'CMS'
                  ? 'Real: CMS Medicare DMEPOS Public Use File, average allowed amount per HCPCS code'
                  : 'Synthetic: hospice drug spend sits inside the Medicare per-diem, so there is no public per-patient figure'
              }
            >
              {source === 'CMS' ? 'CMS data' : 'synthetic'}
            </span>
          )}
        </span>
        <span className="font-semibold tabular-nums">{usd(amount)}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(width * 100)}%` }} />
      </div>
    </div>
  )
}

// --- Contract leverage ----------------------------------------------------------

// The negotiation table: what the ledger can prove about each vendor, split from what
// the vendor merely said. Reads /api/reports/vendor-leverage — live event-ledger math,
// never the seeded scorecard history the table above runs on.
function ContractLeverage({ leverage }: { leverage: VendorLeverage[] }) {
  // Biggest trust gap first — that's the vendor whose contract is up for a conversation.
  const rows = useMemo(
    () =>
      [...leverage]
        .filter((l) => l.orders_total > 0)
        .sort((a, b) => (b.trust_gap ?? -Infinity) - (a.trust_gap ?? -Infinity)),
    [leverage],
  )

  const gapPoints = (gap: number) => `${gap > 0 ? '+' : ''}${Math.round(gap * 100)} pts`
  const answerTime = (h: number) => (h < 1 ? `${Math.round(h * 60)}m` : `${h.toFixed(1)}h`)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
            Verified vs. claimed
          </div>
          <span
            className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground"
            title="Synthetic demo data — but computed live from the event ledger, not from the seeded scorecard history"
          >
            synthetic
          </span>
        </div>
        <CardTitle className="text-base text-muted-foreground">
          What the ledger proves vs. what the vendor said — the renewal-negotiation numbers
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">Verified on-time</TableHead>
              <TableHead className="text-right">Claimed on-time</TableHead>
              <TableHead className="text-right">Trust gap</TableHead>
              <TableHead className="text-right">Answers in</TableHead>
              <TableHead className="text-right">Interventions / order</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((l) => (
              <TableRow key={l.vendor.id}>
                <TableCell className="font-medium text-foreground">
                  {l.vendor.name}
                  <div className="text-xs font-normal text-faint">
                    {l.deliveries_measured} deliveries measured · {l.orders_total} orders
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.verified_on_time_rate == null ? '—' : pct(l.verified_on_time_rate)}
                  <div className="text-xs font-normal text-faint">POD-backed, n={l.verified_deliveries}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.claimed_on_time_rate == null ? '—' : pct(l.claimed_on_time_rate)}
                  <div className="text-xs font-normal text-faint">their word, n={l.claimed_deliveries}</div>
                </TableCell>
                <TableCell className="text-right">
                  {l.trust_gap == null ? (
                    <span
                      className="text-faint"
                      title="Withheld: fewer than 15 deliveries in one of the cohorts — a gap on that small a sample would be noise, not a finding"
                    >
                      —
                    </span>
                  ) : (
                    <Badge variant={l.trust_gap > 0.05 ? 'destructive' : 'success'}>
                      {gapPoints(l.trust_gap)}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.median_answer_hours == null ? '—' : answerTime(l.median_answer_hours)}
                  <div className="text-xs font-normal text-faint">
                    {l.never_answered_rate == null
                      ? `${l.questions_asked} asked`
                      : `never answers ${pct(l.never_answered_rate)} · ${l.questions_asked} asked`}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.interventions_per_order == null ? '—' : l.interventions_per_order.toFixed(2)}
                  <div className="text-xs font-normal text-faint">
                    {l.nags_sent} chases · {l.escalations} escalations
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">How to read this.</span> A delivery is{' '}
          <span className="font-semibold">verified</span> when a driver POD exists, and{' '}
          <span className="font-semibold">claimed</span> when the only evidence is the vendor saying
          so. The trust gap is claimed minus verified on-time — a vendor whose word consistently
          outruns their PODs earns a bigger gap — and is withheld until both cohorts have 15
          deliveries. <span className="font-semibold">Answers in</span> is the median time from a
          texted question to its reply; every question carries a sent and an answered timestamp,
          and one unanswered after 24 hours counts as never answered (younger ones are still in
          play). Interventions count automated chases plus escalations: staff time the vendor cost
          us. Every number is computed from the append-only event ledger on request, which is what
          makes it a renewal argument rather than an impression.
        </p>
      </CardContent>
    </Card>
  )
}

// --- Cost-threshold approvals -------------------------------------------------

function CostApprovals({ orders }: { orders: Order[] }) {
  // Only the live working set — never the ~260 history rows behind the scorecards.
  const boardOrders = useMemo(() => selectBoardOrders(orders), [orders])
  const initial = useMemo(() => mockApprovals(boardOrders), [boardOrders])

  // DON decisions live in the page — the mock has no persistence yet.
  const [decisions, setDecisions] = useState<Record<number, { status: ApprovalStatus; by: string }>>({})

  const rows: CostApproval[] = initial.map((a) => {
    const d = decisions[a.order_id]
    return d ? { ...a, status: d.status, decided_by: d.by } : a
  })

  const decide = (orderId: number, status: ApprovalStatus) =>
    setDecisions((prev) => ({ ...prev, [orderId]: { status, by: DON_ACTOR } }))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
            Cost-threshold approvals
          </span>
          <span
            className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground"
            title="Synthetic: the queue is derived from seeded orders priced off the CMS file, and the approve/deny decision is not stored anywhere"
          >
            synthetic
          </span>
        </div>
        <CardTitle className="text-base text-muted-foreground">
          Orders over {usd(COST_APPROVAL_THRESHOLD_USD)}/mo need the DON&apos;s sign-off before dispatch
        </CardTitle>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Design preview — decisions aren&apos;t saved yet. Approving or denying here changes this
          screen only, and resets when you navigate away.
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing waiting on you"
            description={`No active order clears the ${usd(COST_APPROVAL_THRESHOLD_USD)}/mo threshold right now.`}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead className="text-right">Monthly cost</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.order_id}>
                  <TableCell className="font-medium tabular-nums text-faint">
                    #{a.order_id}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {a.equipment_name}
                    <div className="text-xs text-faint">{a.hcpcs_code}</div>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {usd(a.monthly_usd)}
                  </TableCell>
                  <TableCell className="text-right">
                    {a.status === 'pending' ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="success" onClick={() => decide(a.order_id, 'approved')}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => decide(a.order_id, 'denied')}>
                          Deny
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-0.5">
                        <Badge variant={a.status === 'approved' ? 'success' : 'destructive'}>
                          {a.status === 'approved' ? 'Approved' : 'Denied'}
                        </Badge>
                        {a.decided_by && <span className="text-xs text-faint">by {a.decided_by}</span>}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

// --- Loading skeleton ---------------------------------------------------------

function ReportsSkeleton() {
  return (
    <div className="space-y-7">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  )
}
