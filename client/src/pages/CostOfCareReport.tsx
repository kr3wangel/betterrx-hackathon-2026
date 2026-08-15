import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpDown, ChevronDown, ChevronRight, Search } from 'lucide-react'
import type { Order, Patient } from '../../../shared/types'
import { PersonaHeader } from '@/components/PersonaHeader'
import { EmptyState } from '@/components/EmptyState'
import { SpendBar } from '@/components/CostSpendBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  COST_APPROVAL_THRESHOLD_USD,
  mockHcpcsPricing,
  mockPatientCostOfCare,
} from '@/lib/mocks'

interface CostData {
  orders: Order[]
  patients: Patient[]
}

function loadCost(): Promise<CostData> {
  return Promise.all([
    api.get<Order[]>('/api/orders'),
    api.get<Patient[]>('/api/patients'),
  ]).then(([orders, patients]) => ({ orders, patients }))
}

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`

// One priced patient — the shape the table sorts, searches, and totals over.
interface PatientCost {
  patient: Patient
  dme: number
  med: number
  total: number
  /** Any single order clears the DON sign-off threshold. */
  overThreshold: boolean
}

type SortKey = 'name' | 'dme' | 'med' | 'total'
type SortDir = 'asc' | 'desc'

export default function CostOfCareReport() {
  const navigate = useNavigate()
  const { data, failed, reload } = useLive<CostData>(loadCost)

  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expanded, setExpanded] = useState<number | null>(null)

  // Price every patient that actually has orders — an empty cost row helps no one.
  const rows = useMemo<PatientCost[]>(() => {
    if (!data) return []
    const withOrders = new Set(data.orders.map((o) => o.patient_id))
    return data.patients
      .filter((p) => withOrders.has(p.id))
      .map((patient) => {
        const cost = mockPatientCostOfCare(patient.id, data.orders)
        const overThreshold = data.orders.some((o) => {
          if (o.patient_id !== patient.id) return false
          const pricing = mockHcpcsPricing(o.hcpcs_code)
          return pricing != null && pricing.monthly_usd >= COST_APPROVAL_THRESHOLD_USD
        })
        return {
          patient,
          dme: cost.dme_spend_usd,
          med: cost.med_spend_usd,
          total: cost.total_usd,
          overThreshold,
        }
      })
  }, [data])

  // Portfolio totals span every priced patient — never the search-filtered subset,
  // so the header stays a stable read of the whole panel.
  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        dme: acc.dme + r.dme,
        med: acc.med + r.med,
        total: acc.total + r.total,
        overThreshold: acc.overThreshold + (r.overThreshold ? 1 : 0),
      }),
      { dme: 0, med: 0, total: 0, overThreshold: 0 },
    )
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = q
      ? rows.filter((r) => r.patient.name.toLowerCase().includes(q))
      : rows
    const dir = sortDir === 'asc' ? 1 : -1
    return [...matched].sort((a, b) => {
      if (sortKey === 'name') return a.patient.name.localeCompare(b.patient.name) * dir
      return (a[sortKey] - b[sortKey]) * dir
    })
  }, [rows, query, sortKey, sortDir])

  // Click a header: same column flips direction, a new column starts on its natural
  // default (Z→A for money, A→Z for names).
  const sortBy = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  return (
    <div className="space-y-7">
      <PersonaHeader
        title="Cost of care"
        description="Every patient's DME and medication spend in one place — searchable, sortable, and honest about which numbers are real."
        actions={
          <Button variant="outline" className="rounded-xl" onClick={() => navigate('/reports')}>
            Back to reports
          </Button>
        }
      />

      {failed && !data ? (
        <EmptyState
          title="Couldn't load cost of care"
          description="We can't reach the server right now. Nothing is lost — try again in a moment."
          action={
            <Button variant="outline" className="rounded-xl" onClick={reload}>
              Try again
            </Button>
          }
        />
      ) : !data ? (
        <CostSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No patient DME spend yet"
          description="Cost of care appears once a patient has orders."
        />
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

          <PortfolioTotals totals={totals} patientCount={rows.length} />

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
                    Cost of care
                  </div>
                  <CardTitle className="mt-1 text-base text-muted-foreground">
                    {rows.length} {rows.length === 1 ? 'patient' : 'patients'} with DME orders
                  </CardTitle>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search patient…"
                    className="pl-9"
                    aria-label="Search patient by name"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <EmptyState
                  title="No patient matches that search"
                  description={`Nothing found for “${query}”. Try a different name.`}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHead label="Patient" active={sortKey === 'name'} dir={sortDir} onClick={() => sortBy('name')} />
                      <SortHead label="DME" align="right" active={sortKey === 'dme'} dir={sortDir} onClick={() => sortBy('dme')} />
                      <SortHead label="Medication" align="right" active={sortKey === 'med'} dir={sortDir} onClick={() => sortBy('med')} />
                      <SortHead label="Total" align="right" active={sortKey === 'total'} dir={sortDir} onClick={() => sortBy('total')} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const isOpen = expanded === r.patient.id
                      const max = Math.max(r.med, r.dme, 1)
                      return (
                        <Fragment key={r.patient.id}>
                          <TableRow
                            className="cursor-pointer"
                            onClick={() => setExpanded(isOpen ? null : r.patient.id)}
                          >
                            <TableCell className="font-medium text-foreground">
                              <div className="flex items-center gap-2">
                                {isOpen ? (
                                  <ChevronDown className="size-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="size-4 text-muted-foreground" />
                                )}
                                <span>
                                  {r.patient.name}
                                  <span className="block text-xs font-normal text-faint">
                                    {r.patient.market}
                                  </span>
                                </span>
                                {r.overThreshold && (
                                  <Badge variant="destructive" title={`An order clears ${usd(COST_APPROVAL_THRESHOLD_USD)}/mo — needs DON sign-off`}>
                                    over ${COST_APPROVAL_THRESHOLD_USD}/mo
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{usd(r.dme)}</TableCell>
                            <TableCell className="text-right tabular-nums">{usd(r.med)}</TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">{usd(r.total)}</TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={4} className="bg-muted/30">
                                <div className="space-y-4 px-2 py-3">
                                  <SpendBar
                                    label="Medication (BetterRX)"
                                    amount={r.med}
                                    width={r.med / max}
                                    color="bg-secondary"
                                    source="synthetic"
                                  />
                                  <SpendBar
                                    label="DME equipment"
                                    amount={r.dme}
                                    width={r.dme / max}
                                    color="bg-primary"
                                    source="CMS"
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              )}

              <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Where these come from.</span> DME is
                priced from the real CMS Medicare DMEPOS Public Use File — average allowed amount per
                HCPCS code, plus a synthetic $35 setup fee. Medication spend is synthetic: hospice
                drugs for the terminal diagnosis are paid inside the Medicare per-diem, so no public
                per-patient figure exists to source it from.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// --- Portfolio totals ---------------------------------------------------------

function PortfolioTotals({
  totals,
  patientCount,
}: {
  totals: { dme: number; med: number; total: number; overThreshold: number }
  patientCount: number
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl bg-primary p-6 text-primary-foreground shadow-[0_1px_2px_rgba(38,50,64,.04),0_14px_34px_-20px_rgba(38,50,64,.20)]">
        <div className="font-display text-4xl font-extrabold tabular-nums tracking-tight">
          {usd(totals.total)}
        </div>
        <div className="mt-1.5 text-sm font-semibold">total cost of care</div>
        <div className="mt-1 text-xs text-primary-foreground/80">
          across {patientCount} {patientCount === 1 ? 'patient' : 'patients'}
        </div>
      </div>
      <TotalCard value={usd(totals.dme)} label="DME equipment" source="CMS" />
      <TotalCard value={usd(totals.med)} label="Medication (BetterRX)" source="synthetic" />
      <TotalCard
        value={String(totals.overThreshold)}
        label={`patients over $${COST_APPROVAL_THRESHOLD_USD}/mo`}
        tone={totals.overThreshold > 0 ? 'risk' : undefined}
      />
    </div>
  )
}

function TotalCard({
  value,
  label,
  source,
  tone,
}: {
  value: string
  label: string
  source?: 'CMS' | 'synthetic'
  tone?: 'risk'
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        {source && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
              source === 'CMS' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
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
        <div
          className={`mt-3 font-display text-4xl font-extrabold tabular-nums tracking-tight ${
            tone === 'risk' ? 'text-destructive' : 'text-foreground'
          }`}
        >
          {value}
        </div>
        <div className="mt-1.5 text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  )
}

// --- Sortable header cell -----------------------------------------------------

function SortHead({
  label,
  align,
  active,
  dir,
  onClick,
}: {
  label: string
  align?: 'right'
  active: boolean
  dir: SortDir
  onClick: () => void
}) {
  return (
    <TableHead className={align === 'right' ? 'text-right' : undefined}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${active ? 'text-foreground' : ''}`}
      >
        {label}
        <ArrowUpDown className={`size-3 ${active ? 'opacity-100' : 'opacity-40'}`} />
        {active && <span className="sr-only">{dir === 'asc' ? 'ascending' : 'descending'}</span>}
      </button>
    </TableHead>
  )
}

// --- Loading skeleton ---------------------------------------------------------

function CostSkeleton() {
  return (
    <div className="space-y-7">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}
