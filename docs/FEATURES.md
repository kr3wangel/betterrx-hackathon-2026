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
grep -oE "routes\.(get|post)\('[^']+'" server/routes.ts | sort -u   # every endpoint (31)
grep -oE 'path="[^"]*"' client/src/App.tsx | sort -u                # every screen (13)
grep -n "roles:" client/src/App.tsx                                  # who sees which nav link
npm run typecheck && npm test                                        # it all still holds
```

**Last verified against `main` on 2026-08-14**, after the role-filtered nav and `PortalShell`
merge (`6696d8c`, `d331fb1`). Every count in this file was re-derived on that pass, not carried
over.

---

## 1 · Working — you can click it right now

### Surfaces in the nav

| Route | Label | What it does |
|---|---|---|
| `/hospice` | Board | Case-manager board, rebuilt as v8: three sections (Needs you / On the way / Done) of five-slot rows, tap-open detail with risk reasons and evidence, escalation acknowledge, AI-parse review queue (confirm / reject), swap-vendor dialog. **The inline new-order form and the EMR simulator are no longer here** — ordering is `/order`, the EMR feed moved to `/demo` |
| `/order` | New order | Place an order. SLA defaults applied by urgency — same-day for urgent, 24h routine |
| `/nurse` | Nurse | Nurse-in-the-field status change. Death or discharge fires the pickup trigger directly, ahead of EMR propagation |
| `/vendor` | Dispatcher board | Dispatcher board plus an in-page phone simulator — free-text reply, watch it parse |
| `/driver` | Driver | Phone-sized. Today's deliveries and pickups, POD capture: photo, signature, and a condition attestation |
| `/vendor-portal` | Portal | No-login vendor portal — the internal demo entry, no token |
| `/reports` | Reports | Vendor scorecards, condition stats, calls-avoided counter, pickup latency, DME spend, cost-threshold approvals |

**The nav is role-filtered.** Each entry carries `roles: RoleId[]` and `Shell()` filters it against
the signed-in role: Case Manager sees Board / New order / Nurse / Reports; Admissions Nurse sees
Board / New order; Field Nurse sees Board / Nurse; DON sees Board / Reports; Dispatcher sees Vendor
phone / Portal; Driver sees Driver; **signed out sees everything**. Routes are deliberately *not*
guarded — hiding a link never blocks a URL, so no screen becomes unreachable mid-demo. Full map in
[UX-FLOWS.md](UX-FLOWS.md).

### Off the surface nav — demo props and magic links

| Route | Chrome | Reached by | What it does |
|---|---|---|---|
| `/demo` | full Shell | Typed URL only — not in the nav, not in the account menu | The presenter's panel: mark a patient discharged or deceased (the EMR fallback path), and send any templated text by hand. Took both off the board in the v8 rebuild |
| `/o/:token` | `PortalShell` | **The link in every vendor text** | That one order, its actions, and a link onward to the vendor's full portal if they have other work open. 10-character token, so the URL fits a text |
| `/caregiver` | none | Account menu → Simulated phones (new tab), or typed URL | The family's phone. Full-screen SMS simulator: condition check arrives, reply 1–5 or free text, outcome shown as a delivery receipt |
| `/vendor-phone` | none | Account menu → Simulated phones (new tab), or typed URL | The dispatcher's phone. **Two reply paths in one text box:** type a bare digit against an open question (deterministic route table, no model) or type prose (Claude, showing intent, confidence, and applied / sent-to-a-person). No buttons — SMS has none |
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
| Vendor SMS parsing | `messaging.ts` + `llm.ts` | Claude, with a confidence gate — ≥0.8 auto-applies, below lands in the human review queue |
| Caregiver condition parsing | `condition.ts` | **Deterministic regex, no model.** A digit is a digit |
| Household messaging | `messaging.ts` | `sendToFamily` with a gate — silent after a death, one open question at a time |
| Magic-link tokens | `portal.ts` | Vendor access with no account |
| Roles / mock login | `client/src/lib/auth.tsx` | 6 roles, `AuthProvider`, `useAuth()`, localStorage-backed. **Client-side only** — see §2 |
| SLA defaults | `sla.ts` | Same-day urgent, 24h routine, stated as an assumption per FAQ §7 |
| Proof of delivery | `pods.ts` | Photo, signature, timestamp, plus condition attestation |
| EMR webhook | `pickups.ts` | Simulated patient-status events drive automatic pickup |
| Reports | `reports.ts` | Vendor scorecards, calls avoided, pickup latency |
| Live updates | `sse.ts` + `useEventStream` | One shared SSE stream app-wide |
| Synthetic world | `scripts/seed.ts` + `shared/catalog.ts` | CMS-grounded 12-code catalog, a simulated year, vendor stats **derived** from it |

---

## 2 · Built but not surfaced, or surfaced but not real

Real, tested code with no path to it from the UI — and UI with no real code behind it. Either wire
these up or don't claim them.

| Thing | Evidence | Status |
|---|---|---|
| `POST /api/messages/send` — send any templated message | `sms.ts` `sendTemplate` | **Now called** by `/demo`'s send-a-text form (`Demo.tsx`) and RowDetail's "Send another nudge" |
| Cost-threshold approvals on `/reports` | `Reports.tsx:450` `decide()` | **UI only.** Local `useState` — no API call, no persistence, no ledger event, and **nothing gates dispatch** |
| Roles / sign-in | `App.tsx:47` is the only `useAuth` consumer | **Nav filtering only.** No page branches on role, no route guards, and `Actor` on the server has no matching split |

**`/api/messages/reply` is now wired** (08-14). `VendorPhone` renders tappable quick replies under
the most recent unanswered question and POSTs the digit; the reply resolves through `sms.ts`'s
`template × digit → action` table with no model in the loop. Verified against a running server, not
just typechecked — all four branches exercised: `applied` (digit 1 on a pickup request moved order
2086 to `pickup_pending`), `prompt` (digit 2 replies *"When can you collect it? Text back a day and
time."*), `review` (re-answering an already-answered question does **not** re-apply), and
`unmapped` (digit 9 goes to the review queue rather than being guessed at).

`sendTemplate` is still unreached — it's the presenter's "fire any template on demand" button,
which no screen exposes. That one may genuinely be a spare tyre; the reply half was the missed
integration.

**The approvals row is the one most likely to bite on stage.** An order over the $150/mo threshold
ships to the vendor whether or not the DON ever looks at it. Demo the queue as a *design*, not as a
gate.

**The roles row is the honest framing of a real win.** Identity shipped and the nav filters on it —
but `shared/types.ts:26` still has `Actor = 'hospice' | ...` as one undivided value, so the
append-only ledger cannot record *which* of the six roles acted. We tell judges the ledger captures
who acted and through which channel; that's true of vendors and not yet of us.

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
| Trip batching + vendor-side question gate | `docs/SMS-BATCHING-SPEC.md` | One text per trip instead of per order (Ruth's two pickups = one message), volume-adaptive digests, and a one-open-question gate so a bare "1" can never be ambiguous on a real gateway. **Batches the asking, never the answering** — per-order events, clocks, and escalations untouched. The answer to "what happens when a vendor has twenty of these?" |
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
| **Backtest stat** | M | Re-checked 08-14: **nothing anywhere in the repo.** "Flagged N% of late deliveries X hours early, false-positive rate Y%" is one slide with a big payoff. **Must be labelled SYNTHETIC in large type** — FAQ §6 penalises manufactured precision, and the honesty is the point |
| **Approvals don't persist or gate** | M | See §2. Server state + `pending_approval` + dispatch gate, then approval latency on `/reports` |
| **`Actor` has no role split** | S | Six roles in the client, one `'hospice'` in the ledger. The client already has the enum to copy |
| **Medication spend on the cost card is invented** | — | *DME pricing is already real* — `mockHcpcsPricing` reads CMS allowed amounts from `shared/catalog.ts` despite the "mock" name. What is fabricated is `med_spend_usd`, and BetterRX is a pharmacy company, so that is the number they would recognise. No public per-patient figure exists — hospice drugs sit inside the per-diem like DME — so both bars are provenance-badged (`CMS data` / `synthetic`) rather than faked better |
| **Live-test the AI parse** | S–M | Needs `ANTHROPIC_API_KEY` and a run of the six spec messages through the vendor simulator. Untested prompts are a bad thing to discover on stage |
| **Risk engine credibility pass** | M | Tune weights and threshold in `server/risk.ts`, keep tests green |
| **`sms.ts` has no UI path** | ? | 331 lines, 33 tests, two endpoints nothing calls — see §2. Wire it or drop the claim |
| **Demo-seed polish** | S | Names, timings, and data that read well projected |
| **Visual polish pass** | M | Spacing, hierarchy, at-risk treatment, empty states, favicon |

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
$150/mo approval threshold, and every medication spend figure.

---

## 6 · Rubric evidence map

| Judging row | Weight | Features that earn it |
|---|---:|---|
| Differentiation from current DME approaches | 30% | Caregiver condition channel · vendor scorecards · verified vs vendor-reported · silence ladder · nurse-first pickup trigger |
| Addresses core user problems | 25% | Discharge-readiness risk · automatic pickup on death/discharge · condition attestation · calls-avoided counter · cost approvals for the DON |
| Architecture / integration-readiness | 15% | State machine with guarded transitions · SSE · integration sketch modelled on the real eRx payloads · forward-compatible inventory hook |
| AI ROI | 15% | **The split**: model for vendor prose with a confidence gate and review queue; regex for caregiver digits; **a tapped quick reply on the vendor phone runs no model at all**, so the same thread shows both trust levels. Rules-based risk scoring on purpose |
| UX / intuitiveness | 15% | Six roles on separate surfaces with a **role-filtered nav that visibly rearranges when you switch** · phone simulators · plain-English state labels · reasons in sentences · every hospice page has a designed exit |

---

## 7 · Test coverage

**14 files, 150 tests** (re-derived 08-14). Core logic is covered; UI and routes deliberately
are not.

| File | Tests | Covers |
|---|---:|---|
| `sms.test.ts` | 35 | SMS templates, reply handling, and quick-reply/route-table drift |
| `reports.test.ts` | 15 | Scorecards, calls avoided, latency |
| `condition.test.ts` | 12 | Caregiver rating parser, including the ambiguity cases |
| `risk.test.ts` | 12 | Risk scoring and thresholds |
| `messaging.test.ts` | 11 | Parse pipeline, confidence gate, decline handling |
| `at-risk.test.ts` | 9 | Board selectors |
| `portal.test.ts` | 9 | Magic-link flows |
| `statemachine.test.ts` | 9 | Transition guards |
| `silence.test.ts` | 8 | Silence ladder |
| `evidence.test.ts` | 7 | Verified vs reported |
| `pickup-clock.test.ts` | 6 | Pickup clocks |
| `pickups.test.ts` | 6 | Pickup triggers |
| `pods.test.ts` | 6 | POD capture and conditions |
| `sla.test.ts` | 5 | SLA defaults |

**Not covered by any test:** the role filter, `PortalShell` routing, and every page component.
That's a deliberate line — UI stays test-free — but it means the nav filtering is verified by
clicking, not by CI.

---

## 8 · Known gaps worth a decision before freeze

1. **Cost approvals look real and aren't.** `decide()` is local state; nothing persists and
   nothing gates dispatch. Either wire it or make sure nobody clicks Approve on stage as if it
   blocks an order.
2. ~~**`/vendor` is labelled "Vendor phone" in the nav and `/vendor-phone` also exists.**~~
   **Closed 08-14.** `/vendor` is now "Dispatcher board" in both the nav link and the page's own
   `PersonaHeader`, which is what it actually is: a dispatcher's order board that happens to carry
   an in-page thread. "Vendor phone" now means exactly one thing — `/vendor-phone`, named "DME
   vendor's phone" in the account menu. Nothing about the routes changed, only the labels.
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
