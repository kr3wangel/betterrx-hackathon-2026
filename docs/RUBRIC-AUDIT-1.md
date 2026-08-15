# Rubric Audit 1 — mid-day, against main

Audited at `c6fa709`. **For the team, not the judges.** Nothing below is softened.

## Ground truth (run, not assumed)

| Check | Result |
|---|---|
| `npm test` | **144 passed / 14 files.** Real coverage: state machine, risk, silence ladder, pickup clock, portal, PODs, evidence flags, condition parser, SMS reply routes, reports. |
| `npm run typecheck` | **RED.** `tests/at-risk.test.ts(13,3)` — the `Order` fixture is missing `family_confirmed` (made required by the SMS work in `3638dd0`). Client tsconfig is clean. **`npm run build` is therefore broken on main**, against our own DoD. One-line fix: add `family_confirmed: false` to the fixture at `tests/at-risk.test.ts:13`. |
| `npm run seed` / `scenario1|3` | Works. Boots clean. |
| Server boot + smoke | `GET /api/orders`, `/api/reports/summary`, `/api/reports/vendor-scorecards`, `/api/portal/<v1 token>` all 200. `/api/portal/<v4 token>` **404** — vendor 4 doesn't exist (see cross-check 1). |

**What landed since the deliverables were written** (and is not reflected in them): the case-manager board rebuild + at-risk selector (`7c7d6be`, `77799b9`), the simulated-SMS digit layer (`3638dd0`, `ec73fe8`, `3d7f542`), reports endpoints (`2f0a249`), POD condition attestation (`116cf7e`), pickup-clock anchor fix (`6913f0e`), and the Lane E vendor portal at `/portal/:token` (`f161481`, `045fc4e`).

---

## Row 1 — Differentiation from current DME · 30%

**Evidence that exists (strongest first)**

1. **Silence ladder, running and tested.** `server/watchdog.ts:85-96` — nag at `ACK_NAG_HOURS` (default 2), escalate at `ACK_ESCALATE_HOURS` (default 2), nag matched *by template* not body so it never re-fires (`ackNagSentAt()`, and `tests/sms.test.ts:469`). 8 tests in `tests/silence.test.ts`.
2. **Verified vs vendor-reported, on screen.** `delivery_verified`/`pickup_verified` derived from the `pods` table in `server/store.ts`; `EvidenceBadge` on the card and per-event on the timeline (`OrderCard.tsx:62,124,161-179`), with a legend on the board (`Hospice.tsx:270-284`) and the line "reported by text; doesn't clear the risk flag". Teeth are real: an unproven `delivered`/`picked_up` claim opens its own escalation (`server/messaging.ts:298-312`), covered by `tests/evidence.test.ts`.
3. **Nurse-primary / EMR-fallback pickup through one function.** `setPatientStatus()` in `server/pickups.ts`; both routes exist (`routes.ts:155,160`); `payload.source: 'nurse' | 'emr'` on the event; `tests/pickups.test.ts`.
4. **Deterministic digit layer with no model in it.** `REPLY_ROUTES` in `server/sms.ts` — the same "1" means "it arrived" under `f_delivery_confirm` and "unusable" under `f_condition_check`, disambiguated by template, never by the model. 482 lines of tests in `tests/sms.test.ts`, including the household gate (silent to a grieving house, STOP honoured, one open question at a time).
5. **Caregiver condition channel** (`server/condition.ts`, `tests/condition.test.ts`) — FAQ §9's named differentiator, deterministic 1–5 parse that returns `null` rather than guessing.
6. **Doc:** `DIFFERENTIATION.md` names the FAQ §3 floor out loud and refuses to claim it. That posture is worth points on its own.

**Can claim vs must label**

- Claim as built: silence ladder, verified/reported + escalations, nurse+EMR shared trigger, magic-link portal, digit routes, condition parser.
- Must label spec'd/production-path: IVR/voice fork, rung-4 vendor API, live inventory port.
- **Must NOT claim as demoable today:** driver condition attestation (see gap 2) and the digit-reply channel (see gap 3). Both are real code with no way to reach them from a screen.

**Gaps, ranked by cost to this row**

1. **Scenario 3 cannot walk as written, and it is the beat we said is never cut.** `scripts/seed.ts:448-450` still seeds `#1060` and `#1061` to **vendor 1 (Wasatch, full history), state `dispatched`**. So (a) there is no cold-start vendor — "this vendor has never heard of us" is false on screen; (b) the silence ladder gates on `order.state === 'ordered'`, so **the nag and the escalation cannot fire at all**. None of the `[SEED PENDING]` edits in DEMO-SCRIPT §pre-demo have landed. This is the single largest hole in the whole audit.
2. **The condition attestation has no UI path.** `Driver.tsx:91-96` posts `kind`/`photo_data_url`/`signature_data_url` and **no `condition`** — `server/pods.ts` stores NULL, so the condition chips on the card never render and `components/ConditionChecklist.tsx` is imported by nothing. The SLIDES show-off inbox line "Driver attests clean / functional / patient-ready at delivery" is not walkable.
3. **Nothing in the client calls `/api/messages/reply`.** Every outbound template says "Reply 1 to accept" and the only input in the vendor simulator is a free-text box posting to `/api/messages/inbound` (`Vendor.tsx:88`). A judge who reads the message body and tries to press 1 finds nowhere to do it.
4. Magic links render as plain text (`Vendor.tsx:66`) — the vendor-taps-a-link beat needs a copy-paste on stage.

**Verdict: AT-RISK.** The code is the strongest part of this repo; the demo can't show it. Highest-leverage fix: **land the seed edits** (vendor 4 with no stats, scenario-3 orders in `ordered`, backdated `#1061`).

---

## Row 2 — Addresses core user problems · 25%

**Evidence that exists**

1. **The case-manager board is real and good.** `Hospice.tsx` — six live SSE-driven fetches; needs-attention band (`atRisk.ts`, 10 tests); escalation banner with an inline **Swap vendor** control (`:102-137`, `:297-321`); AI review queue with Apply/Dismiss (`:385-451`); EMR simulator (`:453-489`); a "Glance" strip that already renders the **calls-avoided** number live off `/api/reports/summary` (`:75-87`).
2. **Both failure moments close end-to-end in code**: discharge (risk → swap → confirm → POD) and post-death pickup (status → auto pickup → driver job → POD → family notified).
3. **The vendor portal is genuinely finished** — `/portal/:token`, `PortalOrderCard` with confirm / accept-with-ETA / can't-fill, SLA deadline badges ("due in 4h" / "late by 2h"), live over SSE.
4. Respectful copy is real, not aspirational — pickup jobs carry the grieving-family line; the household gate refuses to text questions into a house after a death.

**Can claim vs must label**

- Claim: the case-worker persona is fully served.
- **Label honestly:** "three personas, three surfaces" is currently **one** surface. `/nurse`, `/reports`, and `/order` are all `EmptyState` stubs. Say "two of three personas have screens today" or don't say the number.

**Gaps, ranked**

1. **No nurse screen.** Grep finds **zero** client callers of `POST /api/patients/:id/status`. Scenario 2 can only be driven from the EMR simulator — which is the path FAQ §8 explicitly calls the *fallback*. A judge who read the FAQ and watches us lead with an EMR button will mark this down.
2. **`/reports` is a stub** — the DON persona has no surface, even though both backend routes now exist (`/api/reports/vendor-scorecards`, `/api/reports/summary`) and `summary` is already wired into the board.
3. **The board's primary CTA dead-ends.** `Hospice.tsx:39` does `window.location.href = '/order'` → the stub empty state, *and* it's a full page reload that drops the SSE connection. The working order form is in the right rail. If a judge drives, this is the first thing they click.
4. Seeded PODs carry NULL photo/signature paths (`seed.ts:361,390`) — the POD proof box renders empty unless the POD was captured live during the demo.

**Verdict: ADEQUATE.** The one surface that carries the row is strong; the persona claim is over-stated. Highest-leverage fix: **build `/nurse`** — a patient list, one destructive button, one POST.

---

## Row 3 — Architecture & integration-readiness · 15%

**Evidence that exists**

1. **`INTEGRATION-SKETCH.md`'s "Built vs. sketched" table (lines 19-31) is accurate.** I checked every row against the code. That table is the best asset in the repo for this row — it lets a skeptical judge verify us instead of trusting us.
2. **One state machine, one append-only ledger.** `applyEvent()` validates the transition, writes `order_events`, broadcasts SSE; every route goes through it; `TransitionError` → 409. `tests/statemachine.test.ts`.
3. **The eRx mapping is drawn on the sponsor's real payloads** — `newDmeOrder` as a sibling of `newMedications`, HCPCS where meds carry NDC, same `account`/`patient.identifiers` envelope (§2 of the sketch, against BOUNTY-FAQ §4).
4. Both patient-status paths converge on one function with the source stamped on the event; the second signal is a documented no-op.
5. 144 tests over exactly the logic the sketch claims is load-bearing.

**Can claim vs must label**

- Claim: state machine, ledger, SSE, portal tokens, POD provenance, the two patient-status paths, the SLA defaults (`server/sla.ts`).
- Label sketched: `newDmeOrder`/`dmeOrderStatus` wire contracts, eRx transport/auth/retry, rung-4 vendor API, IVR, live inventory port. The doc already does this correctly — keep it.

**Gaps, ranked**

1. **`npm run typecheck` and `npm run build` are red on main.** For the row that is literally about production-readiness, and against a repo rule that says never push red. One line.
2. The sketch §6 describes `availability: "confirmed" | "unknown"` on the order record — **that field does not exist anywhere in `shared/types.ts` or the server.** It is presented as a designed seam and is fine as such, but do not let anyone say "the order already carries it."
3. `README.md`'s API table and "three working surfaces" section predate the portal, nurse, reports and condition routes. Minor, but it's the first file a judge opens on GitHub.
4. `RISK_THRESHOLD` now exists in three places (`server/risk.ts`, `client/src/lib/atRisk.ts`, `client/src/components/RiskBadge.tsx`).

**Verdict: STRONG.** Best-defended row. Highest-leverage fix: **make typecheck green** (2 minutes) so "it builds" is true when someone asks.

---

## Row 4 — AI ROI · 15%

**Evidence that exists**

1. **The gate is real and is the story.** `CONFIDENCE_THRESHOLD = 0.8` (`server/messaging.ts:18`), applied at `:259-263` — ≥ 0.8 **and** a resolved order **and** a mapped intent auto-applies as actor `ai`; everything else → `review_status: 'needs_review'` on the board. Schema-constrained extraction via `output_config.format: json_schema` (`llm.ts:16`), model `claude-haiku-4-5` (`llm.ts:13`). With no `ANTHROPIC_API_KEY` the parse block is skipped entirely and the message degrades **to the queue** — proven by `tests/messaging.test.ts:45` and `tests/sms.test.ts:245`, both with the key deleted in `beforeEach`.
2. **"Where we didn't use AI" is backed by code, and I verified it rather than trusting it.** `routeDigit()` (`sms.ts:205-286`) contains no `extractJson`, no `await`, no network — it synthesizes `confidence: 1` and reuses the same `INTENT_EVENT` map. The caregiver 1–5 parser is pure regex returning `null` on ambiguity (`condition.ts:57-79`). **Family free text never reaches a model at all**, asserted with the key deleted (`sms.test.ts:373`). Risk is rules with human-sentence reasons.
3. The state machine is a genuine second line of defence — an auto-applied hallucination still has to be a legal transition, and the auto-apply is wrapped so a `TransitionError` demotes back to review (`messaging.ts:264-270`).
4. `scripts/parse-test.ts` is a real 6-case harness against the spec messages, and `server/llm.ts:20` logs per-call token usage.

**Can claim vs must label**

- Claim freely: degrade-to-queue, structured output, model choice, the rules-where-rules-win argument, the digit table. FAQ §6 says this row is judged on **approach and honesty** — that is exactly what we have.
- **Stop claiming, verbatim, that "nothing moves without ≥ 0.8 or a human"** until gap 1 is fixed. It is not true for one intent.
- **Must soften unless someone produces the run:** "measured", "6/6 on Haiku", "~620 in / ~50 out tokens", "1–2s latency". `parse-test.ts` requires a live API key, **no output is committed anywhere**, and `BUILD-DAY-TASKS.md` still has *"Live-test the AI parse"* and *"Capture measured token costs"* **unchecked**. Right now these are estimates wearing the word "measured", on the one row the sponsor said they grade for honesty.

**Gaps, ranked**

1. **`decline` bypasses the confidence gate.** `server/messaging.ts:256-258` runs *before* the threshold check and has no `confidence` term: a model-parsed `decline` at **confidence 0.2 opens an escalation and is marked `auto_applied`** — which also feeds it into `calls_avoided` (`reports.ts:78`). No test covers this branch. It predates the SMS work, so the specs saying "the gate is untouched" are literally true and materially misleading. This is the one thing in the repo a code-reading judge could use to contradict our central AI claim. ~3 lines to fix.
2. **The "6/6" harness is weaker than the claim.** `parse-test.ts` asserts **intent only** (`:43`); order-resolution, ETA resolution and review-queue routing are printed as human notes and checked by nothing. It has no assertions, always exits 0, is not in `npm test`, and is non-deterministic (live model + `Date.now()`-relative deadlines). Honest phrasing: *"on one live run, all six hand-written messages produced the expected intent."*
3. **No in-repo artifact for any of the numbers.** Cheapest fix in the audit: run it once, paste the output into `AI-APPROACH.md`.
4. **The AI beat is barely demoable.** The only inbound-AI UI is the free-text box on `/vendor`; it needs a live key and the venue network, and DEMO-SCRIPT already demotes the parse to a fallback and Q&A. If the key or wifi fails, the 15% row is entirely spoken.
5. The review queue is real but will be **empty** on every seeded scenario — nothing seeds a `needs_review` message. The safety story's best visual is a blank panel unless someone types a deliberately vague message on stage.

**Verdict: ADEQUATE.** The deterministic half of the AI story is genuinely test-covered and the design is honest; the model half rests on one unrecorded manual run, and one intent quietly skips the gate we sell. Highest-leverage fix: **put `decline` behind the 0.8 gate**, then paste a real `parse:test` run.

---

## Row 5 — UX & intuitiveness · 15%

**Evidence that exists**

1. **Plain-English vocabulary is done.** `STATE_LABEL` in `domain.ts:9-18` → "Accepted" / "On the truck" / "Picked up". `REVIEW_STATUS_LABEL`, `INTENT_LABEL`, patient status, deadline sentences ("Needed by Mar 3, 9:00 AM — about 5 hours out") all mapped.
2. **The board reads as a product**, not a dashboard: coral needs-attention panel with "Nothing needs a person right now" as the empty state, one obvious action per escalation, shadcn/ui on BetterRX tokens.
3. **The portal is the best-executed screen in the repo** — no login, big buttons, SLA badges, optimistic updates with toasts.
4. Persona headers on every surface; `host: true` is set in `client/vite.config.ts`, so `/driver` works from a real phone.

**Can claim vs must label**

- Claim: the board and the portal against "your mom's least technical friend".
- Label: the equipment tab in the portal is mock-backed (`mocks.ts`) — the page already says so on screen ("Serial numbers and shelf locations are illustrative"). Keep that sentence; it is the right call.

**Gaps, ranked**

1. **Four of nine routes in the header nav are stubs or dead ends** — `/order`, `/nurse`, `/reports` are empty states, `/vendor-portal` (the "Portal" nav link) always lands on "Open the link we texted you". If a judge takes the laptop, every second click is a placeholder.
2. **Raw enum on the most-shown pane.** `OrderCard.tsx:174` renders `({e.actor})` — "(vendor)", "(system)", "(ai)" — on the expanded timeline, which is exactly where we make the evidence point. `family_confirmed` also falls through to lowercase "family confirmed".
3. `/vendor` and `/driver` still use the legacy `components/ui.tsx` atoms (slate/blue), so two of the three demo tabs are visibly off the design system next to the board.
4. Risk reasons render as joined lowercase fragments with decimals — "vendor has not accepted and deadline is in 3.2h · vendor ETA is after the deadline". True, but it reads like log output next to our own "plain words everywhere" bar.

**Verdict: ADEQUATE** — strong where it's finished, thin the moment anyone leaves the board. Highest-leverage fix: **hide the stub routes from the header nav** so the nav only offers screens that exist (5 minutes, and it converts a weakness into a smaller, tighter product).

---

## Cross-check 1 — claims in SLIDES.md / DEMO-SCRIPT.md the repo can't back

**Seed-dependent, and the seed edits never landed** (`scripts/seed.ts:442-455`):

| Claim | Reality |
|---|---|
| S1 cold open is **Margaret Osei** | scenario1 seeds patient **1, Eleanor Vance** |
| S2 close names **Ruth Nakamura** | scenario2 seeds patient **2, Harold Whitfield** |
| S3 "**Timpanogos Home Medical**, a vendor with zero history" | vendor 4 **does not exist**; `/api/portal/1c2282…` returns 404 and that row of the token table is a dead link |
| S3 #1060 → new vendor, #1061 → Beehive, both **Ordered** | both seed to **vendor 1 (Wasatch)**, both **`dispatched`** |
| S3 5b nag + "unconfirmed 5h after placement" escalation | **cannot fire** — the ladder only runs on `state === 'ordered'`; no backdating exists either |
| S1 "#1043 is a healthy card for contrast, risk 56, no ring" | seeds at **score 100, AT RISK** today — both cards are red |
| S1 banner reads "**1 escalation** needs attention" | two at-risk orders → two escalations |

**Hardcoded numbers that are wrong today** (SLIDES §build-rules already forbids these; DEMO-SCRIPT does it anyway): card quote "72% on-time" (today **39%**), "Wasatch 92%" (today **88%**), "Canyon 90%" (today **88%**), "risk 81" (today **100**).

**Screens promised that don't exist:** `/reports` (beat 6 — cut it or move the number), the nurse status screen (beat 4 step 1 — must be narrated as the EMR fallback, verbatim per the script's own warning), `family_notified` payload text (beat 4 step 5), `payload.source` on the timeline (beat 5b).

**Stale `[FE PENDING]` markers that are now DONE:** the `/portal/:token` page (SLIDES calls it "the demo's highest-value missing screen" — it shipped), plain-language state labels, the ✓ Verified badge, and `server.host: true`. Update these before anyone reads the slide notes on stage.

**Unbacked show-off-inbox line:** "Driver attests clean / functional / patient-ready at delivery" — no driver UI sends `condition`.

**Not a lie but needs a label:** the calls-avoided number on the board reads **262** on a fresh full seed — that is counted off a year of synthetic seeded history, not off the demo. It needs the SYNTHETIC footer wherever it appears.

## Cross-check 2 — FE punch list vs what's actually built

| # | Item | Status |
|---|---|---|
| 1 | `/portal/:token` confirm / ETA / decline | **DONE** (`VendorPortal.tsx`, `usePortal.ts`) — caveat: decline only escalates, the order state never moves, so the "we're re-routing this" message is client-only and vanishes on reload |
| 2 | Nurse status screen | **NOT DONE** — demo-critical |
| 3 | Verified vs vendor-reported badge | **DONE** |
| 4 | Linkify magic links | **NOT DONE** — demo-critical, ~10 lines |
| 5 | Plain-language state labels | **DONE** |
| 6 | `family_notified` payload text on timeline | **NOT DONE** |
| 7 | `payload.source` on timeline | **NOT DONE** |
| 8 | `/reports` view | **NOT DONE** (page) — but both backend routes exist and `summary` is already on the board |
| 9 | `server.host: true` | **DONE** |

**Demo-critical remaining: #2 and #4.** Everything else is a narration change.

## Cross-check 3 — internal contradictions

1. **`FRONTEND-TASKS.md` is badly stale** — Lane 0 (FE-0.1 … 0.9) and all of Lane A are unticked, but every one of them is built and on main. Only Lane E is ticked. Anyone using it as a punch list will rebuild finished work.
2. **`ASSUMPTIONS.md` (Cold-start scoring)** says a vendor with no history is scored on equipment/urgency/deadline alone "**and the reason string says so**." No such string exists — `computeRisk()` simply emits no vendor reason. Either add the sentence or delete the claim.
3. **`DIFFERENTIATION.md`** lists "the ordering nurse's mobile pickup surface" and "the directing-nurse reports view" as *in progress*; both are untouched `EmptyState` stubs. And it says the FE-side is "running and test-covered today" for verified-vs-reported — true — but the same paragraph implies the condition step ships, which it doesn't from the driver.
4. **`BUILD-DAY-TASKS.md`** has the parse live-test and the measured-cost capture unchecked, while `AI-APPROACH.md` and `.env.example` both assert 6/6 and measured token counts.
5. **`SMS-SIM-SPEC.md` §6.2/§9.4** state the confidence gate is "untouched" — true of the SMS work, but the doc frames 0.8 as the single AI-safety boundary while `decline` sits outside it (Row 4, gap 1). Minor drift elsewhere: the spec's §3.1 proposed V4 copy edit was not taken (`pickupRequestText` still says "Family is present — please schedule promptly"), and §7.1's "patch the new columns onto the row" is achieved by the `recipient_type` column default instead. Both benign; the doc is stale, not the code. **Otherwise the spec is unusually well-honored — every scoped-to-build item is built and tested**, including the §9.2 watchdog landmine (nag matched by template, `tests/sms.test.ts:469`) and the §9.3 vendor/family thread filter guard.
6. **`DEMO-SCRIPT.md`** was checked against commit `b1b7995` and predates the portal page, the digit layer, the reports endpoints and the pickup-clock fix. Its two `[BLOCKED: no endpoint]` markers on beat 6 are **no longer true** — `/api/reports/vendor-scorecards` and `/api/reports/summary` both exist. It also carries `[FE PENDING: vite host]`, which is set.
7. **`docs/design/*.html`** are static design references, not built screens. Nobody should screenshot them for a slide.

---

## Top 5 actions before code freeze

> **First, 2 minutes, before anyone pushes:** add `family_confirmed: false` to the fixture at `tests/at-risk.test.ts:13` — main's typecheck and build are red right now.

1. **DATA — land the DEMO-SCRIPT seed edits** (vendor 4 "Timpanogos" with no `vendor_stats`, scenario-3 orders reseated to `ordered`, Margaret on scenario 1, Ruth on scenario 2, backdated `#1061`): this alone is what makes the 30% row's never-cut beat physically able to happen.
2. **FE — linkify message bodies in `Vendor.tsx:66`**: ~10 lines that turn two "copy-paste the URL on stage" moments into the tap the entire pitch is built around.
3. **FE — build `/nurse`** (patient list → "Discharged / Passed away" → `POST /api/patients/:id/status`): restores the sponsor-preferred primary framing for scenario 2 and the 25% row's persona claim.
4. **FE — wire `ConditionChecklist` into the driver POD submit** (`Driver.tsx:92`, the server already accepts `condition`): converts FAQ §9's named differentiator from a doc claim into a demo beat for ~20 minutes of work.
5. **PITCH — purge every number the repo can't back** from DEMO-SCRIPT (72 / 92 / 90 / risk 81 / "1 escalation" / "healthy contrast card"), and either paste a real `npm run parse:test` run into `AI-APPROACH.md` or downgrade "measured / 6-for-6" to "one live run, intent only".

*Cheap bonuses, all under 10 minutes each: move the `decline` branch behind the 0.8 gate (`messaging.ts:256`) so our loudest AI claim is literally true; drop `/order`, `/nurse`, `/reports`, `/vendor-portal` from the header nav until they exist; fix the board CTA at `Hospice.tsx:39` so it opens the right-rail form instead of full-page-reloading into a stub; re-tick Lane 0 and Lane A in `FRONTEND-TASKS.md`.*
