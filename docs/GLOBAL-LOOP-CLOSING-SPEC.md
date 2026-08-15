# Global Loop Closing — Design Spec

The app has every component and still doesn't feel finished, because **it never closes a loop**. Three
symptoms, one diagnosis:

- **SSE changes render silently.** `useLive()` refetches on every event and the DOM quietly swaps a
  pill. Nobody in the room — including the presenter — knows something happened until they notice a
  word changed. The system's whole claim is *it works while you aren't watching*, and the one moment
  it proves that is the one moment it says nothing.
- **Actions dead-end.** Thirteen mutating controls produce **no visible response at all** (§3.1), and
  of the nine actions that do speak, exactly one hands the user a route to the consequence.
- **There is no front door.** `/` is a `<Navigate to="/hospice" replace />`. The product has no name
  on screen, no promise, and no way in that isn't a nav tab.

Three features fix it: **live event narration**, **action handoffs**, and a **landing page**. All three
are client-only. None of them adds a feature; all three make the features that exist legible.

Design constraints throughout: `docs/DESIGN-SYSTEM.md` (tokens, restraint, plain-English vocabulary),
Sonner as the only toast system, plain English everywhere, UI test-free per repo convention **except**
the narration decision logic, which is a pure function with its own test file (§2.9).

---

## 0 · Deviations from the brief's assumptions

The brief for this spec made assumptions the codebase contradicts. The codebase wins; here is where.

1. **`risk_updated` is not a `ServerEvent` type.** It is an `OrderEventType` (`shared/types.ts:22`)
   that arrives *inside* the `order_event` variant. The brief's "which event types narrate … and
   which NEVER do (heartbeat, `risk_updated`)" is still exactly the right rule — it just lives one
   level down, in the `event_type` field, not in `ServerEvent['type']`. The noise concern is real and
   confirmed: `watchdog.ts:77-79` applies `risk_updated` on **every score change, every 30s tick,
   per order**, and `applyEvent()` broadcasts unconditionally (`statemachine.ts:76`).

2. **`heartbeat` is never broadcast.** It is in the union (`shared/types.ts:242`) and there is not a
   single `broadcast({ type: 'heartbeat' })` anywhere in `server/`. The "never narrate heartbeat" rule
   stays in the code as a defensive `switch` arm, but it is dead today. Do not spend effort on it and
   do not claim it in the pitch.

3. **The `order_event` SSE payload carries no `actor`.** It is
   `{ type, at, order_id, event_type, state }`. So the brief's "vendor/family/driver-actor
   `order_events` narrate" **cannot be implemented as written** without widening the payload.
   **Decision: don't widen it.** §2.3 shows that filtering by `event_type` plus the own-action
   suppression registry (§2.5) covers every case the actor filter would have covered, and §2.4 shows
   that the two places where actor *would* have changed the wording — was this delivery a POD or a
   vendor claim? did the family confirm it? — are already derivable from `Order.delivery_verified`
   and `Order.family_confirmed`, which are stronger signals than the actor anyway. Zero server change.

4. **A client-side test at `client/src/lib/narration.test.ts` would never run.** `vitest.config.ts`
   is `include: ['tests/**/*.test.ts']`, rooted at `tests/`, `.ts` only, node environment, no path
   aliases, no jsdom, no `@testing-library/*` installed. **But the precedent the brief asked me to
   check does exist:** `tests/at-risk.test.ts:7` imports `../client/src/lib/atRisk` directly, because
   `atRisk.ts` is deliberately React-free and node-safe. **So: the pure module lives at
   `client/src/lib/narration.ts` (as the brief locked) and its test lives at `tests/narration.test.ts`
   (as the runner requires), importing it by relative path.** Two consequences bind the
   implementation: `narration.ts` must import **nothing** from React, `sonner`, or `@/…` (the alias
   does not resolve under vitest), and it must not touch `window`.

5. **`JobCompleteCard` is an exemplar of the wrong half.** The brief cites
   `client/src/pages/Driver.tsx:200-230` as the pattern to copy. It is excellent, but it contains **no
   `navigate()`, no `<Link>`, and no toast** — it is an *in-page receipt* that surfaces another
   surface's consequence inline (it literally quotes the SMS the family received). The actual
   cross-page handoff exemplar in this repo is `client/src/pages/Order.tsx:120-123`, the only
   `toast(… { action })` in the codebase. **Both are exemplars, of different halves**, and §3 cites
   them separately: *JobCompleteCard = show the consequence where you are; Order.tsx = offer the road
   to where it lives.*

6. **The "ONE live signal" the design system protects was never built.** `DESIGN-SYSTEM.md:61` reserves
   the single sanctioned motion for "the at-risk pulse dot," and
   `docs/design/hospice-board-reference.html:87-88,144` has the reference CSS for it — but
   `Hospice.tsx`'s `SectionTitle` (lines 133-153) renders no pulse dot, and a full grep of `client/src`
   finds **zero** `prefers-reduced-motion` handling and zero custom keyframes outside the phone
   simulators. So the acknowledgment pulse in §2.7 would be the **first** motion signal on the board,
   not the second. §2.7 reconciles the rule anyway, because the pulse dot may still get built.

7. **`/caregiver` and `/vendor-phone` have no `<Toaster />` at all.** Both render outside `Shell` and
   outside `PortalShell` (`App.tsx:146-147`), and `<Toaster />` is mounted only at `App.tsx:191`
   (PortalShell) and `App.tsx:262` (Shell). The brief's "no toasts on the phone-simulator chrome" is
   therefore **already structurally true** — a stray `toast()` there would silently no-op. The rule
   costs nothing to honor: mount the narration hook inside `Shell()` only (§2.2).

8. **No `useSearchParams`, no `useLocation`, and no router `state` exists anywhere in the client.**
   Every one of the four `navigate()` calls is a bare path. So the highlight-handoff mechanism (§3.2)
   is greenfield either way, and the choice between router state and a query param is made on merit,
   not on precedent.

9. **`Reports.tsx` Approve/Deny is not a mutation.** `Reports.tsx:473-474` sets local state against
   `mockApprovals` with no API call at all (the file says so at line 465). It appears in the §3
   inventory for completeness and is explicitly **out of scope** — a handoff from a fake action would
   be the one dishonest thing in this spec.

10. **`EVENT_TYPE_LABEL` is missing `family_confirmed`** (`client/src/lib/domain.ts:56-69`), so
    `eventLabel('family_confirmed')` falls through to `"family confirmed"`. One line, fixed in this
    branch (§2.4 needs the label anyway).

---

## 1 · Feature summary

| # | Feature | One line | Server change |
|---|---|---|---|
| 1 | **Live event narration** | When something meaningful happens, the surface you're on says so in a sentence and the affected row acknowledges it. | **None** |
| 2 | **Action handoffs** | Every action lands somewhere its consequence is visible. | **None** |
| 3 | **Front door** | `/` becomes a named landing that picks a persona and takes you to their screen. | **None** |

They share one primitive — the **row acknowledgment** (§2.7) — which is why they are one spec and one
branch. Narration pulses a row that changed under you; a handoff pulses the row you just created. Same
1.6s ring, same context, same reduced-motion rule.

---

## 2 · Live event narration

### 2.1 The shape

```
SSE event ──▶ cheap filter (no data needed) ──▶ queue + 250ms debounce
                    │ fails                          │
                    └─▶ nothing happens              ▼
                       (no fetch, no toast)     fetch world snapshot
                                                     │
                                                     ▼
                                          decideNarration() per event   ← PURE, tested
                                                     │
                                                     ▼
                                          collapseNarrations()          ← PURE, tested
                                                     │
                                        ┌────────────┴────────────┐
                                        ▼                         ▼
                                  toast (Sonner)          pulse(orderId)
```

Two properties are load-bearing:

- **The cheap filter runs first, so a `risk_updated` storm costs zero fetches.** Deciding *whether* to
  narrate needs only the event; deciding *what to say* needs names. Splitting them is what keeps the
  watchdog from turning every 30s tick into four extra HTTP requests.
- **The world snapshot is fetched *after* the event, so it is fresh.** This is the answer to the
  enrichment problem (§2.2) and it also disposes of the new-order edge case for free: an
  `order_placed` for an id nobody has ever seen resolves, because we fetch after we hear about it.

### 2.2 Enrichment: client-side lookup, not a wider payload

Events carry ids. `Order` has `patient_id` and `vendor_id` and **no names**
(`shared/types.ts:61-79`); names live on `Patient.name` and `Vendor.name`. So a sentence needs a join.

**Decision: join on the client, from a snapshot the narration hook fetches itself. No server change.**

The hook, mounted once in `Shell()`, fetches on demand (not via `useLive`, deliberately — see below):

| Call | Gives us |
|---|---|
| `GET /api/orders` | `equipment_name`, `state`, `patient_id`, `vendor_id`, `delivery_verified`, `family_confirmed` |
| `GET /api/patients` | `name` |
| `GET /api/vendors` | `name` |
| `GET /api/escalations?status=open` | `reason` for the escalation toast's description *(cuttable — §6)* |

All four already exist and `Hospice.tsx:14-18` already fires the identical set on every event.

**Why not widen the broadcast payload.** Three reasons, in ascending order of seriousness:

1. `ServerEvent` is consumed through the `DistributiveOmit` in `server/sse.ts:18-20` — the documented
   `CLAUDE.md` gotcha — and widening it means touching `shared/types.ts`, the omit, and the broadcast
   call site. That is *small*, so it is not the argument.
2. It would put display names in two places. `STATE_LABEL` / `eventLabel()` already establish that
   plain-English rendering is a client concern (`client/src/lib/domain.ts`); a name baked into an SSE
   payload is a second source of truth for a string the client can already compute.
3. **It would push patient names onto every open EventSource, including other personas' devices.**
   `server/sse.ts:4` holds **one** `Set<Response>` and `broadcast()` writes the same bytes to every
   subscriber — there is no per-client filtering and no auth on `/api/events`. The vendor portal
   (`PortalShell`, `App.tsx:173`) and both phone simulators hold open streams. Today the payload is
   ids only, which is minimum-necessary by accident but correct, and matches the PHI discipline
   `SMS-SIM-SPEC.md §3.2` designed into the message templates. **Client-side lookup keeps that
   property; widening the payload would silently break it.** This is the decisive reason.

The counter-argument, stated honestly: the lookup costs up to four extra GETs per *narratable* event,
and on a page that already fires five, that is real. It is bounded by the cheap filter (most events
never get there), by the 250ms debounce (a burst is one fetch), and by `?quiet=1` (§2.10), which skips
the fetch entirely. If it ever bites, the fix is a shared snapshot cache — not a wider payload.

**Why not `useLive`.** `useLive` refetches on *every* event unconditionally, which defeats the cheap
filter. The hook does its own `Promise.all([...])` behind a debounce, triggered only when the queue is
non-empty. It also gets the "narrate nothing on first load" property for free — the queue is empty at
mount, so no snapshot is ever fetched until something actually happens.

### 2.3 Noise rules — which events narrate

This table is the feature. Everything else is plumbing.

**`ServerEvent.type` level:**

| `type` | Narrate? | Why |
|---|---|---|
| `heartbeat` | **NEVER** | Not a fact about the world. (Also never broadcast — §0.2.) |
| `order_event` | **Depends on `event_type`** — table below | |
| `escalation` | **ALWAYS** | This is the "Ruth's pickup is overdue — escalated" toast. It is the single most demo-load-bearing narration and the one the board's own "Needs you" section exists for. |
| `message` | **NEVER** | Every inbound that *means* something also produces an `order_event`, which narrates; narrating both would double every scenario-3 beat. An inbound that means nothing is a review-queue item, and the board already carries a live count for that (`Hospice.tsx:56-66`). Revisit only if the review queue proves invisible in rehearsal (§6). |

**`order_event.event_type` level:**

| `event_type` | Narrate? | Reasoning |
|---|---|---|
| `risk_updated` | **NEVER** | `watchdog.ts:77-79` fires it on every score delta, every 30s, per order. It is the single loudest event in the system and the only one with no human on either end. The board's risk badges already show the state continuously; a toast adds nothing and would bury everything else. **This one rule is the difference between "reflexes" and "a broken smoke alarm."** |
| `family_notified` | **NEVER** | Always fires in the same instant as the `delivered` / `picked_up` event that already narrates (`routes.ts` POD route). Narrating both turns one real thing into "2 updates." |
| `order_placed` | Yes | |
| `vendor_accepted` | Yes | |
| `eta_set` | Yes | |
| `out_for_delivery` | Yes | |
| `delivered` | Yes | wording branches on `delivery_verified` (§2.4) |
| `pickup_triggered` | Yes | |
| `pickup_overdue` | Yes | |
| `picked_up` | Yes | |
| `vendor_swapped` | Yes | |
| `cancelled` | Yes | |
| `family_confirmed` | Yes | the household-answered beat; §2.4 |

Rule of thumb for anyone adding an event type later, so this table doesn't have to be re-litigated:
**narrate an event if a human caused it or a human needs to act on it. `risk_updated` is neither — the
machine recomputes constantly and the answer is already on screen. The system nags maybe once.**

### 2.4 The sentences

Plain English, `docs/DESIGN-SYSTEM.md` vocabulary, never a raw state name, never an HCPCS code.

Helpers in `narration.ts`:

- `shortEquipment(name)` — text before the first comma, lowercased. `"Hospital bed, semi-electric"` →
  `"hospital bed"`. Toast titles must fit one line on a projector.
- `firstName(name)` — text before the first space. `"Frank Delacroix"` → `"Frank"`. The board shows
  full names; a toast is conversational.
- Unresolvable name → the sentence degrades to `"Order #1042"` rather than being dropped. A toast that
  says less is better than a beat that vanishes on stage.

| Event | Title | Tone |
|---|---|---|
| `order_placed` | `New order for Frank — hospital bed` | neutral |
| `vendor_accepted` | `Beehive accepted Frank's hospital bed` | good |
| `eta_set` | `Beehive set an ETA for Frank's hospital bed — Thu 2:00 PM` | neutral |
| `out_for_delivery` | `Frank's hospital bed is on the truck` | neutral |
| `delivered`, `delivery_verified` | `Frank's hospital bed was delivered — signed for` | good |
| `delivered`, not verified | `Beehive says Frank's hospital bed was delivered` | neutral |
| `family_confirmed` | `Frank's family confirmed the hospital bed arrived` | good |
| `pickup_triggered` | `Pickup requested for Ruth's hospital bed` | neutral |
| `pickup_overdue` | `Ruth's pickup is overdue` | alert |
| `picked_up` | `Ruth's hospital bed was picked up` | good |
| `vendor_swapped` | `Frank's hospital bed moved to Wasatch` | neutral |
| `cancelled` | `Frank's hospital bed order was cancelled` | neutral |
| `escalation` | `<state sentence> — escalated`, e.g. `Ruth's pickup is overdue — escalated` | alert |

`description` is `null` for everything except `escalation`, which carries the escalation's own
`reason` (already a human sentence by design — `server/risk.ts`), truncated at 120 chars.

Two of these are only possible because of the post-refetch snapshot (§2.1), and they are the two the
brief expected an `actor` field to provide:

- **`delivered` splits on `Order.delivery_verified`** — the `EXISTS` over `pods` in
  `server/store.ts:25`. That is a *stronger* discriminator than actor: it says whether a photo and a
  signature exist, not who typed the event. It also keeps the toast honest with
  `EvidenceBadge` and `DESIGN-SYSTEM.md:71` ("a vendor's text must never render like proof") — the
  toast wording carries the same three-level evidence distinction the board does.
- **`family_confirmed`** reads `Order.family_confirmed` (`store.ts:27`) and needs no actor at all.

`tone` maps to nothing visual in v1 beyond duration — see §2.8. It exists so the pure function's
output is complete and so a later coral/green/red treatment is a CSS change, not a logic change.

### 2.5 Suppressing your own action

The user who just clicked something already got an action toast (§3). Narrating the resulting event
would double it. The mechanism is a **short-lived expectation registry**, deliberately kept out of the
pure module so `narration.ts` stays testable.

`client/src/lib/expectedEvents.ts` — module singleton, ~25 lines, no React:

```ts
export type ExpectKey = `order:${number}` | `patient:${number}`

export interface Expectation {
  key: ExpectKey
  types: OrderEventType[] | null   // null = suppress every event type for this key
  until: number                    // epoch ms
}

/** Call immediately BEFORE the POST, never after — see the race note below. */
export function expectOwn(keys: ExpectKey[], opts?: { types?: OrderEventType[]; ms?: number }): void

/** Live view, pruned of expired entries. Passed into decideNarration() as data. */
export function activeExpectations(now: number): Expectation[]
```

Default window **6000ms**. `decideNarration()` resolves the event's `order_id` to an order, reads
`order.patient_id`, and suppresses if either `order:<id>` or `patient:<patient_id>` is live and the
`types` filter (if any) matches.

**Two keys, because two shapes of action exist:**

| Shape | Key | Example |
|---|---|---|
| I know the order id before I click | `order:<id>` | vendor swap, driver POD, portal confirm, board nudge |
| I only learn the order ids from the response | `patient:<id>` | nurse status change (fires pickups on N orders), placing a new order |

**Register before the POST, not after.** `applyEvent()` broadcasts *inside* the request handler
(`statemachine.ts:76`), before the HTTP response is written. The SSE frame and the response race, and
on a local demo the SSE frame usually wins. Registering in `.then()` is a coin flip; registering
before `await api.post(...)` is deterministic. This is the one implementation detail that will look
wrong in review and isn't.

**Known over-reach, accepted:** `patient:<id>` also suppresses an unrelated vendor action on a second
order for the same patient inside the 6s window. Rare, and 6s. Where it matters, narrow it — the nurse
call passes `{ types: ['pickup_triggered'] }` so a vendor accepting inside the window still narrates.

### 2.6 Rate cap and collapse

Both degrade gracefully; both are the first things cut (§6).

- **Collapse (batch-scoped, pure).** Within one drained batch, group by `order_id`. Two or more →
  one toast: `3 updates on Frank's hospital bed`. This lives in `collapseNarrations()` and is
  covered by tests.
- **Rate cap (rolling, in the hook).** At most **3** narration toasts per rolling **8s**. The 4th and
  beyond collapse into a single toast rendered with a fixed Sonner id, `'narration-overflow'`, so
  repeated overflow *updates one toast in place* rather than stacking: `4 more updates on the board`.
  Pulses are **not** rate-capped — they cost no screen space and a silent row acknowledgment is never
  noise.

### 2.7 The row acknowledgment, and the "ONE live signal" rule

**Reconciliation.** `DESIGN-SYSTEM.md:61` reads "Motion: restrained. One live signal (the at-risk
pulse dot). Respect `prefers-reduced-motion`." The rule is about how many things are *continuously*
animating in a resting screen. The acknowledgment is a different category: **one-shot, 1.6s, never
repeats, and gone before the eye returns.** Proposed amendment to that line, to be made in the same
commit:

> **Motion**: restrained. One *persistent* live signal (the at-risk pulse dot) and one *transient*
> one: a 1.6s row acknowledgment when something changes under you. Nothing else animates. Respect
> `prefers-reduced-motion`.

Two hard constraints follow: the acknowledgment must never run on an element that is already carrying
the persistent pulse, and no element may acknowledge twice inside one animation (re-triggering
restarts the timer instead of stacking).

Per §0.6, the persistent pulse doesn't exist yet, so today the acknowledgment is the only motion on
the board. That is *more* reason to keep it disciplined, not less.

**Implementation.** A context, mounted in `Shell()` so it can't leak to the phone simulators:

- `client/src/lib/highlight.tsx` — `HighlightProvider` + `useHighlight()` →
  `{ pulse(orderId: number): void; isPulsing(orderIds: number[]): boolean }`. State is a
  `Map<number, timeoutId>`; `pulse()` on a live id clears and restarts the timer.
- Consumed **directly** by the row, not prop-drilled: `BoardRow.tsx` adds
  `const acked = useHighlight().isPulsing(row.orders.map(o => o.id))` and appends `'row-ack'` to the
  outer `div`'s `cn(...)` at `BoardRow.tsx:46-51`. Taking an array is not incidental —
  `board.ts:136,154` keys grouped rows `p<patientId>` with **several orders inside one row**, so
  "highlight order 1042" has to mean "highlight the row containing 1042."
- Driver job cards get the same treatment (that is where the nurse handoff lands, §3.2).

**CSS**, added to `client/src/index.css` (which today has zero custom keyframes — `tw-animate-css`
supplies only Radix enter/exit):

```css
@keyframes row-ack {
  0%   { box-shadow: 0 0 0 0 rgba(226,123,94,.55); }
  70%  { box-shadow: 0 0 0 7px rgba(226,123,94,0); }
  100% { box-shadow: 0 0 0 0 rgba(226,123,94,0); }
}
.row-ack { animation: row-ack 1.6s ease-out 1; }

@media (prefers-reduced-motion: reduce) {
  .row-ack { animation: none; background-color: var(--coral-tint); }
}
```

Coral (`#E27B5E`, `--primary`) because the acknowledgment means *look here*, and coral is already the
attention token; red is reserved for "will miss a deadline." Under reduced motion the ring becomes a
flat coral-tint wash held for the same 1.6s by the same JS timer — the information survives, the
motion doesn't. **This is the first `prefers-reduced-motion` handling in the client** (§0.6).

### 2.8 Toast mechanics

- **`toast(title, { description, duration })` — never `toast.error`** for narration. Sonner gives
  default/success toasts `role="status"` inside its `aria-live="polite"` region and reserves
  `role="alert"` for errors; an escalation is urgent but it is not an error, and an assertive
  interrupt every time the watchdog fires would be hostile to a screen reader. **This is how the
  aria-live-polite requirement is met** — by choosing the right Sonner call, not by adding markup.
  Verify the rendered region carries `aria-live="polite"` once at build time; if the installed
  version differs, that is a one-line prop on the `<Toaster />` wrapper
  (`client/src/components/ui/sonner.tsx`), not a redesign.
- Duration: **4000ms** (Sonner's default, which no existing call site overrides) for everything except
  `tone: 'alert'`, which gets **6000ms**.
- No `action` button on narration toasts. Narration is ambient; the row already pulsed, and a button
  on an unrequested toast is a trap for a presenter's mouse.
- Position stays `top-right` per `client/src/components/ui/sonner.tsx`. **Do not change it** — §5 has
  the presenter's answer for occlusion and it is not a layout change.

### 2.9 The pure module and its test file

**`client/src/lib/narration.ts`** — React-free, DOM-free, `sonner`-free, relative imports only (§0.4).

```ts
import type { Escalation, Order, OrderEventType, Patient, ServerEvent, Vendor } from '../../../shared/types'
import type { Expectation } from './expectedEvents'

export interface NarrationWorld {
  orders: Order[]
  patients: Patient[]
  vendors: Vendor[]
  escalations: Escalation[]
}

export type NarrationTone = 'neutral' | 'good' | 'alert'

export type SuppressReason = 'muted_type' | 'own_action' | 'not_narratable'

export type NarrationDecision =
  | { narrate: false; reason: SuppressReason }
  | { narrate: true; orderId: number; title: string; description: string | null; tone: NarrationTone }

export interface NarrationToast {
  title: string
  description: string | null
  tone: NarrationTone
  pulseOrderIds: number[]
}

/** Phase 1 — cheap, data-free. Answers "could this ever narrate?" so the hook can skip the fetch. */
export function isNarratableType(event: ServerEvent): boolean

/** Phase 2 — the whole decision, given a fresh world and the live expectations. Pure. */
export function decideNarration(
  event: ServerEvent,
  world: NarrationWorld,
  expectations: Expectation[],
  now: number,
): NarrationDecision

/** Batch-scoped collapse. Same order twice or more → one "3 updates on …" toast. Pure. */
export function collapseNarrations(decisions: NarrationDecision[]): NarrationToast[]

export function shortEquipment(equipmentName: string): string
export function firstName(fullName: string): string
```

`now` is a parameter, not `Date.now()`, for the same reason `buildBoard(…, now = new Date())` takes
one — the tests must not be clock-dependent.

**`tests/narration.test.ts`** — `import { … } from '../client/src/lib/narration'`, matching
`tests/at-risk.test.ts:7`. No `seedFixtures`, no DB: this suite builds plain object literals. It is the
cheapest test file in the repo and the only one guarding the rule that makes or breaks the feature.

Cases:

*Noise rules (the ones that matter most)*
- `isNarratableType` is `false` for `{ type: 'heartbeat' }` and `{ type: 'message' }`, `true` for
  `escalation` and for an `order_event`.
- `decideNarration` on `event_type: 'risk_updated'` → `{ narrate: false, reason: 'muted_type' }`.
  **Write this one first.**
- `event_type: 'family_notified'` → `muted_type`.
- Every other `OrderEventType` produces `narrate: true` — asserted by iterating the union, so adding
  a type later fails this test instead of silently going unnarrated.

*Enrichment*
- `vendor_accepted` with a resolvable world → title exactly
  `"Beehive accepted Frank's hospital bed"`. Pins `shortEquipment` and `firstName` together.
- Unknown `patient_id` → title falls back to `"Order #1042"`, still `narrate: true`.
- Unknown `order_id` entirely → `{ narrate: false, reason: 'not_narratable' }`.
- `delivered` with `delivery_verified: true` contains `"signed for"`; with `false` it names the vendor
  and does **not** contain `"signed for"`. *(The evidence-honesty assertion — pairs with
  `tests/evidence.test.ts`.)*
- `escalation` → `tone: 'alert'`, `description` is the matching escalation's `reason`; an
  `escalation_id` absent from `world.escalations` still narrates with `description: null`.

*Suppression*
- `order:1042` expectation live → `{ narrate: false, reason: 'own_action' }`.
- Same expectation with `until` in the past → narrates. *(Proves pruning is by the injected `now`.)*
- `patient:7` expectation live, event on an order belonging to patient 7 → suppressed.
- `patient:7` with `types: ['pickup_triggered']` live, event is `vendor_accepted` → **narrates**.
  *(The §2.5 over-reach guard.)*

*Collapse*
- Three decisions on one order → one toast titled `"3 updates on Frank's hospital bed"`,
  `pulseOrderIds: [1042]`.
- Three decisions on three orders → three toasts, unchanged titles.
- Mixed batch (2 on one order + 1 on another) → two toasts.
- Empty input → `[]`.

*Purity*
- Calling `decideNarration` twice with identical inputs returns deep-equal output and mutates neither
  `world` nor `expectations`.

**No other UI test.** The hook, the provider, the CSS, the Landing page, and every handoff stay
test-free per `CLAUDE.md`.

### 2.10 The hook

`client/src/hooks/useEventNarration.ts` — mounted **exactly once**, in `Shell()` (`App.tsx:196`),
inside `HighlightProvider`. Not in `PortalShell`, not in the phone simulators (§0.7).

1. `subscribeToEvents(fn)` from `useEventStream.ts`, in a mount-once effect that returns the
   unsubscribe. **Not `lastEvent`** — see the delivery note below.
2. Per frame: if `!isNarratableType(event)` → **return, doing nothing at all** (no fetch, no
   state). Else push onto a ref-held queue and arm a 250ms debounce.
3. On debounce fire: `Promise.all([orders, patients, vendors, escalations])`, then drain the queue
   through `decideNarration(…, activeExpectations(Date.now()), Date.now())`.
4. `collapseNarrations()` → apply the rolling rate cap → `toast(...)` each survivor and
   `pulse(orderId)` each `pulseOrderIds` entry.
5. Quiet mode: read `?quiet=1` / `?quiet=0` from `window.location.search` once at mount and persist to
   `sessionStorage['betterrx.quiet']`. When quiet, **step 2 returns immediately** — no fetch, no
   toast. Pulses are silent and stay live (§5).

Delivery note (why not `lastEvent`): the server's watchdog tick loops over every order synchronously,
so a busy tick writes several SSE frames into one chunk and the browser dispatches them all in one
macrotask. `useEventStream` holds a single `last` slot and React batches the resulting `setState`s
into one render, so only the final frame of the burst is ever observable through `lastEvent` — a
narratable `escalation` followed by a `risk_updated` or `message` in the same tick was silently
dropped. Verified: seed scenario3 with the browser already attached and the post-seed tick emits
`risk_updated#1060 → risk_updated#1061 → escalation#1061 → message` as one group, and the escalation
toast never appeared. `subscribeToEvents` invokes its listeners synchronously inside `onmessage`,
outside React state, so every frame reaches the queue; the debounce then collapses the burst back
into one fetch exactly as before. `useLive` still reads `lastEvent` and is unaffected — the board was
never wrong, only the narration missed beats.

Dedupe note: keep the `seenRef` guard on event object identity — React 18 StrictMode double-invokes
effects in dev, and while the subscription's cleanup means only one listener is ever live, the guard
is what makes a double-delivery impossible rather than merely unlikely on the machine where the demo
is rehearsed.

---

## 3 · Action handoffs

**The two exemplars, cited separately (§0.5):**

> **`Driver.tsx:200-230` — `JobCompleteCard`.** After the POST it re-GETs the order and renders an
> in-page receipt naming what completed, what proof is on file, and — in a coral-tint panel — the
> **verbatim text the family received**. It shows a consequence that happened on a *different
> surface* without making you go there. Copy this when the consequence is a fact, not a place.
>
> **`Order.tsx:120-123`.** The only `toast(… { action })` in the codebase: *"Order placed — vendor
> texted" · "View board"*. Copy this when the consequence is a place.

### 3.1 The inventory

Every user-initiated mutation in `client/src/pages/**` and `client/src/components/board/**`, with
what happens today and what should. **A bold row number is one of the thirteen mutations that today
produce no visible response whatsoever** — twelve here plus P3, listed with the reply rows below.

| # | Action | File | Today | Specced landing |
|---|---|---|---|---|
| O1 | **Place order** | `Order.tsx:106-136` | toast + `action: 'View board'` (the one good case) | **Navigate** to `/hospice` with `state.highlight` on the new order id; row pulses and scrolls into view. Toast becomes *"Order placed — Beehive was texted"* with the action inverted to **"Place another" → `/order`**, so the repeat-order flow the form's partial reset implies (`Order.tsx:125-128`) survives. `expectOwn(['patient:<id>'])` before the POST. |
| **H6** | **Swap vendor** | `SwapVendorDialog.tsx:29-42` | **nothing** — not awaited, `catch(console.error)`, dialog closes | Stay on `/hospice`. `await`, then `toast("Frank's hospital bed moved to Wasatch", { description: "They've been texted." })` and `pulse(order.id)` — the row re-renders with its new vendor and acknowledges. `.catch` → `toast.error("That didn't go through — try again.")` (the `VendorPortal.tsx:127` copy). `expectOwn(['order:<id>'])`. |
| N4 | **Nurse: discharged / passed away** | `Nurse.tsx:66-87` | toast that *asserts* pickups exist, no route to them | Keep the toast, add `description` naming the count and add `action: { label: 'See the pickups', onClick: () => navigate('/driver', { state: { highlight: orderIds } }) }` using the ids in the response. `expectOwn(['patient:<id>'], { types: ['pickup_triggered'] })` before the POST. **This is the brief's "show which pickups fired with a link to /driver."** |
| **D2** | **Start delivery** | `Driver.tsx:151-158` | **nothing** — fire-and-forget, unhandled rejection on failure | `await` + `.catch` → error toast. Success needs no toast (the card visibly flips to "On the truck" on the same screen) but gets `pulse(job.id)`. `expectOwn(['order:<id>'])`. |
| D7 | **Confirm delivery / pickup** | `Driver.tsx:99-122` | `JobCompleteCard` receipt, no error path | Keep the card verbatim — it is the exemplar. Add the missing `.catch` → error toast. `expectOwn(['order:<id>'])`. |
| **H7** | **Send another nudge** | `RowDetail.tsx:75-86` | **nothing** visible; the "nudged Xm ago" line updates later | `await` + `toast("Nudged Beehive again", { description: 'Sent to their phone.' })`. No navigation — the nudge's consequence is on `/vendor-phone`, another persona's device. `expectOwn(['order:<id>'])`. |
| **H8** | **Review queue: Apply** | `ReviewQueueDialog.tsx:65-71` | **nothing**; the row vanishes on refetch | `await` + `toast("Applied to order #1042", { description: '<intent label>' })` + `pulse(orderId)`. Dialog stays open (correct — there may be more). `expectOwn(['order:<id>'])`. |
| **H9** | **Review queue: Dismiss** | `ReviewQueueDialog.tsx:72-74` | **nothing** | `await` + `toast('Dismissed')`. `expectOwn(['order:<id>'])`. |
| M1/M2 | **EMR: discharged / passed away** | `Demo.tsx:66-87` | toast naming the count, no route | Add `action: { label: 'See the pickups', onClick: () => navigate('/driver', { state: { highlight: orderIds } }) }` — same landing as N4, since it is the same event by another door. `expectOwn(['patient:<id>'], { types: ['pickup_triggered'] })`. |
| M5 | **Demo: send a template** | `Demo.tsx:139-155` | toast quoting the body | Unchanged. The body *is* the consequence and it is already in the toast — this is the `JobCompleteCard` pattern in one line. |
| **V2** | **Dispatcher board: send inbound** | `Vendor.tsx:82-105` | **nothing** beyond the bubble | `.catch` → error toast. No landing: the parse result lands as a bubble badge on the same page, and the board change is the *narration's* job (this page is inside `Shell`, so it narrates). |
| **C4** | **Caregiver: send condition check** | `Caregiver.tsx:176-182` | **nothing** — fire-and-forget | `await` + `.catch`; success shows an inline "Sent" line. **No toast** — `/caregiver` has no `<Toaster />` (§0.7) and is a household's phone; a product toast on it would break the fiction. |
| **S1** | **Portal status: Accept** | `VendorStatus.tsx:131-133` | **nothing** | Adopt `VendorPortal.tsx:114-133`'s `act()` wrapper wholesale: optimistic state + success/error toast. `PortalShell` has a `<Toaster />` (`App.tsx:191`). |
| **S2** | **Portal status: On the way** | `VendorStatus.tsx:99-100` | **nothing** | via `act()` → *"The hospice can see you're on the way."* |
| **S3** | **Portal status: Delivered** | `VendorStatus.tsx:101-102` | **nothing** — and this is the action that fires the family SMS server-side | via `act()` → *"Marked delivered — the hospice has it."* **The worst gap in the app**: an unacknowledged tap that texts a grieving household. |
| **S5** | **Portal status: Save ETA** | `VendorStatus.tsx:166-172` | **nothing** | via `act()` → *"ETA sent to the hospice."* (matches `VendorPortal.tsx` VP3 copy verbatim) |
| **S7** | **Portal status: Can't do this one** | `VendorStatus.tsx:177-184` | **nothing at all** | via `act()` + the coral "Thanks — the hospice is re-routing this one" panel from `PortalOrderCard.tsx:131-135`. |
| C2/C3 | Caregiver reply | `Caregiver.tsx:140-159` | `ReplyReceipt` inline | Unchanged (already lands). Add the missing `.catch`. |
| P2/**P3** | Vendor phone reply | `VendorPhone.tsx:120-143` | P2 lands via `ReplyReceipt`; **P3 (the no-open-question branch, line 136) shows nothing at all** | P2 unchanged. P3 gets the `.catch` plus the same in-flight/receipt treatment P2 has — the parse outcome currently appears only when SSE brings the row back. |
| VP1-VP4 | Vendor portal actions | `VendorPortal.tsx:114-133` | `act()`: optimistic + toast | Unchanged — this is the reference implementation. One bug worth the two lines: VP4 pushes onto `declined` *before* the call and never rolls back, so a failed decline shows the success panel **and** the error toast. |
| R3/R4 | Reports approve / deny | `Reports.tsx:473-474` | local state, **no API** | **Out of scope** (§0.9). A handoff from a fake action would be the one dishonest thing here. |
| D1, D3-D6, H1-H5, N1-N3, N5, N6, O2-O5, M3, M4, P1, R1, R2, S4, S6, VP5, C1 | selects, toggles, expanders, in-page navigation | — | local state / already navigate | No change. |

Copy rule for every new toast: `docs/DESIGN-SYSTEM.md`'s plain-English vocabulary, no raw state names,
no order-internal jargon, and nothing family-adjacent that reads as logistics.

### 3.2 The highlight handoff mechanism

**Decision: react-router location `state`, not a query param.**

```ts
navigate('/hospice', { state: { highlight: { orderIds: [1042], at: Date.now() } } })
```

Why not `?highlight=1042`: the highlight is a one-shot acknowledgment, and a query param makes it
*durable* — a refresh, a back button, or a copied URL re-fires it, and the param sits on the projector
in the address bar for the rest of the pitch. A stale-highlight cleanup would then be mandatory
plumbing. Location state is transient by construction, invisible, typed, and lost on refresh — which
for this payload is the correct behavior, not a limitation.

**Lifecycle, spelled out because half of these are the bugs:**

1. Landing page reads `useLocation().state?.highlight` in an effect.
2. **Staleness guard:** ignore if `Date.now() - at > 10_000`. Browser back/forward restores history
   state, and without this the row re-pulses whenever you navigate back to the board.
3. **Consume once:** immediately `navigate(location.pathname, { replace: true, state: null })`, so a
   re-render or a back-navigation can't re-fire it.
4. `pulse(orderId)` for each id — the same `useHighlight()` context the narration uses (§2.7). One
   primitive, two callers.
5. **Scroll into view**, once, on the first pulsing row:
   `el.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })`. A
   highlighted row below the fold is not a landing. Board rows can sit under the "show ▾" collapse
   (`Hospice.tsx:170-179`); if the highlighted order is in `later.rows`, **open that section first**.
6. The ring clears itself after 1.6s via the provider's timer. No cleanup on the page.

Consumers in v1: `/hospice` (`Hospice.tsx`) and `/driver` (`Driver.tsx`). Nowhere else.

---

## 4 · Front door

### 4.1 What `/` does today

`App.tsx:249` — `<Route path="/" element={<Navigate to="/hospice" replace />} />`, **inside `Shell`**.
So `/` renders the full nav chrome for a quarter-second and lands on the board with whatever role
`localStorage` last held (defaulting to `case_manager`, `auth.tsx:27`).

### 4.2 What it becomes

A `Landing` page at `client/src/pages/Landing.tsx`, routed at the **top level of `App.tsx`'s
`<Routes>`, outside `Shell`** — alongside the phone simulators and `PortalShell`, not inside the app
chrome.

Rationale: a front door that already shows the app's role-filtered nav bar is not a door, it is the
hallway. Outside `Shell` the product name gets room, and the persona cards are the only thing on
screen — which is the whole point of a landing. `PortalShell` and the two phone-simulator routes are
**untouched**; they already sit at that level and this adds a fourth sibling.

**Migration:** `App.tsx:249`'s `<Route path="/" element={<Navigate to="/hospice" replace />} />`
inside `Shell` is deleted and replaced by `<Route path="/" element={<Landing />} />` in the top-level
`<Routes>`, before the `path="*"` catch-all. **No other route moves.** Routes stay unguarded
(`CLAUDE.md`: "every screen stays reachable by URL mid-demo") — `/hospice` typed directly still works
signed out, exactly as today.

### 4.3 Contents

| Slot | Content |
|---|---|
| Wordmark | The coral pill from `App.tsx:208`, reused verbatim |
| Product name | `{APP_NAME}` in display weight 800, tight tracking |
| Promise | One line, `PROBLEM-THESIS.md` register: **"Hospice equipment, tracked from the order to the pickup — so nobody in a grieving house has to chase a truck."** |
| Persona cards | One per `ROLES` entry (6), each: initials chip (reusing the `App.tsx:96-98` avatar), role label, one plain-English line, and the surface it lands on |
| Footer row | The two simulated phones, framed exactly as the account menu frames them (`App.tsx:104-118`): *"The two people this system texts who never log in."* New tab. |

`/demo` is **not** listed — `App.tsx:258` calls it "a presenter prop, not a product surface," and the
front door is the last place to contradict that.

Persona lines (plain English, one each — this is the copy, not a placeholder):

| Role | Line | Lands on |
|---|---|---|
| Case Manager | See every order that needs a decision today | `/hospice` |
| Admissions Nurse | Place an order for a patient coming home | `/hospice` |
| Field Nurse | Tell the system a patient has died or gone home | `/nurse` *(see note)* |
| Dispatcher | Work the vendor side — accept, set an ETA, reroute | `/vendor` |
| Driver | Your delivery and pickup jobs, with proof | `/driver` |
| Director of Nursing | Where the time and the money went | `/hospice` *(see note)* |

*Note: the landing target is **derived**, never hand-written — `homeFor(roleId)` returns the first
`surfaceLinks` entry that includes the role, which is exactly what `chooseRole()` does today
(`App.tsx:69-74`). The table above records what that resolves to at the time of writing; if
`surfaceLinks` changes, the landing follows automatically and this table is the thing that's stale, not
the code.*

### 4.4 Selecting a role

Clicking a card runs **the same code path as the account menu**, which requires a small extraction:

- Move `surfaceLinks` out of `App.tsx:33-45` into **`client/src/lib/surfaces.ts`**, exporting
  `surfaceLinks` and `homeFor(roleId: RoleId): string`.
- `App.tsx`'s `AccountControl.chooseRole` (lines 69-74) and `Landing`'s card handler both become
  `signIn(id); navigate(homeFor(id))`.

One source of truth for "where does this role live," which matters because `CLAUDE.md` makes the
role→surface graph a documented artifact (`docs/UX-FLOWS.md`) and two copies of it would rot apart.

### 4.5 The name constant

**`client/src/lib/brand.ts`** — the single place the name is written:

```ts
/** The product name. The human is choosing this separately — this file is the only place it lives. */
export const APP_NAME = 'BetterRX DME'

/** One line, in the register of docs/PROBLEM-THESIS.md's north star. */
export const APP_PROMISE =
  'Hospice equipment, tracked from the order to the pickup — so nobody in a grieving house has to chase a truck.'
```

Client-only, not `shared/`: no server string needs it (the SMS templates deliberately say "your
hospice team," never a product name — `SMS-SIM-SPEC.md §3.2`), and putting it in `shared/` would
invite one into a text message to a grieving household.

`APP_NAME` ships with a working default rather than a visible placeholder, on purpose: a literal
`'TODO'` on the projector is a worse failure than a name the team later changes. When the name is
chosen, this is a one-line edit and nothing else moves. The coral `betterRX` pill stays as-is
everywhere — this app is the DME module *inside* BetterRX (`DESIGN-SYSTEM.md:73-74`), so the landing
shows both marks: the pill above, the product name below it.

### 4.6 Required doc updates (not optional)

`CLAUDE.md` makes both of these same-commit obligations, and this branch changes the navigation graph:

- **`docs/UX-FLOWS.md`** — `/` is a new page with six new arrows (one per role) plus two phone links.
  Derive them with the mandated grep (`grep -rnE "useNavigate|navigate\(|window\.location|<Link|<NavLink|href=" client/src/pages/ client/src/components/`), which will also pick up the new
  handoff `navigate()` calls from §3.1 (O1, N4, M1/M2), and render the diagrams before pushing
  (`npx -y @mermaid-js/mermaid-cli@9 -i docs/UX-FLOWS.md -o /tmp/mmd-check.md`).
- **`docs/FEATURES.md`** — new surface, re-run its own verify block, update the test count
  (`tests/narration.test.ts` is new) and the "Last verified" line.
- **`docs/deliverables/SLIDES.md`** show-off inbox — one line. If it isn't in the inbox it isn't on
  stage, and "the board narrates itself" is the most demo-visible thing in this branch.
- **`docs/DESIGN-SYSTEM.md:61`** — the motion-rule amendment from §2.7.

---

## 5 · Demo impact

### 5.1 Beats that get better

| Scenario | Beat | Today | With this branch |
|---|---|---|---|
| 3 | Vendor taps **1 · Accept** on the phone | The board silently repaints a pill. The presenter has to say "watch the third row" *before* it happens and hope the room was looking. | **"Beehive accepted Frank's hospital bed"** pops top-right on the projector and the row rings coral. The presenter narrates *after* the fact, which is how a demo should work. **The single largest gain in the branch.** |
| 1 | Swap vendor | Dialog closes. Nothing else. | Row acknowledges its new vendor; toast confirms Wasatch was texted. The escalation-to-resolution arc finally has a beat between the two ends. |
| 2 | Nurse taps **Passed away** | Toast asserts pickups exist; getting to them means finding the nav. | Toast's **"See the pickups"** goes straight to `/driver` with both jobs ringing. The claim and the proof are one click apart. |
| 1 | Watchdog escalates on stage | Banner appears if you happen to be on `/hospice` and looking. | **"Ruth's pickup is overdue — escalated"** with the real reason as the description, from wherever you are. This is the "silence is a signal" thesis becoming audible. |
| — | The opening slide→app transition | `/` flashes the nav and dumps you on a board | A named front door with six personas on it — the "who logs in and what do they see?" judge question answered before it's asked. |

### 5.2 Risks, and the escape hatch

- **A toast covering something during the pitch.** Sonner is `top-right`
  (`client/src/components/ui/sonner.tsx`), which on `/hospice` overlaps the "Needs attention"
  panel — the board's hero and the thing most likely to be under discussion when the watchdog fires.
  **Mitigation: `?quiet=1` (§2.10).** Visit any app URL once with `?quiet=1` and toasts are muted for
  the whole browser session (`sessionStorage`), surviving every navigation; `?quiet=0` restores.
  **Pulses stay live in quiet mode** — they occlude nothing and they still prove the board is alive.
  Rehearse both ways and decide at code freeze.
- **Narration double-firing your own click.** Covered by §2.5, but it is the failure most likely to
  reach the stage, because the registry has to be registered *before* the POST (the SSE-vs-response
  race). Rehearse each of O1, N4, H6 and M1 once and watch for a duplicate toast.
- **A `risk_updated` storm.** Muted by rule (§2.3), but if the mute regresses the demo becomes
  unwatchable within one watchdog tick. `tests/narration.test.ts` guards it; write that test first.
- **Reduced-motion machines.** If the presenter's laptop has "Reduce motion" on (common on
  conference machines), the ring silently becomes a flat tint. That is the correct behavior — but
  check the presenting machine's setting before the pitch so nobody is surprised by a missing effect
  they rehearsed.

---

## 6 · Effort and cut order

Target **2.5-4h**. Client-only; no schema change, no `db:reset` ping, no server restart semantics.

| Lane | Work | Est. |
|---|---|---|
| **1a · Narration core** | `client/src/lib/narration.ts` (sentences, decisions, collapse) + `client/src/lib/expectedEvents.ts` + `tests/narration.test.ts` | **~55m** |
| **1b · Narration wiring** | `useEventNarration.ts` (queue, debounce, snapshot fetch, rate cap, `?quiet=1`) + mount in `Shell()` | **~40m** |
| **1c · Acknowledgment** | `highlight.tsx` provider + `index.css` keyframes + reduced-motion + consumption in `BoardRow.tsx` and `Driver.tsx` | **~25m** |
| **2 · Handoffs** | ~20 call sites from §3.1 — mostly `await` + one toast + one `expectOwn`; plus §3.2's location-state read on `/hospice` and `/driver` (incl. the scroll + the `later` collapse case) | **~50m** |
| **3 · Front door** | `Landing.tsx` + `brand.ts` + `surfaces.ts` extraction + the route swap | **~35m** |
| **4 · Docs + verify** | `UX-FLOWS.md` (grep-derived + mermaid render), `FEATURES.md` re-verify block, `SLIDES.md` inbox, `DESIGN-SYSTEM.md:61` amendment; `npm test && npm run typecheck && npm run build` | **~25m** |

**~3h50 at full scope.** Sequence **1a → 1c → 2 → 1b → 3 → 4**: the pure module first (it is the only
tested thing and the only place a wrong decision is expensive), then the acknowledgment primitive
because lane 2 depends on it, then the handoffs (which deliver value even if narration is cut
entirely), then the narration wiring, then the front door, then docs.

**Cut in this order if time collapses:**

1. **The rolling rate cap** (§2.6) — collapse alone handles every realistic burst; the cap is
   insurance against a scenario the demo doesn't contain.
2. **Batch collapse** (§2.6) — degrades to N separate toasts. Ugly for two seconds, never wrong.
3. **The escalations fetch** (§2.2) — the escalation toast keeps its title and loses its
   `description`. One line, one fetch saved.
4. **The Driver-side acknowledgment** (§2.7) — the nurse handoff still navigates and still toasts; the
   jobs just don't ring. `/hospice` is where the room is looking.
5. **Handoff rows below S1 in §3.1** — the portal-status `act()` adoption (S1-S7) is real
   correctness work but it is on a page the demo may not open. Do it if the pitch includes
   `/status/:token`.
6. **Narration entirely (lanes 1a-1c)** — the handoffs and the front door stand alone and are the
   cheaper two-thirds of the value.

**Cut last: the front door.** It is the cheapest lane on the list (~35m), it is the only thing that
gives the product a name on screen, and it answers a judging question directly. Per the brief, it
survives every cut above it.

**What must survive every cut:** the `risk_updated` / `family_notified` mute (a narration layer without
it is *worse* than none), the own-action suppression (a doubled toast reads as a bug on stage), and
the §3.1 rows marked **bold** — thirteen controls that currently swallow their own failures with no
`.catch` and tell the user nothing. Those are correctness fixes wearing a feature's clothes.
