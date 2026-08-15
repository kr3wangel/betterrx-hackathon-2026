# Fleet Capacity & Current Load — Design Spec

> **STATUS: SPEC'D, NOT BUILT** (2026-08-15). Team decision: tackle bounty req V1 ("Fleet and
> route capacity, service area, and current load") on the vendor portal. This spec is the
> agreed shape; `docs/BOUNTY-REQS.md` V1 tracks the requirement. Authority ordering: this doc →
> `SMS-BATCHING-SPEC.md` (the stop/trip concept it builds on) → code as it stands.

## 1 · Reading the requirement

The sponsor's vendor-side list is a **profile** — what the platform should *know* about a vendor —
not an app to build. "Fleet and route capacity, service area, current load" are attributes of the
vendor **business**, owned by the **dispatcher** (the driver's slice of the vendor side is V3,
proof-of-capture, already built). For a rolodex vendor with no software:

- **Route capacity** is not routing. It is a number the dispatcher knows in their gut: *"we can
  take N stops today."* Our job is to capture that number as cheaply as we capture an
  acceptance — one tap, no login — never to compute it.
- **Current load** is not a dashboard. It is what the ledger already knows: the orders a vendor
  still owes something on, spoken in the vendor's own unit — **stops** (household × direction),
  the unit trip batching already established.
- **Service area** already exists on the vendor record and in every text's area line.

One data model, two consumers: the dispatcher supplies capacity and sees their day in stops on
`/portal/:token`; the hospice consumes load-vs-capacity **at the moment of vendor choice**
(the swap dialog and the order form's vendor field), next to the on-time history that already
lives there. Reputation and load as decision inputs, not reports.

## 2 · The invariant

> **Capacity is the vendor's word.** It is declared, not verified — grey-tier data in the same
> evidence register as an unproven "delivered." It can inform a hospice's choice; it must never
> gate one. No declaration, or a stale one, degrades to "no capacity signal," never to a block.

Consequences, non-negotiable:
1. Ordering/swapping to a "full" vendor stays possible — the UI says *"says they're full today"*
   and lets the human decide. The hospice outranks the declaration.
2. Capacity never touches the state machine, the risk score (v1 — see §9.3), the silence ladder,
   or any escalation. It is a display input only.
3. The ledger-derived side (load, stops, overdue) is **our** count and renders as fact; the
   declared side (capacity) renders as the vendor's claim. Never blend them into one number.

## 3 · Data model (schema change — needs the `db:reset` team ping)

```sql
-- Declared stop capacity for one vendor-day. Absent row = no declaration.
CREATE TABLE IF NOT EXISTS vendor_capacity (
  vendor_id  INTEGER NOT NULL REFERENCES vendors(id),
  day        TEXT NOT NULL,          -- 'YYYY-MM-DD', server-local demo day
  stops      INTEGER NOT NULL,       -- 0 is a valid declaration ("no trucks today")
  declared_at TEXT NOT NULL,
  PRIMARY KEY (vendor_id, day)
);
```

No column on `vendors`, no default capacity: a default would render as data we invented, and an
absent declaration is itself information ("this vendor doesn't tell us"). Seed: Wasatch and
Canyon declare today (profiles get a `stops_per_day` seed input); Beehive **never declares** —
the same vendor that fudges deliveries is the one that doesn't share capacity, which keeps the
demo story coherent; Timpanogos is cold-start and declares nothing until tapped.

**Derived, not stored — `vendorLoad(vendorId, day)` in `server/portal.ts` (or a sibling):**
- `open_stops`: `portalOrders(vendorId)` grouped by `(patient_id, direction)` where direction is
  pickup for `pickup_pending/pickup_overdue`, delivery otherwise. The trip unit, reused.
- `due_today_stops`: stops containing an order with `target_at` today or any overdue pickup.
- `capacity`: today's `vendor_capacity` row or null.
- Exposed on the existing portal payload and on a small `GET /api/vendors/load` for the hospice
  side (one call for all vendors — the swap dialog already fetches comparable per-vendor data).

## 4 · The portal: the dispatcher's day (`/portal/:token`)

A **"Today"** strip above the existing order list — additive; nothing below it moves:

- **Load, as fact:** `4 stops open · 2 due today · 1 pickup overdue` — counts from
  `vendorLoad()`, each stop labeled area + item count (*"Ogden · 2 items"*). **No patient names,
  no addresses** — the portal today never renders a patient name in the order list and this strip
  must not be the first thing that does. PHI grammar is the texts' grammar: area only.
- **Capacity, as their word:** *"How many stops can you take today?"* with a stepper
  (`− N +`, Save) — the `act()` pattern verbatim: optimistic, toast on save ("The hospice can
  see your capacity"), rollback + error toast on failure. Pre-filled with today's declaration if
  one exists. One tap-ish, no login, same doctrine as Confirm.
- When declared: *"Today: 2 of 5 stops taken"* (taken = due-today stops, our count, against their
  number — labeled *"5 is your number; the stop count is ours"* in the fine print, per §2.3).

**Writes:** `POST /api/portal/:token/capacity { stops }` → upsert today's row → broadcast. The
SSE frame is a new `ServerEvent` variant `{ type: 'vendor_capacity', vendor_id }` (mind the
`DistributiveOmit` gotcha in `server/sse.ts`); `isNarratableType()` returns **false** for it,
pinned by a test — a capacity edit must never toast the board.

## 5 · The hospice side: load at the moment of choice

Two call sites, both already rendering per-vendor decision lines:

1. **SwapVendorDialog** — under each alternative's on-time line, one load line:
   *"3 stops open · says they can take 2 more today"* / *"3 stops open · says they're full
   today"* / *"3 stops open · no capacity signal"* (undeclared). Beehive-style undeclared reads
   exactly that blunt — it pairs with the trust gap in the pitch.
2. **Order form vendor field** — same line, same wording, in the combobox option or under it.

No new colors: the load line is muted text; "says they're full" gets the existing amber/warn
token at most. **Never a disabled option** (§2.1).

## 6 · What we deliberately do NOT build

- **No routing, maps, truck entities, or driver assignment** — DME-ERP theater no cold-start
  vendor could feed; exactly what FAQ §6 punishes. A route is "the truck goes out and comes
  back"; capacity is one number.
- **No capacity-aware auto-assignment or auto-refusal** — see §2.
- **No historical capacity analytics** (declared-vs-actual would be a *great* trust-gap sibling —
  recorded as future work in §9, not built: it needs weeks of declarations to be honest).
- **No driver-side changes.** `/driver` is untouched.

## 7 · Implementation sketch

- `shared/types.ts`: `VendorLoad` interface (`open_stops`, `due_today_stops`,
  `overdue_pickups`, `capacity: number | null`, `declared_at: string | null`), the
  `vendor_capacity` ServerEvent variant. Types first, per the contract rule.
- `server/`: table DDL in `db.ts`; `vendorLoad()` + `declareCapacity()` (portal-token-scoped,
  same ownership check as `portalConfirm`); routes `GET /api/vendors/load`,
  `POST /api/portal/:token/capacity`; seed declarations per vendor profile.
- **Tested (TDD):** `vendorLoad()` stop grouping (two orders, one household, one direction = one
  stop; delivery + pickup same household = two stops — the §10.5 cross-direction rule), due-today
  math, capacity upsert + ownership rejection, narration mute for the new event type, seed
  declarations present/absent per profile.
- Client (test-free): the portal Today strip + capacity stepper; the two hospice load lines.
- Docs same-commit: `FEATURES.md` (§1 rows), `UX-FLOWS.md` if any nav/arrow changes (expect
  none — all in-page), `BOUNTY-REQS.md` V1 → BUILT-with-scope-note, SLIDES show-off inbox line.
- Parallelization: server+types agent first (small), then portal-UI and hospice-UI agents in
  parallel (disjoint files), docs folded into whichever finishes last or a third micro-agent.

## 8 · Demo & pitch integration

- **Not a new script beat** — the 5:00 is full. It's a **glance**: scenario 3 already opens the
  portal; the Today strip is simply *visible* there, and the presenter loses zero seconds.
- **Q&A pocket** (BOUNTY-REQS V1 row updates to point here): *"Capacity is the vendor's word —
  declared with one tap on the same no-login portal, shown to the case manager right next to the
  vendor's track record when they're choosing. We count the stops; the vendor claims the
  capacity; the screen never confuses the two. Routing engines are for fleets with APIs — our
  vendors have a dispatcher with a gut number, so that's what we capture."*
- The undeclared-Beehive detail is deliberate pitch texture: the vendor whose word outruns their
  PODs is also the one that won't say how many trucks they have.

## 9 · Open questions (build-time, not blockers)

1. Does the group-pickup text mention capacity ("this makes 5 of 5 for today")? Lean no — texts
   stay minimal; the portal is the workspace.
2. Should `due_today_stops` count undated pickups? Lean yes (a triggered pickup is implicitly
   "as soon as you can"), matching the pickup-overdue clock's spirit.
3. **Future, explicitly parked:** capacity declared-vs-actual as a "Verified vs. claimed" row
   (does a vendor who says 5 ever do 2?); capacity as a risk-engine input. Both need history the
   demo can't honestly have.
