# Feature inventory

**What this is:** everything the product actually does, read out of the code rather than
the deliverable docs. Three people and a pile of agents have been shipping in parallel all
day; nobody has the whole picture in their head. This is the picture.

**Why it exists:** the worst Q&A moment on Saturday is claiming something that isn't wired
up. FAQ §6 rewards honesty about what's real, so the "built but not surfaced" and "designed
only" sections below are as important as the first one — they are what keeps the pitch
truthful.

**How to re-verify** (do this before the rubric audit, things move fast):

```bash
grep -oE "routes\.(get|post)\('[^']+'" server/routes.ts | sort -u   # every endpoint (34)
grep -oE 'path="[^"]*"' client/src/App.tsx | sort -u                # every screen (14 pages: 15 rows minus the * catch-all; / is now a real page)
grep -n "roles:" client/src/lib/surfaces.ts                          # who sees which nav link
npm run typecheck && npm test                                        # it all still holds
```

**Last verified against `main` on 2026-08-15 (afternoon)**, after trip batching (tier 2) merged on
top of the overnight run (narration + handoffs + front door + P1/P2 sweep), the verified-vs-claimed
panel (née contract leverage), rotating reply codes, the placement-anchored silence escalation, and
add-vendor-by-phone. `/` is a real landing page now, `surfaceLinks` lives in
`client/src/lib/surfaces.ts` (the third command's file changed), and the counts above were
re-derived by running the commands on the merged tree, not by arithmetic: **34 endpoints, 14
pages, 16 test files, 255 tests**, typecheck clean. Test count: re-run the suite rather than
trusting any doc — it has moved most of the times anyone has looked.

---

## 1 · Working — you can click it right now

### The front door

| Route | Chrome | What it does |
|---|---|---|
| `/` | none — outside the Shell | The landing. Product name, the one-line promise, and six persona cards. Clicking one signs that role in and lands on `homeFor(roleId)`, the same derivation the account menu's role switch uses (`client/src/lib/surfaces.ts`), so the two doors can't disagree. Footer carries the two simulated phones, new tab. `/demo` is deliberately not listed — it's a presenter prop, and the front door is the last place to contradict that. Was a `<Navigate to="/hospice">` inside the Shell until 08-14 |

### Surfaces in the nav

| Route | Label | What it does |
|---|---|---|
| `/hospice` | Board | Case-manager board, rebuilt as v8: three sections (Needs you / On the way / Done) of five-slot rows, tap-open detail with risk reasons and evidence, escalation acknowledge, AI-parse review queue (confirm / reject), swap-vendor dialog. **The inline new-order form and the EMR simulator are no longer here** — ordering is `/order`, the EMR feed moved to `/demo` |
| `/order` | New order | Place an order. SLA defaults applied by urgency — same-day for urgent, 24h routine. **Add a vendor by phone** inline under the vendor picker (`POST /api/vendors`, idempotent on phone number): service area picked per market chip (the patient's own market is locked in — dropping it would hide the vendor from the picker it was just added to), zero history, and their *first order text is their invite* — magic link, reply pair, portal already waiting. The V7 "identify, invite, activate from a cold start" rung, clickable |
| `/nurse` | Nurse | Nurse-in-the-field status change. Death or discharge fires the pickup trigger directly, ahead of EMR propagation |
| `/driver` | Driver | Phone-sized. Today's deliveries and pickups, POD capture: photo, signature, and a condition attestation |
| `/reports` | Reports | Vendor scorecards, condition stats, calls-avoided counter (all four sub-counters printed, so the breakdown sums to the hero), pickup latency, DME spend, cost-threshold approvals (labelled `synthetic` — decisions aren't saved) |

**The nav is role-filtered.** Each entry carries `roles: RoleId[]` and `Shell()` filters it against
the signed-in role: Case Manager sees Board / New order / Nurse / Reports; Admissions Nurse sees
Board / New order; Field Nurse sees Board / Nurse; DON sees Board / Reports; Dispatcher and Driver
both see Driver; **signed out sees everything**. Routes are deliberately *not*
guarded — hiding a link never blocks a URL, so no screen becomes unreachable mid-demo. Full map in
[UX-FLOWS.md](UX-FLOWS.md).

### Off the surface nav — demo props and magic links

| Route | Chrome | Reached by | What it does |
|---|---|---|---|
| `/vendor` | full Shell | Typed URL only — **retired from the nav** | Dispatcher board plus an in-page phone simulator — free-text reply, watch it parse. Still the one surface on the pre-token slate/blue palette, which is why it is off the nav rather than on stage |
| `/vendor-portal` | full Shell | Typed URL only — **retired from the nav** | The same component as `/portal/:token` with no token, so all it can render is "open the link we texted you". As a nav destination it was a dead end by construction; kept as a URL fallback |
| `/demo` | full Shell | Typed URL only — not in the nav, not in the account menu | The presenter's panel: mark a patient discharged or deceased (the EMR fallback path), and send any templated text by hand. Took both off the board in the v8 rebuild |
| `/o/:token` | `PortalShell` | **The link in every vendor text** | That one order, its actions, and a link onward to the vendor's full portal if they have other work open. 10-character token, so the URL fits a text |
| `/caregiver` | none | Account menu → Simulated phones (new tab), or typed URL | The family's phone. Full-screen SMS simulator: condition check arrives, reply 1–5 or free text. **Bubbles show only the time** (08-15) — outcomes surface on `/reports` and the board, not the handset |
| `/vendor-phone` | none | Account menu → Simulated phones (new tab), or typed URL | The dispatcher's phone. **Two reply paths in one text box:** a digit owned by an open question routes deterministically (route table, no model), prose goes to Claude behind the 0.8 gate. No buttons, and **no outcome annotations under bubbles** (08-15) — a real handset shows only the time, and the vendor's phone has never heard of our review queue; the result shows as the board's state pill flipping, or a row in the review queue. Posts to `/api/messages/inbound` with just a sender and a body, exactly what a gateway webhook delivers; the screen carries no routing knowledge |
| `/portal/:token` | `PortalShell` | `/o/:token`'s "see all", or the fallback URLs in DEMO-SCRIPT | Per-vendor portal — every open order grouped, plus an equipment tab. No account. **No longer what a text links to** |
| `/status/:token` | `PortalShell` | A texted magic link | Vendor status view, read-only |

**The two phone simulators are in the account dropdown**, under a "Simulated phones" heading below
the role list, as real `target="_blank"` anchors (`DropdownMenuLink`). They open in a new tab on
purpose: the demo is watching the hospice board and a handset react to each other, which needs two
windows. They sit in the account menu rather than the surface nav because neither the vendor nor
the family has an account here — that is the design, not an oversight — and because the account
menu is the one control present on every Shell page.

Three chrome levels, not two: the full Shell carries the hospice nav; **`PortalShell` carries only
the betterRX mark and the live indicator**, so a vendor opening a texted link never sees our
internal navigation — it wraps all three token routes (`/o/`, `/portal/`, `/status/`); the two
phone simulators get no chrome at all. Both simulators share
`components/PhoneScreen.tsx` and `PhoneKeyboard.tsx`, including a fake on-screen keyboard that
suppresses itself on real handsets.

### What runs underneath

| Capability | Where | Notes |
|---|---|---|
| Order lifecycle state machine | `statemachine.ts` | 8 states, guarded transitions, every change appends an event and broadcasts |
| Risk scoring | `risk.ts` | **Rules-based on purpose** — explainable, tunable, reasons in sentences |
| Watchdog | `watchdog.ts` | 30s tick: recompute risk, escalate threshold crossings, flag overdue pickups, silence ladder |
| Vendor SMS parsing | `messaging.ts` + `llm.ts` | Claude, with a confidence gate — ≥0.8 auto-applies, below lands in the human review queue. Prompt carries the vendor's open orders plus a focus hint (the newest unanswered question) so bare prose like "ok" can be placed |
| Acknowledgement receipts | `vendorAckText()` + friends in `messaging.ts` | **Every vendor text gets a receipt back that echoes the digit and names the order** (08-15) — the phones show nothing but time under a bubble, so the reply IS the confirmation, as a real SMS system would send it. Applied → "Got it — order #1042 is confirmed with you"; can't-fill → "we'll reassign order #X"; a repeated digit → "Got your \"1\" — order #1042 was already updated earlier" (via `lastAnsweredOwner()`, receipt copy only, never routing); a digit nothing ever owned → "no open request matches that code"; prose parked for review → "a coordinator will take a look"; and a review-queue confirm sends the delayed receipt. Conversational sends — no template, no reply pair, never counted as questions |
| Rotating reply codes | `slots.ts` + `shared/slots.ts` | **Five open questions per vendor, each owning a digit pair** — (1,2) (3,4) (5,6) (7,8) (9,0), odd = affirmative. Each message states its own pair, so a question buried five texts back is still answerable, in any order, days apart. A follow-up reuses its order's pair rather than spending a new one. Sixth question → one rate-limited digest with a portal link, never a recycled code |
| Trip batching (tier 2) | `pickups.ts` + `sms.ts` + `message_orders` | **One text per stop, not per order.** A death that owes a vendor a bed and a concentrator from the same home sends one `v_pickup_group` question spending one reply pair; the manifest rides in `message_orders`, and the affirmative fans `pickup_scheduled` out to every order on it (`payload.source: 'group reply'`, ledger reads *"group reply · no model"*, receipt reads *"applied to 2 orders"*). An order whose state refuses the transition is skipped and named in the notes rather than aborting the trip, and the household gets one `f_pickup_notice`, not one per item. **We batch the asking, never the answering** — per-order events, clocks, escalations and evidence are untouched, and there is no `trips` table. Past five stops the existing exhaustion digest takes over. Spec + what stayed unbuilt: `docs/SMS-BATCHING-SPEC.md` |
| Caregiver condition parsing | `condition.ts` | **Deterministic regex, no model.** A digit is a digit |
| Household messaging | `messaging.ts` | `sendToFamily` with a gate — silent after a death, one open question at a time |
| Magic-link tokens | `portal.ts` | Vendor access with no account. `portalOrders()` lists only what the vendor still owes something on — unaccepted, in flight, awaiting pickup — not their delivered history (that was 39 of Beehive's 45 rows) |
| Roles / mock login | `client/src/lib/auth.tsx` | 6 roles, `AuthProvider`, `useAuth()`, localStorage-backed. **Client-side only** — see §2 |
| SLA defaults | `sla.ts` | Same-day urgent, 24h routine, stated as an assumption per FAQ §7 |
| Proof of delivery | `pods.ts` | Photo, signature, timestamp, plus condition attestation |
| EMR webhook | `pickups.ts` | Simulated patient-status events drive automatic pickup |
| Reports | `reports.ts` | Vendor scorecards, calls avoided, pickup latency |
| Verified vs. claimed | `reports.ts` `vendorLeverage()` | **The renewal-negotiation table**, computed live from the event ledger — never from seeded `vendor_stats`. Splits each vendor's on-time rate into POD-**verified** vs **claimed** (vendor's word only); the difference is the **trust gap**, withheld until both cohorts have 15 deliveries so a small sample can't masquerade as a finding. **Responsiveness** reads the question ledger: every templated text carries a sent and (once replied) an answered timestamp, giving median time-to-answer and a never-answered rate (a question only counts as ignored after 24h). Plus interventions per order (ack nags + escalations = staff time the vendor cost us). `GET /api/reports/vendor-leverage`, rendered on `/reports`. The seed gives each vendor `pod_rate`/`fudge_rate` (a late, unverified delivery sometimes gets reported as on-time) and `answer_hours`/`ignore_rate` (question threads answered slow, or never), so Beehive's word measurably outruns its PODs (+20 pts), it sits on a question for a median 8.6h, and never answers ~32% of texts — while Wasatch answers in ~40m and ignores ~6% |
| Live updates | `sse.ts` + `useEventStream` | One shared SSE stream app-wide |
| Live event narration | `client/src/lib/narration.ts` + `hooks/useEventNarration.ts` | When something happens under you, the surface says so in a sentence. `risk_updated` and `family_notified` **never** narrate; your own click is suppressed for 6s so an action never toasts twice. Client-only, no server change. `?quiet=1` mutes it for the session |
| Row acknowledgment | `client/src/lib/highlight.tsx` + `index.css` | A 1.6s coral ring on the row that changed. Shared by narration and by the action handoffs — one primitive, two callers. The client's first `prefers-reduced-motion` handling: the ring becomes a flat tint |
| Action handoffs | `hooks/useHighlightHandoff.ts` + the call sites | Placing an order lands on the board with the new row ringing; the nurse's and the EMR's "See the pickups" land on `/driver` with the triggered jobs ringing. Carried as react-router location `state`, consumed once and dropped from history so a back-navigation can't re-fire it |
| Synthetic world | `scripts/seed.ts` + `shared/catalog.ts` | CMS-grounded 12-code catalog, a simulated year, vendor stats **derived** from it |

---

## 2 · Built but not surfaced, or surfaced but not real

Real, tested code with no path to it from the UI — and UI with no real code behind it. Either wire
these up or don't claim them.

| Thing | Evidence | Status |
|---|---|---|
| `POST /api/messages/send` — send any templated message | `sms.ts` `sendTemplate` | **Now called** by `/demo`'s send-a-text form (`Demo.tsx`) and RowDetail's "Send another nudge" |
| Cost-threshold approvals on `/reports` | `Reports.tsx` `decide()` | **UI only.** Local `useState` — no API call, no persistence, no ledger event, and **nothing gates dispatch**. The card now says so on screen: a `synthetic` badge in its header and "Design preview — decisions aren't saved yet" under the title |
| Roles / sign-in | `App.tsx:47` is the only `useAuth` consumer | **Nav filtering plus ledger attribution** (08-15): every request carries an `X-Role` header and internally-acted events record `actor_role`, so the timeline reads "Cancelled · by Case Manager". Still no route guards and no page branches on role — that part is deliberate (see §1) |

**`/api/messages/reply` is now wired** (08-14). `VendorPhone` renders tappable quick replies under
the most recent unanswered question and POSTs the digit; the reply resolves through `sms.ts`'s
`template × digit → action` table with no model in the loop. Verified against a running server, not
just typechecked — all four branches exercised: `applied` (digit 1 on a pickup request moved order
2086 to `pickup_pending`), `prompt` (digit 2 replies *"When can you collect it? Text back a day and
time."*), `review` (re-answering an already-answered question does **not** re-apply), and
`unmapped` (digit 9 goes to the review queue rather than being guessed at).

**`sendTemplate` is reached too** (re-checked 08-15): `/demo`'s send-a-text form and RowDetail's
"Send another nudge" both POST `/api/messages/send` (`Demo.tsx:173`, `RowDetail.tsx:50`). Older
lines in §8.3 calling it unreached are stale.

**The approvals row is the one most likely to bite on stage.** An order over the $150/mo threshold
ships to the vendor whether or not the DON ever looks at it. Demo the queue as a *design*, not as a
gate.

**The roles claim is now fully true** (08-15). `Actor` still names the channel, and a new
`actor_role` column records which of the six personas acted on internally-driven events —
order placed, swap, cancel, nurse pickup trigger, driver POD. Mock auth, so the header is
trusted rather than verified; the ledger records it, it doesn't authenticate it. Say it that
way on stage.

---

## 3 · Designed only — deliberately not built

Saying this out loud is worth points. FAQ §9 explicitly praises forward-compatible design,
and FAQ §6 penalises manufactured precision.

| Thing | Where | Why not built |
|---|---|---|
| IVR / voice call channel | `docs/IVR-SIM-SPEC.md`, 562 lines | Shelved for the demo in favour of the magic-link + SMS path. The spec is the answer to "what about vendors on landlines" |
| Live inventory check | `INTEGRATION-SKETCH.md` | FAQ §9 says it won't exist in practice; designed as a hook with graceful fallback |
| eRx / EMR integration | `INTEGRATION-SKETCH.md`, 305 lines | Diagram only, which is all Deliverable D asks for |
| Server-side approval gate | `docs/UX-FLOWS.md` §6 | `pending_approval` state, persistence, and approval-latency reporting are specified but not built |
| Driver's stop view | `docs/SMS-BATCHING-SPEC.md` §6 | The other end of the trip: `/driver` grouping jobs into one card per (household × direction), one signature for the visit but per-item condition and completion. Not built — it touches the POD flow, and scenario 2 demos on the two per-order cards. **Trip batching itself is built** — see §1. Also unbuilt from that spec, on purpose: the tier-3 burst trigger (§10.4 — the shipped exhaustion digest subsumes it) and the group nag (§10.3) |
| Vendor relationship base | this row is the design | A hospice-side directory page for the vendor network: every vendor with contact, service area, and their scorecard/verified-vs-claimed numbers in one place, plus **add** (the same `POST /api/vendors` the order form already calls — the button just moves), **edit** (name/contact/area), and **remove** (deactivate, never delete — orders and the event ledger reference vendors, so removal is a `status` flag that hides them from pickers, exactly like patients). Also the natural second home for add-vendor inside the swap dialog: recruiting someone new at the moment your usual vendor goes silent. Not built because the demo's rolodex beat lives on `/order` and neither scenario browses a directory |
| Real SMS gateway (Twilio) | `deliverables/ASSUMPTIONS.md` → *Simulated, not sent* | **Scoped and deliberately declined.** No dependency, no key, no webhook. The routing and the gate are what earn the AI row; a live carrier on conference wifi is a failure mode with no upside. Delivery is the only thing simulated — the magic links in the bubbles are real `/portal/<token>` URLs |

---

## 4 · Not yet built

⚠️ **`docs/BUILD-DAY-TASKS.md` still has zero checked boxes** (0 of 25, re-counted 08-14) and is
not a reliable picture. People shipped and never ticked. The list below is what's genuinely still
open, checked against the code.

### Already done, despite an unchecked box

Magic-link portal · nurse-initiated pickup · POD condition checklist · SLA defaults ·
DON reports view · expand-the-world seed · `host: true` · POD photo thumbnails ·
verified-vs-vendor-reported badges · measured token costs · **role-filtered nav** ·
**mock role login** · **`PortalShell` for magic links** · **exits on `/nurse` and `/reports`** ·
**slides drafted** (333 lines, no longer a skeleton) · **rubric audit 1** (`RUBRIC-AUDIT-1.md`).

### Genuinely still open — product

| Gap | Size | Why it matters |
|---|---|---|
| ~~Backtest stat~~ | — | **Done 08-15** — `npm run backtest` (`scripts/backtest.ts`) replays the seeded year through `computeRisk` tick by tick, honestly (state from events, flags only before the deadline): 78% of late deliveries caught a median 8.7h early, 27% false alarms, plus a 50/70/90 threshold sweep. Wired into AI-APPROACH.md. Labelled SYNTHETIC everywhere. **Re-run after reseeding — numbers move with the seed date** |
| **Approvals don't persist or gate** | M | See §2. **Team decision 08-15 (Angel): keep mocked.** Do not click Approve on stage as if it gates dispatch |
| ~~`Actor` has no role split~~ | — | **Done 08-15** — `actor_role` on `order_events`, `X-Role` header attached by the api helper, timeline shows "by Case Manager". See §2 |
| **Medication spend on the cost card is invented** | — | *DME pricing is already real* — `mockHcpcsPricing` reads CMS allowed amounts from `shared/catalog.ts` despite the "mock" name. What is fabricated is `med_spend_usd`, and BetterRX is a pharmacy company, so that is the number they would recognise. No public per-patient figure exists — hospice drugs sit inside the per-diem like DME — so both bars are provenance-badged (`CMS data` / `synthetic`) rather than faked better |
| **Live-test the AI parse** | S–M | Needs `ANTHROPIC_API_KEY` and a run of the six spec messages through the vendor simulator. Untested prompts are a bad thing to discover on stage |
| **Risk engine credibility pass** | M | Tune weights and threshold in `server/risk.ts`, keep tests green |
| ~~**`sms.ts` has no UI path**~~ | — | **Closed 08-14** — see §8.3. Both phones POST to `/api/messages/reply`; only `sendTemplate` was left unreached, and `/demo` now calls that too. 521 lines, 64 tests |
| **Demo-seed polish** | S | Names, timings, and data that read well projected |
| **Visual polish pass** | M | Spacing, hierarchy, at-risk treatment, empty states (favicon done — inline coral-pill SVG in `client/index.html`) |

### Genuinely still open — pitch and process

| Item | Notes |
|---|---|
| **Integration sketch against the real eRx payloads** | FAQ §4 gave actual `newOrUpdatePatient` / `newMedications` JSON — model a `newDmeOrder` as a sibling event type |
| **End-to-end scenario walkthroughs** | All three, click-by-click on the demo machine, then record the backup video |
| **Finalize deliverables B–E** | Backtest stat in, mermaid rendered, demo script matching reality. `AI-APPROACH.md` is 38 lines and the thinnest of the six |
| **Rubric audit 2** | Pre-freeze. Audit 1 landed as `docs/RUBRIC-AUDIT-1.md`; §6 below is the starting map |
| **Submission mechanics** | Formats, deadline, confirmations — nobody has looked |
| **Freeze, then two timed rehearsals** | Five minutes is shorter than it sounds. Rehearse the role switch — the nav rearranging is a beat, not an accident |

### Deliberately out of scope

Vendor network recruitment (FAQ §3 puts it out of scope) · real SMS/telephony · production
auth · any EMR connection beyond a diagram.

---

## 5 · Where the data comes from

The one line that has to be right on stage:

> The equipment catalog and prices are **real CMS data** — the Medicare DMEPOS Public Use
> File, national rows. Every patient, vendor, delivery time, and outcome is **synthetic**,
> because CMS publishes billing, not logistics. There is no public DME delivery-timing data,
> so we generated it from stated vendor profiles and labelled it.

Real: HCPCS codes and descriptions, national beneficiary counts (used as demand weights),
rental vs purchase, average Medicare allowed amounts.

Synthetic: 12 patients and caregivers, 3 vendor personalities, a simulated year of orders,
all delivery times and outcomes, all condition ratings, all vendor performance stats, the
$150/mo approval threshold, every medication spend figure, and — feeding the contract-leverage
panel — which deliveries got a driver POD and whether an unverified late delivery was reported
as on-time anyway (per-vendor `pod_rate` / `fudge_rate` in the seed).

---

## 6 · Rubric evidence map

| Judging row | Weight | Features that earn it |
|---|---:|---|
| Differentiation from current DME approaches | 30% | Caregiver condition channel · vendor scorecards · verified vs vendor-reported · **the trust gap as a contract-renewal number** · silence ladder · nurse-first pickup trigger |
| Addresses core user problems | 25% | Discharge-readiness risk · automatic pickup on death/discharge · condition attestation · calls-avoided counter · cost approvals for the DON |
| Architecture / integration-readiness | 15% | State machine with guarded transitions · SSE · integration sketch modelled on the real eRx payloads · forward-compatible inventory hook |
| AI ROI | 15% | **The split**: model for vendor prose with a confidence gate and review queue; regex for caregiver digits; **a typed digit runs no model at all**. The phones stay clean (time-only receipts) — the trust split shows on the hospice board, where an auto-applied parse flips the state pill and low confidence lands in the review queue. Rules-based risk scoring on purpose, now with a measured backtest |
| UX / intuitiveness | 15% | Six roles on separate surfaces with a **role-filtered nav that visibly rearranges when you switch** · phone simulators · plain-English state labels · reasons in sentences · every hospice page has a designed exit |

---

## 7 · Test coverage

**16 files, 254 tests** (re-derived 08-15 by running the suite on the
merged tree, after contract leverage, the actor-role split, narration, trip batching, and
acknowledgement receipts). Core logic is covered; UI and routes deliberately are not.

| File | Tests | Covers |
|---|---:|---|
| `sms.test.ts` | 83 | SMS templates, reply handling, route-table integrity, rotating reply codes, trip-batching replies, gateway-shaped inbound, acknowledgement receipts |
| `reports.test.ts` | 28 | Scorecards, calls avoided, latency, contract leverage (trust gap, cohort minimum, interventions, median answer time, never-answered rate) |
| `narration.test.ts` | 22 | Which events narrate and which never do, enrichment, own-action suppression, collapse |
| `portal.test.ts` | 15 | Magic-link flows |
| `condition.test.ts` | 12 | Caregiver rating parser, including the ambiguity cases |
| `risk.test.ts` | 12 | Risk scoring and thresholds |
| `messaging.test.ts` | 11 | Parse pipeline, confidence gate, decline handling |
| `statemachine.test.ts` | 10 | Transition guards, actor-role attribution |
| `at-risk.test.ts` | 9 | Board selectors |
| `pickups.test.ts` | 9 | Pickup triggers, trip grouping per vendor |
| `silence.test.ts` | 8 | Silence ladder |
| `evidence.test.ts` | 7 | Verified vs reported |
| `pickup-clock.test.ts` | 6 | Pickup clocks |
| `pods.test.ts` | 6 | POD capture and conditions |
| `sla.test.ts` | 5 | SLA defaults |

`narration.test.ts` is the one exception to "UI stays test-free", and only because the decision it
guards is a pure function: `client/src/lib/narration.ts` imports nothing from React or `sonner`, so
the node-environment runner can import it by relative path exactly the way `at-risk.test.ts` already
imports `client/src/lib/atRisk`. The rule it protects — `risk_updated` never narrates — is the
difference between a live board and a smoke alarm, because the watchdog fires that event per order
every 30 seconds.

**Not covered by any test:** the role filter, `homeFor()`, the landing page, `PortalShell` routing,
the action handoffs, and every page component. That's a deliberate line — UI stays test-free — but
it means the nav filtering and the handoffs are verified by clicking, not by CI.

---

## 8 · Known gaps worth a decision before freeze

1. **Cost approvals look real and aren't** — *labelled, not wired* (08-14). `decide()` is still
   local state; nothing persists and nothing gates dispatch. The screen no longer implies
   otherwise: `synthetic` badge plus "Design preview — decisions aren't saved yet". Wiring it is
   post-hackathon; until then, demo the queue as a design.
2. ~~**`/vendor` is labelled "Vendor phone" in the nav and `/vendor-phone` also exists.**~~
   **Closed 08-14.** `/vendor` is now "Dispatcher board" in both the nav link and the page's own
   `PersonaHeader`, which is what it actually is: a dispatcher's order board that happens to carry
   an in-page thread. "Vendor phone" now means exactly one thing — `/vendor-phone`, named "DME
   vendor's phone" in the account menu. Nothing about the routes changed, only the labels.
   **Superseded 08-14 (overnight):** `/vendor` has since left the nav altogether, along with the
   tokenless `/vendor-portal`. Both routes still resolve; neither is a link any more. Dispatcher's
   single nav anchor is **Driver**, the other vendor-side surface inside the Shell.
3. ~~`sms.ts` has no UI path.~~ **Closed 08-14 — the reply half is wired.** Both phones POST to
   `/api/messages/reply` against the newest open question, so the vendor phone carries **both**
   paths in one text box. That is the AI argument made visible rather than asserted: a bare digit
   is deterministic (route table, no model, nothing to review), typed prose goes to Claude behind
   the 0.8 gate with the review queue underneath. `sendTemplate` remains unreached — see §2.

   **The buttons were removed the same day they shipped.** They looked wrong, and they were: a
   real iPhone or Android renders an SMS as text, with nothing tappable in it. Both phones are
   now type-only, and `handleReply` treats a bare `[1-9]` in the body exactly like a structured
   `digit` — which is also what a gateway does, since "1" arrives as text with nothing marking
   it as a digit. Without that server change, deleting the buttons would have quietly routed
   every typed "1" to Claude. Covered by *a typed digit routes like a structured one* in
   `tests/sms.test.ts`.

   **Demo note:** typing a digit only resolves deterministically while a question is open. If a
   rehearsal ends with every question answered, a typed "1" is just prose to the parser — that is
   correct behaviour, not a bug. Re-seed and the request lands fresh.
4. **Six roles in the switcher, three in the pitch.** Dispatcher, Driver and Field Nurse are
   selectable. Decide whether we present six personas or three plus supporting cast.
5. **Re-seed on demo morning.** Demo orders are `now + N hours`, so a database seeded the
   day before has deadlines already in the past and the board looks broken. `npm run seed`
   prints a risk check for exactly this reason.
6. **Both phone screens are simulators.** Nobody should discover that from a judge's
   question. The written answer to "why not real SMS?" now lives in
   `deliverables/ASSUMPTIONS.md` → *Simulated, not sent* — including what the choice costs us
   (we can't claim a deliverability number, and the silence ladder assumes delivery receipts a
   simulator can't produce).
