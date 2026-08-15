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
grep -oE "routes\.(get|post)\('[^']+'" server/routes.ts | sort -u   # every endpoint
grep -oE 'path="[^"]*"' client/src/App.tsx | sort -u                # every screen
npm run typecheck && npm test                                        # it all still holds
```

Last verified against `main` on build day, after the reports/nurse/portal merge.

---

## 1 · Working — you can click it right now

### Surfaces in the nav

| Route | Label | What it does |
|---|---|---|
| `/hospice` | Board | Case-manager board. Orders by state, risk flags with reasons, escalation bar with acknowledge, AI-parse review queue (confirm / reject), vendor swap, EMR simulator (discharge / deceased) |
| `/order` | New order | Place an order. SLA defaults applied by urgency — same-day for urgent, 24h routine |
| `/nurse` | Nurse | Nurse-in-the-field status change. Death or discharge fires the pickup trigger directly, ahead of EMR propagation |
| `/vendor` | Vendor phone | Dispatcher board plus an in-page phone simulator — free-text reply, watch it parse |
| `/driver` | Driver | Phone-sized. Today's deliveries and pickups, POD capture: photo, signature, and a condition attestation |
| `/vendor-portal` | Portal | No-login vendor portal |
| `/reports` | Reports | Vendor scorecards, condition stats, calls-avoided counter, pickup latency, DME spend |

### Unlisted routes — demo props and magic links

| Route | What it does |
|---|---|
| `/caregiver` | The family's phone. Full-screen SMS simulator: condition check arrives, reply 1–5 or free text, outcome shown as a delivery receipt |
| `/vendor-phone` | The dispatcher's phone. Same chrome, but replies are parsed by a model and show intent, confidence, and applied / sent-to-a-person |
| `/portal/:token` | Magic-link vendor portal — confirm, set ETA, decline. No account |
| `/status/:token` | Vendor status view |

Both phone simulators share `components/PhoneScreen.tsx` and `PhoneKeyboard.tsx`, including
a fake on-screen keyboard that suppresses itself on real handsets.

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
| SLA defaults | `sla.ts` | Same-day urgent, 24h routine, stated as an assumption per FAQ §7 |
| Proof of delivery | `pods.ts` | Photo, signature, timestamp, plus condition attestation |
| EMR webhook | `pickups.ts` | Simulated patient-status events drive automatic pickup |
| Reports | `reports.ts` | Vendor scorecards, calls avoided, pickup latency |
| Live updates | `sse.ts` + `useEventStream` | One shared SSE stream app-wide |
| Synthetic world | `scripts/seed.ts` + `shared/catalog.ts` | CMS-grounded 12-code catalog, a simulated year, vendor stats **derived** from it |

---

## 2 · Built but not surfaced

Real, tested code with no path to it from the UI. Either wire it up or don't claim it.

| Thing | Evidence | Status |
|---|---|---|
| `POST /api/messages/send` — send any templated message | `sms.ts` `sendTemplate` | **No client caller** — presenter escape hatch, curl only |

`POST /api/messages/reply` is **wired**: both phone simulators render the digit options of
whatever question is still open (`components/QuickReplies.tsx`) and post them to the router,
so a tapped digit applies at confidence 1.0 with no model call.

---

## 3 · Designed only — deliberately not built

Saying this out loud is worth points. FAQ §9 explicitly praises forward-compatible design,
and FAQ §6 penalises manufactured precision.

| Thing | Where | Why not built |
|---|---|---|
| IVR / voice call channel | `docs/IVR-SIM-SPEC.md`, 562 lines | Shelved for the demo in favour of the magic-link + SMS path. The spec is the answer to "what about vendors on landlines" |
| Live inventory check | `INTEGRATION-SKETCH.md` | FAQ §9 says it won't exist in practice; designed as a hook with graceful fallback |
| eRx / EMR integration | `INTEGRATION-SKETCH.md` | Diagram only, which is all Deliverable D asks for |
| Real SMS gateway | — | Both phone screens are simulators. Say so before anyone asks |

---

## 4 · Not yet built

⚠️ **`docs/BUILD-DAY-TASKS.md` has zero checked boxes** and is no longer a reliable
picture. People shipped and never ticked. The list below is what's genuinely still open,
checked against the code — several board items are done and several aren't.

### Already done, despite an unchecked box

Magic-link portal · nurse-initiated pickup · POD condition checklist · SLA defaults ·
DON reports view · expand-the-world seed · `host: true` · POD photo thumbnails ·
verified-vs-vendor-reported badges · measured token costs.

### Genuinely still open — product

| Gap | Size | Why it matters |
|---|---|---|
| **Backtest stat** | M | Nothing anywhere in the repo. "Flagged N% of late deliveries X hours early, false-positive rate Y%" is one slide with a big payoff. **Must be labelled SYNTHETIC in large type** — FAQ §6 penalises manufactured precision, and the honesty is the point |
| **Medication spend on the cost card is invented** | — | *DME pricing is already real* — `mockHcpcsPricing` reads CMS allowed amounts from `shared/catalog.ts` despite the "mock" name. What is fabricated is `med_spend_usd` (`1800 + patientId % 7 * 240`), and BetterRX is a pharmacy company, so that is the number they would recognise. No public per-patient figure exists — hospice drugs sit inside the per-diem like DME — so both bars are now provenance-badged (`CMS data` / `synthetic`) rather than faked better |
| **Live-test the AI parse** | S–M | Needs `ANTHROPIC_API_KEY` and a run of the six spec messages through the vendor simulator. Untested prompts are a bad thing to discover on stage |
| **Risk engine credibility pass** | M | Tune weights and threshold in `server/risk.ts`, keep tests green |
| **`sms.ts` has no UI path** | ? | 331 lines, 33 tests, two endpoints nothing calls — see section 2. Wire it or drop the claim |
| **Demo-seed polish** | S | Names, timings, and data that read well projected |
| **Visual polish pass** | M | Spacing, hierarchy, at-risk treatment, empty states, favicon |

### Genuinely still open — pitch and process

| Item | Notes |
|---|---|
| **Slides** | 4–5, demo-first. `docs/deliverables/SLIDES.md` is a skeleton, not slides |
| **Integration sketch against the real eRx payloads** | FAQ §4 gave actual `newOrUpdatePatient` / `newMedications` JSON — model a `newDmeOrder` as a sibling event type |
| **End-to-end scenario walkthroughs** | All three, click-by-click on the demo machine, then record the backup video |
| **Finalize deliverables B–E** | Backtest stat in, mermaid rendered, demo script matching reality |
| **Rubric audit ×2** | Mid-day and pre-freeze. Section 5 below is the starting map |
| **Submission mechanics** | Formats, deadline, confirmations — nobody has looked |
| **Freeze, then two timed rehearsals** | Five minutes is shorter than it sounds |

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
all delivery times and outcomes, all condition ratings, all vendor performance stats.

---

## 6 · Rubric evidence map

| Judging row | Weight | Features that earn it |
|---|---:|---|
| Differentiation from current DME approaches | 30% | Caregiver condition channel · vendor scorecards · verified vs vendor-reported · silence ladder · nurse-first pickup trigger |
| Addresses core user problems | 25% | Discharge-readiness risk · automatic pickup on death/discharge · condition attestation · calls-avoided counter |
| Architecture / integration-readiness | 15% | State machine with guarded transitions · SSE · integration sketch modelled on the real eRx payloads · forward-compatible inventory hook |
| AI ROI | 15% | **The split**: model for vendor prose with a confidence gate and review queue; regex for caregiver digits, said out loud. Rules-based risk scoring on purpose |
| UX / intuitiveness | 15% | Three personas on separate surfaces · phone simulators · plain-English state labels · reasons in sentences |

---

## 7 · Test coverage

14 files, **144 tests**. Core logic is covered; UI and routes deliberately are not.

| File | Tests | Covers |
|---|---:|---|
| `sms.test.ts` | 33 | SMS templates and reply handling |
| `reports.test.ts` | 15 | Scorecards, calls avoided, latency |
| `condition.test.ts` | 12 | Caregiver rating parser, including the ambiguity cases |
| `risk.test.ts` | 12 | Risk scoring and thresholds |
| `at-risk.test.ts` | 9 | Board selectors |
| `portal.test.ts` | 9 | Magic-link flows |
| `statemachine.test.ts` | 9 | Transition guards |
| `silence.test.ts` | 8 | Silence ladder |
| `messaging.test.ts` | 7 | Parse pipeline |
| `evidence.test.ts` | 7 | Verified vs reported |
| `pickups.test.ts` · `pickup-clock.test.ts` · `pods.test.ts` | 18 | Pickup triggers, clocks, POD conditions |
| `sla.test.ts` | 5 | SLA defaults |

---

## 8 · Known gaps worth a decision before freeze

1. **`/vendor` is labelled "Vendor phone" in the nav and `/vendor-phone` also exists.** Two
   things, nearly one name. Pick which one the demo drives.
2. **`sms.ts` has no UI path** — see section 2.
3. **Re-seed on demo morning.** Demo orders are `now + N hours`, so a database seeded the
   day before has deadlines already in the past and the board looks broken. `npm run seed`
   prints a risk check for exactly this reason.
4. **Both phone screens are simulators.** Nobody should discover that from a judge's
   question.
