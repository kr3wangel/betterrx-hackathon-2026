# Bounty Requirements — verbatim list × what we actually have

**What this is:** the sponsor's two requirement profiles, verbatim, each line mapped against the
code on `main` (2026-08-15). Statuses use the FEATURES.md vocabulary — **BUILT** (click it now),
**PARTIAL** (some of it, honestly scoped), **DESIGNED** (spec'd on purpose, not built),
**IN PROGRESS** (build running right now — status is minutes old, re-check before quoting),
**MISSING** (nothing, and we say so). FAQ §6 rewards this table being true more than it rewards
it being green. Companion docs: `FEATURES.md` (inventory), `BOUNTY-FAQ.md` (doctrine),
`deliverables/DIFFERENTIATION.md`.

The sponsor's own framing, verbatim, because it is our strategy said back to us:

> *This is where we most want to see something original. Getting the hospice side right is table
> stakes. Solving the vendor side well, especially with no existing vendor network to lean on, is
> the differentiator.*

---

## 1 · Hospice-Side Profile

| # | Requirement (verbatim) | Status | What exists / what's missing |
|---|---|---|---|
| H1 | Patient and equipment need (type, quantity, urgency, target date) | **BUILT** | `/order`: patient + equipment (CMS-grounded 12-code catalog), quantity, urgency (routine/urgent/STAT), needed-by with SLA defaults per urgency (`server/sla.ts`). Vendor texted on placement. |
| H2 | Discharge-readiness flag. Equipment must be confirmed before a scheduled discharge | **BUILT** | The named rollup now ships: `dischargeReadiness()` in `client/src/lib/board.ts` reads a patient's delivery orders and prints "Ready for discharge — 2 of 2 confirmed" / "NOT ready — 1 of 2 unconfirmed" on the board (grouped-row sub-line + row detail). Confirmed = past `ordered` (vendor committed); pickups excluded. Scope note: readiness anchors on each order's target date — there is still no discharge-date field of its own, so the flag fires on 2+ open deliveries or anything due within 48h. |
| H3 | Post-death pickup trigger, ideally tied to an EMR status change rather than a manual call | **BUILT — both paths** | EMR webhook `POST /api/emr/patient-status` (actor system, source `emr`) AND the nurse's one-tap on `/nurse` (source `nurse`). FAQ §8 later re-ordered nurse-primary/EMR-fallback; we have the ordering they asked for, and the ledger records which path fired first. Pickups auto-appear for the driver; the family is notified with care. |
| H4 | Vendor choice within a market (most hospices work multiple vendors, not one) | **BUILT** | Four seeded vendors with service areas; the swap dialog shows each alternative's on-time history **for this equipment on this deadline's weekday** at the moment of choice; cold-start vendors join by phone number. Reputation as a decision input, not a report. |
| H5 | Total cost-of-care visibility. DME spend alongside medication spend, not in a separate silo | **BUILT (synthetic-labeled)** | `/reports` Cost of care: DME and medication bars side by side per patient. The medication figure is deliberately labeled synthetic with an on-screen note — BetterRX is the pharmacy company; under the hospice benefit no public per-claim med figure exists to ground it, and the card says so rather than faking precision. |
| H6 | Mobile and tablet-friendly ordering at the bedside | **BUILT — physical-device walk still pending** | A responsive audit of every non-simulator page (2026-08-15) confirmed most surfaces were already mobile-first — the board is a flex card below `sm:` that dissolves into a 5-col grid above, `Shell`/`PortalShell` supply 20px mobile padding, every `<Table>` rides shadcn's built-in `overflow-x-auto`, and the cost-of-care grids already stack — and closed the real gaps it found: the bedside order form's field pair now stacks single-column on phones, the vendor picker drops its min-width below `sm:`, the vendor-portal stat tiles stack, and the vendor-status date input is 16px (no iOS zoom). `/nurse` and `/driver` are phone-shaped by design. Only open item: a walk on a physical tablet — a rehearsal check, not code. |

## 2 · Vendor-Side Profile (the differentiator, per the sponsor)

| # | Requirement (verbatim) | Status | What exists / what's missing |
|---|---|---|---|
| V1 | Fleet and route capacity, service area, and current load | **PARTIAL — by design, and shipped** (08-15) | Spec'd (`docs/FLEET-CAPACITY-SPEC.md`, independently reviewed pre-build), built, browser-verified. **Current load:** derived live from the ledger in the vendor's own unit — stops (household × direction) — on the portal's "Today" strip and in the swap dialog ("3 stops open"). **Capacity:** one vendor-declared number per day (`POST /api/portal/:token/capacity` — built and tested; the portal's input control was deliberately removed as too in-the-weeds for a dispatcher, so declarations arrive by seed/API today and the portal displays them read-only); `remaining_today` is computed server-side and both surfaces render it verbatim ("says they can take 2 more today" / "at capacity" / "says no trucks today"; Beehive deliberately never declares → "no capacity signal"). Declared ≠ verified: capacity is the vendor's word, informs the choice, never gates it. **Service area:** now visible at the moment of vendor choice ("Serves: …" per swap option). What PARTIAL means here, on purpose: no truck model, no routes, no capacity analytics — a rolodex vendor's "route capacity" is a gut number, and we capture it rather than simulate a fleet (30 tests across `tests/capacity.test.ts` + `tests/board.test.ts`). |
| V2 | Serialized equipment inventory: what's in stock, what's out, what's overdue for pickup | **DESIGNED / PARTIAL** | Overdue-for-pickup: BUILT per order (`pickup_overdue` watchdog clock anchored to the trigger). Stock/serialized units: deliberately not built — FAQ §9 itself says live inventory won't exist for these vendors in practice; `INTEGRATION-SKETCH.md` designs it as a hook with graceful fallback, and `FEATURES.md` §3 records the decision. |
| V3 | Delivery and pickup status with proof-of-capture (signature, photo, timestamp) | **BUILT — and extended** | POD on both flows: photo, signature, timestamp, plus a per-item condition attestation. The extension is the evidence ladder: **verified vs vendor-reported vs family-confirmed**, enforced on every badge, with a "delivered without proof" escalation and the trust-gap panel quantifying the difference per vendor. |
| V4 | SLA and contract terms per hospice client, tracked against actual performance | **PARTIAL** | Tracked-against-actual: BUILT — SLA defaults, due/late clocks on the portal, and the contract-leverage panel (verified vs claimed on-time, interventions per order, responsiveness) computed live from the ledger: literally the renewal-negotiation numbers. **Per-hospice-client terms: missing** — the demo is single-hospice, and there is no contract entity holding negotiated terms. |
| V5 | Resupply cadence for consumables (CPAP supplies, wound care) tied to payer-approved timelines | **BUILT (scoped)** | Shipped 08-15: consumables in the catalog (CPAP mask/filters, alginate wound dressing — the requirement's own examples), each carrying its **Medicare replacement schedule** as `resupply_days` (90d mask, 30d filters/dressing). The scheduler is a watchdog rule on the same state machine (`server/resupply.ts`, vitest-covered): once a delivered consumable's payer window elapses, the next order **places itself** — actor `system`, ledger stamped *"auto-resupply · payer cadence, no model"*, vendor texted like any order, exactly one successor ever, and **never for a deceased or discharged patient**. Honest scope: cadence figures are fee-schedule approximations pending a PUF re-pull, and there is no payer adjudication/authorization tracking — the cadence is the timeline, not a claims engine. |
| V6 | Billing trigger tied to delivery completion. DME claim denial rates run 15 to 25 percent, largely from documentation gaps | **DESIGNED — and our evidence system is the foundation** | No billing event is built. But the requirement's own diagnosis — *denials come from documentation gaps* — is what the evidence ladder already solves: a **verified** delivery is a photo, a signature, a timestamp, and a condition attestation on an append-only ledger, i.e. the claim-ready documentation packet, captured at the door as a side effect of the driver's normal flow. The billing trigger is one event listener on `delivered`+POD. This is a pitch line, not a gap apology. |
| V7 | Vendor recruitment and onboarding. Since BetterRX has no vendor network today, a path to identify, invite, and activate local and regional DME vendors from a cold start | **BUILT — this is the centerpiece** | The whole adoption ladder, every rung clickable: the hospice types a phone number from its own rolodex (**"add a vendor by phone" on `/order`**, `POST /api/vendors` — idempotent on number, service area picked per market) → the vendor's first contact is a text with a magic link (*the first order IS the invite*) → no login, no app, no password → rotating reply pairs make plain SMS fully workable → the portal is *what's already waiting behind the link*, not something adopted. Scenario 3's Timpanogos (zero history, zero contact) is this requirement performed live. The landline/IVR rung (`IVR-SIM-SPEC.md`) covers the vendors who can't even receive SMS — designed, said plainly. |

---

## 3 · Shared visibility & risk (the sponsor's own "Differentiator" rows)

| # | Requirement (verbatim) | Status | What exists |
|---|---|---|---|
| R1 | Real-time status visible to both sides, not just the vendor's internal system — *Differentiator* | **BUILT — it's the architecture** | One SSE stream over one append-only ledger; the hospice board and the vendor's no-login `/o/`/portal surfaces read the same truth, live. Scenario 3's climax is this requirement performed: the vendor taps Confirm and the board flips before their thumb leaves the screen — and the board narrates it out loud. |
| R2 | Service-failure risk scoring, surfacing an at-risk order before it's late, not after — *Differentiator* | **BUILT — and backtested** | `server/risk.ts`, deliberately rules-based, recomputed every 30s. Not just built but graded: `npm run backtest` replays the seeded year tick-by-tick as the watchdog would have lived it — **78% of late deliveries caught a median 8.7h early** (27% false alarms, n=203, threshold sweep showing why 70; SYNTHETIC, labeled). The silence ladder extends it: an unanswered ask is itself a pre-lateness signal. |
| R3 | Escalation path to a case manager or vendor rep when a risk threshold is crossed | **BUILT** | The watchdog escalates threshold crossings and check-in silence automatically into the board's "Needs you" section — red count, coral one-click **Swap vendor** as the resolution path, escalation reason rendered in the row detail. One open escalation per order, resolved by the action that fixes it. |
| R4 | Explainability. "Why was this order flagged as at-risk?" should have a legible answer, not a black box | **BUILT — it's why the risk engine is rules, not ML** | Every score decomposes into `risk_reasons`: full plain-English sentences ("Beehive runs 34% late on Friday heavy-item runs…") rendered as bullets in the row detail. The demo script's stage direction is to read one aloud verbatim. The one place a model *does* act (free-text parse) carries a confidence score and a human review queue — no state change is ever unexplained. |

## 4 · Gap list, ranked (what to do about the non-green rows)

**Worth building before freeze (small, high req-coverage):**
1. ~~**H2 — discharge-readiness rollup.**~~ **DONE** — `dischargeReadiness()` in `client/src/lib/board.ts`,
   on the board's grouped-row sub-line and row detail. Still no discharge-date field of its own;
   the flag anchors on order target dates (2+ open deliveries, or anything due within 48h).

**Pitch/Q&A answers, not builds (the honest-frame rows):**
2. **V6 billing/denials** — lead with it in Q&A: *"15–25% denials from documentation gaps is the
   number our evidence ladder attacks: every verified delivery is already the claim packet —
   photo, signature, timestamp, condition — captured at the door. The billing trigger is one
   listener on an event we already emit."*
3. **V1 fleet capacity / V4 contract terms / V2 serialized stock** — same shape of answer: the
   ledger and trip model are the substrate; the missing piece is a data model no cold-start
   vendor could feed on day one anyway (FAQ §9's own point about inventory). Designed as hooks,
   declined for the weekend, said out loud.
4. ~~**V5 resupply cadence** — the one clean miss.~~ **DONE 08-15** — the prediction ("it's a
   recurring-order scheduler on the same state machine") turned out to be literally the
   implementation: `server/resupply.ts`, one watchdog rule, vitest-covered, consumables in the
   catalog with Medicare replacement schedules.

**Rehearsal checklist, not builds:**
5. ~~**H6**~~ **DONE (build side)** — responsive audit run, real gaps fixed (order form, vendor
   picker, portal stat tiles, date input); false positives (board grid, table overflow, container
   padding) left alone with a note. Only thing left is to walk `/order` and the board on a physical
   tablet once before freeze.

## 5 · Scorecard summary

Hospice side: **6 BUILT · 0 PARTIAL · 0 MISSING** — table stakes held (H2's discharge-readiness
rollup and H6's responsive pass both landed 2026-08-15; H2's discharge-date field stays derived and
H6's physical-tablet walk is a rehearsal item, both said out loud in their rows).
Vendor side: **3 BUILT (V3, V7 — the two the sponsor weights hardest — and V5's scoped resupply
scheduler) · 2 PARTIAL · 2 DESIGNED · 0 MISSING** — and the sponsor's own sentence says the
vendor side is where originality is judged:
V7 (cold-start onboarding) is our centerpiece and V3 (proof-of-capture) is where we went furthest
past the requirement. The misses cluster exactly where the FAQ itself said real-world data won't
exist (inventory, capacity) — cite that, don't apologize for it.
Shared visibility & risk (§3): **4 of 4 BUILT** — the two rows the sponsor tagged *Differentiator*
(both-sides real-time status, at-risk-before-late scoring) are the product's core architecture and
its backtested risk engine; escalation and explainability are the demo's two loudest beats. This
section is where the strategy bet is proven: we differentiated exactly where they said to.
