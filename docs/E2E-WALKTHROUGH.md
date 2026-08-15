# E2E walkthrough — do the three demo scenarios actually walk?

**Verdict: all three scenarios walk end to end on the backend — every beat's endpoint returns what
the script promises — but the scenario-1 and scenario-3 *board narration* describes a UI that no
longer exists, so the script needs a rewrite pass before it is rehearsable.**

Run on **2026-08-14, 21:11–21:25 local** against `main` at the working tree of
`/Users/angelherrera/code/personal/betterrx-hackathon-2026`. Authority for the beats:
[`docs/deliverables/DEMO-SCRIPT.md`](deliverables/DEMO-SCRIPT.md). No source file was modified;
this document is the only thing written.

---

## How this was run (and what it means for your browser)

| | |
|---|---|
| Server | `DB_PATH=data/e2e.db PORT=3299 ACK_NAG_HOURS=4 ACK_ESCALATE_HOURS=0 npx tsx server/index.ts` |
| Client | none — every beat was walked through **the exact endpoint the page component calls** (payloads read out of `Driver.tsx`, `usePortal.ts`, `QuickReplies.tsx`, `Nurse.tsx`, `Demo.tsx`, `SwapVendorDialog.tsx`, `Reports.tsx`, `Caregiver.tsx`) |
| Seeds | `DB_PATH=data/e2e.db npm run seed scenarioN` |

**Deviation from the brief, on purpose:** a dev server was already live on `:3001` (and vite on
`:5173`) holding an open handle on `data/app.db`. Running `npm run db:reset` would have unlinked
that file out from under a running process and left the other developer's board reading a ghost
inode. So the whole walkthrough ran against an isolated `data/e2e.db`; `server/db.ts:7` honours
`DB_PATH`, `scripts/reset-db.ts` does not (it hardcodes `data/app.db`), so the scratch DB was
deleted by hand instead.

**State left behind:** the scratch DB is gone, my server on `:3299` is killed, the servers on
`:3001` / `:5173` were never touched, and the shared `data/app.db` was re-seeded with
**`npm run seed` (full)**. The shared DB was never reset mid-run, so nothing you had is lost —
but seeding broadcasts nothing, so **hard-refresh your tabs** to see the fresh full seed.

Also run, clean: `npm test` → **150 passed / 14 files**; `npm run typecheck` → clean.

---

## Scenario 1 — the case worker's save

`npm run seed scenario1`. Deadline landed on a **Saturday**.

| # | Beat | Expected | Actual | |
|---|---|---|---|---|
| 0 | Seed print | #1042 risk 100 / 4 reasons, #1043 healthy, Timpanogos 0 stats rows | `#1042 score=100 AT RISK` with the four reasons; `#1043 score=23 ok`; `Timpanogos Home Medical no history — 0 vendor_stats rows`. Swap line: `Wasatch 74% · Canyon 83%` | **PASS** |
| 1 | Board shows the at-risk row | #1042 in Ordered, red ring, risk 100, four reasons on the card | `GET /api/orders` → #1042 `state:"ordered"`, `risk_score:100`, four `risk_reasons` verbatim (`vendor is 30% on-time for Hospital bed, semi-electric on this weekday (n=27)` · `12.0h until deadline but vendor averages 16.0h for this equipment` · `vendor has not accepted and deadline is in 12.0h` · `vendor has not acknowledged the order 6.0h after placement`). #1043 `dispatched`, risk 23 | **PASS** (data) / see punch #1, #2 for what the screen actually looks like |
| 1b | One escalation banner | exactly `1 escalation needs attention`, joined reasons | `GET /api/escalations?status=open` → exactly 1 row on #1042 with all four reasons joined by `; `. Beehive was also nagged in the background (`v_ack_nag`, message 3), as the script warns | **PASS** |
| 2 | Swap vendor | banner clears, card back in Ordered on the new vendor, risk badge gone | `POST /api/orders/1042/swap-vendor {"vendor_id":3}` → `{state:"ordered", vendor_id:3, risk_score:null, risk_reasons:null}`; `GET /api/escalations?status=open` → `[]` | **PASS** |
| 3 | Vendor thread shows the outbound | new order text with the magic link in Canyon's thread | `GET /api/messages?vendor_id=3` → new `v_order_request`: *"New order #1042: 1x Hospital bed, semi-electric (E0260), deliver by 8/15/2026, 9:11:46 AM, area Provo. Reply 1 to accept, 2 if you can't fill it — or confirm here: http://localhost:5173/portal/5c231c9153da814e84df"* — token matches the script's table | **PASS** |
| 4 | Portal confirm | no-login page lists that vendor's orders; board flips to Accepted | `GET /api/portal/5c231c9153da814e84df` → 200, `Canyon Home Medical`, 31 open orders (29 of them `delivered` history — the page groups them and shows 6, `VendorPortal.tsx:34-49`). `POST …/orders/1042/confirm {"eta_iso":null}` → `state:"dispatched"`, event payload `{"eta_iso":null,"source":"portal"}`, actor `vendor` | **PASS** |
| 5a | Driver: start delivery | card walks to On the truck | `GET /api/driver/jobs?vendor_id=3` → both 1042 and 1043. `POST /api/orders/1042/events {"type":"out_for_delivery","actor":"driver"}` → `in_transit` | **PASS** (driver picker defaults to vendor 1 — punch #9) |
| 5b | POD, all three attestations | Delivered + `✓ Verified` badge | `POST /api/orders/1042/pod {kind:"delivery", photo_data_url:null, signature_data_url:"data:image/png;base64,…", condition:{clean:true,functional:true,patient_ready:true}}` → `state:"delivered"`, **`delivery_verified:true`** (drives `EvidenceBadge verified`), pod row stores `{"clean":true,"functional":true,"patient_ready":true}`, no condition escalation raised | **PASS** |
| 5c | Family delivered-thanks exists | the sentence is really sent | order detail shows message 5, `recipient_type:"family"`, `template:"f_delivered_thanks"`: *"Your hospice team: the hospital bed, semi-electric has been delivered and set up…"*, plus event `family_notified` carrying it in `payload.text` | **PASS** |
| 5d | Bonus, unscripted | — | POD also fired the caregiver condition check: `condition_check:{sent:true, message_id:6}` — *"Kwame Osei, your hospice team here…"* | **PASS** |

---

## Scenario 2 — the nurse in the home

`npm run seed scenario2`, fresh boot.

| # | Beat | Expected | Actual | |
|---|---|---|---|---|
| 0 | Start state | #1050 + #1051 delivered for Ruth Nakamura / Wasatch, Ruth `active` | exactly that; both risk 0, no deadlines; `patients` → Ruth `status:"active"`, caregiver `Ken Nakamura` | **PASS** |
| 1 | Nurse taps "Patient has died" (**primary**) | `POST /api/patients/:id/status` | `POST /api/patients/5/status {"status":"deceased"}` → `{"pickups_triggered":[1051,1050]}` — **exactly two**, not thirteen. Event payload `{"patient_status":"deceased","source":"nurse"}`, actor `hospice` | **PASS** — and the screen exists now (`/nurse`, `Nurse.tsx:70`), so the script's `[FE PENDING: nurse screen]` is stale |
| 2 | Both cards jump to Pickup; two pickup texts | 2 state moves, 2 `v_pickup_request` | both orders `pickup_pending`; Wasatch's thread gains exactly two `v_pickup_request` messages, each with the magic link | **PASS** |
| 3 | Pickups appear in driver jobs | two PICK UP jobs | `GET /api/driver/jobs?vendor_id=1` → 1050 + 1051, both `pickup_pending`. The "family is grieving" line is static copy in `Driver.tsx:103-105` | **PASS** |
| 4 | Pickup POD | card to Done; Activity shows `picked_up (driver)` then `family notified (system)` | `POST /api/orders/1050/pod {kind:"pickup", condition:null}` → `state:"picked_up"`, `pickup_verified:true`; events end `picked_up (driver)` → `family_notified (system)`, in that order | **PASS** |
| 5 | Family notified | the picked-up thanks is really in the household thread | message 5, `recipient_type:"family"`, `template:"f_picked_up_thanks"`: *"Your hospice team: the equipment has been picked up. There's nothing else you need to do. We're thinking of your family."* Renders in full on `/caregiver`; the board timeline still prints only the event label (punch #6/#7) | **PASS** |
| 6 | EMR route also 200s | fallback path works | `POST /api/emr/patient-status {"patient_id":5,"status":"deceased"}` → 200 `{"pickups_triggered":[]}` (idempotent). Full cascade proved on a non-demo patient: `{"patient_id":10,…}` → 20 pickups triggered, actor `system`, `source:"emr"` | **PASS** |
| 7 | Reseed freshness | script's standing rule: "seed, count to thirty, confirm the board" | **This rule does not hold for scenario 2.** Measured 75s (boot tick + 2 ticks) after the seed: 0 new `order_events`, 0 new `messages`, `risk_score` still `null`. `tick()` has no branch for a board that is entirely `delivered`/`picked_up`, so nothing calls `applyEvent()` and nothing broadcasts. **Hard refresh is mandatory here** (scenarios 1 and 3 do self-heal — they contain `ordered` rows, so the first tick writes `risk_updated` and that broadcast refetches every `useLive`) | **FAIL (script guidance)** — punch #4 |

---

## Scenario 3 — the cold-start vendor

`npm run seed scenario3` fired **into a running server**, exactly as the script says to.
`ACK_NAG_HOURS=4`, `ACK_ESCALATE_HOURS=0`.

| # | Beat | Expected | Actual | |
|---|---|---|---|---|
| 0 | Start state | #1060 → Timpanogos, risk 25, one reason; #1061 → Beehive, risk under 70; no banner | `#1060 score=25` / one reason (`vendor has not accepted and deadline is in 20.0h`); `#1061 score=57` (script says 58) — under threshold; `GET /api/escalations?status=open` → `[]` | **PASS** |
| 5a·2 | Timpanogos thread | one outbound with `…/portal/1c22…` | one `v_order_request` ending `…confirm here: http://localhost:5173/portal/1c228237679004bcd506` | **PASS** |
| 5a·3 | Fresh token resolves | 200, vendor name, their open orders | `GET /api/portal/1c228237679004bcd506` → **200**, `Timpanogos Home Medical`, exactly one order `(1060, "ordered")` — the cold start reads clean, nothing else in the list | **PASS** |
| 5a·4 | Tap Confirm | Ordered → Accepted live | `POST …/orders/1060/confirm {"eta_iso":null}` → `dispatched`; event `vendor_accepted`, actor `vendor`, payload `{"eta_iso":null,"source":"portal"}` — no model, no confidence field | **PASS** |
| 5b·5 | The nag | automatic second message to Beehive on the first tick | seed at **21:15:15**; by **21:15:34** Beehive's thread held `v_ack_nag`: *"Order #1061 (Standard wheelchair) hasn't been confirmed — reply 1 to accept, 2 if you can't fill it, or tap to accept or decline: …"*. #1060 (fresh) was **never** nagged | **PASS** |
| 5b·6 | The escalation | verbatim *"…still unconfirmed 5h after placement"*, on the next tick | by **21:16:18** (next tick, ~60s after seed): `No response to the automated check-in — order #1061 is still unconfirmed 5h after placement`. Polled 5× over 100s afterwards: still exactly **one** escalation and exactly **one** nag | **PASS** — timing matches the script's measured claim |
| 5b·7 | Swap control in the alert | the same one-action escape hatch | The escalated, pre-delivery order lands in "Needs you" (`lib/atRisk.ts` `isNeedsYou`) and gets the coral **Swap vendor** pill (`lib/board.ts` `crisisPill` → `BoardRow.tsx` → `SwapVendorDialog`). The swap endpoint itself was proved in scenario 1 | **PASS** (mechanism) / the *narration* is wrong — punch #1 |
| — | V1 quick-reply, digit 1 | applies deterministically | `POST /api/messages/reply {"reply_to_message_id":2,"digit":"1"}` → `{"template":"v_order_request","digit":"1","outcome":"applied"}`, order → `dispatched`, event notes *"Vendor accepted by text (replied 1)"*, `confidence:1` | **PASS** (but only on `/vendor-phone` — punch #3) |
| — | F1 chain, step 1: vendor claims delivered | parse → delivered + family confirm question | `POST /api/messages/inbound {"vendor_id":2,"body":"wheelchair is dropped off at the house, all set"}` → real Claude call, `parsed.intent:"delivered"`, `confidence:0.95`, `review_status:"auto_applied"`, order → `delivered`, and `f_delivery_confirm` sent to Eleanor Vance's household | **PASS** |
| — | F1 chain, step 2: family confirms | family_confirmed + condition check chains | `POST /api/messages/reply {"reply_to_message_id":6,"digit":"1"}` → `outcome:"applied"`, `family_confirmed:true`, event `family_confirmed (family)` with `{"confirms":"delivery","via":"sms"}`, then `f_condition_check` auto-sent to Marcy Vance | **PASS** |
| — | F1 chain, step 3: condition digit | rating recorded, scorecard moves | `POST /api/messages/reply {"reply_to_message_id":8,"digit":"4"}` → `outcome:"applied"`; `GET /api/orders/1061/condition` → `score:4, source:"caregiver"`; `GET /api/vendors/condition` picked it up | **PASS** |
| — | Reports counters moved | the demo's own actions show up | `GET /api/reports/summary` → `calls_avoided:209`, breakdown `{auto_applied_messages:2, vendor_self_service_updates:205, auto_triggered_pickups:0, household_confirmations:2}`. Baselines from the seed are 0 / 203 / 0 / 0 — so **every counter the session touched moved**: 2 vendor texts, 2 vendor self-updates (portal tap + digit accept), 2 household replies | **PASS** |
| — | Known quirk found | — | the *"marked delivered without proof of delivery"* escalation never appeared, because #1061's silence escalation was still open (`statemachine.ts:80-84`, one open escalation per order). The banner keeps reading "still unconfirmed 5h" on an order that is already `delivered` — punch #8 | noted |

---

## Cross-cutting checks

| Check | Actual | |
|---|---|---|
| `/demo` page endpoints | `POST /api/emr/patient-status` → 200 with a pickup list; `POST /api/messages/send {"order_id":1060,"template":"v_eta_check"}` → 201 + the body the toast shows; a refused household send (`f_condition_check` on an already-rated order) → **409** with a readable reason, which is what `Demo.tsx:148` renders | **PASS** |
| `/reports` endpoints | `GET /api/reports/summary`, `GET /api/reports/vendor-scorecards` (4 vendors, Timpanogos `overall_on_time_rate:null` / 0 stat rows — the cold start reads correctly), `GET /api/vendors/condition`, `GET /api/orders`, `GET /api/patients` — the five calls `Reports.tsx:57-62` makes all return the shapes it consumes | **PASS** (see punch #5 for the label problem) |
| Vendor phone thread render-ready | `GET /api/messages?vendor_id=N` returns `template` on every outbound, `answered_at` null on unanswered questions → `isOpenQuestion()` true → digit buttons render; family rows are excluded server-side (`routes.ts:218-222`) so household texts can never leak into a vendor thread | **PASS** |
| Caregiver phone thread render-ready | `GET /api/messages` (unfiltered) returns the family rows with `patient_id`, `template` and `answered_at` — which is exactly what `Caregiver.tsx:46,52` filters on. Confirmed live: `f_delivery_confirm` (answered) → inbound `1` → `f_condition_check` (answered) → inbound `4`, all threaded to patient 1 | **PASS** |
| Magic-link tokens | all four in the script's table are correct; vendor 4 resolves 200 | **PASS** |
| Repo health | `npm test` 150/150, `npm run typecheck` clean, `npm run seed` + boot both clean | **PASS** |

---

## Punch list, ranked by demo impact

**1 · The script narrates a board that no longer exists.** (HIGH)
`client/src/pages/Hospice.tsx` + `client/src/lib/board.ts`. There are no **Ordered / Accepted /
Delivered / Pickup** columns and there is **no red escalation banner across the top**. The shipped
board is three sections — **Needs you**, **On the way** (with a "N more, nothing due before …"
collapse), **Done · N this week**. Every one of these lines is now wrong: *"Board columns: Ordered
holds #1042"*, *"A red escalation banner across the top: `1 escalation needs attention`"*, *"In the
red banner → Swap vendor…"*, *"Banner clears… card returns to Ordered"*, *"#1060 flips Ordered →
Accepted live"*. What actually happens: the at-risk order is the lead row of **Needs you** and its
right-hand pill *is* the coral **Swap vendor** button (`BoardRow.tsx:40-43` → `SwapVendorDialog`);
after the swap the row leaves Needs you and reappears under On the way as "Waiting on vendor".
The beat still works — the words don't.

**2 · The four risk reasons are behind a click.** (HIGH)
Beat 3.1 is *"point at the #1042 card"* and read four sentences. The Needs-you row shows only
who / action / item / when / pill; `risk_reasons` render inside `RowDetail`
(`components/board/RowDetail.tsx:97-103`), which requires clicking the row open. Add "click the row"
to the script, or the best line in the deck is invisible while you say it.

**3 · The digit quick-replies are on `/vendor-phone`, not `/vendor`.** (MEDIUM-HIGH)
The script's tab 2 is `/vendor` (`pages/Vendor.tsx`) — free-text box only. The tappable
`1 · Accept` / `2 · Can't fill` buttons and the *"applied · no model needed"* receipt live in
`components/QuickReplies.tsx`, mounted by `pages/VendorPhone.tsx` (`/vendor-phone`) and
`pages/Caregiver.tsx` (`/caregiver`). Both are deliberately outside the app Shell
(`App.tsx:136-137`) and unlisted in the nav, so they must be opened by URL. Retab the script:
`/vendor-phone` for the S3 digit beat, `/caregiver` for the family half of the F1 chain.

**4 · "Seed, count to thirty" is false for scenario 2.** (MEDIUM)
Measured: 75 s and three watchdog ticks after `npm run seed scenario2` produced **zero** events and
**zero** messages, so nothing broadcast and no tab refetched. `server/watchdog.ts:71-113` has no
branch that fires on an all-`delivered` board. Scenarios 1 and 3 self-heal within one tick because
they seed `ordered` rows. Fix the script's standing rule to: **hard-refresh after every seed, and
know that scenario 2 will never refresh itself.**

**5 · The calls-avoided hero carries no SYNTHETIC label.** (MEDIUM — honesty risk, ~10 lines)
`Reports.tsx:137-151` renders `summary.calls_avoided` as a 5xl coral hero reading *"phone calls that
never happened"* with a three-part breakdown and no caveat. In my run that number was **209**, of
which **203** is the seeded synthetic year. The cost cards on the same page *are* labelled
(`source="synthetic"`, `Reports.tsx:362,409-429`), which makes the unlabelled hero look deliberate.
DEMO-SCRIPT §6 explicitly requires *"computed from the event log of a simulated year"* wherever this
number appears, and FAQ §6 penalises manufactured precision.

**6 · Four `[FE PENDING]` markers are stale — the screens shipped.** (LOW, but it changes the pitch)
- Nurse status screen — **DONE** (`/nurse`, `pages/Nurse.tsx:70` posts `POST /api/patients/:id/status`).
  This was listed as *"the one demo-critical screen still missing"*; scenario 2 can now be narrated
  as the nurse tap for real, with the EMR button as the honest fallback.
- `/reports` view — **DONE** (`pages/Reports.tsx`, 544 lines: KPI row, vendor scorecards, condition,
  cost of care, cost approvals). §6 is no longer a cuttable slide beat.
- Linkify magic links — **DONE** (`components/PhoneScreen.tsx:135`, used by `VendorPhone`,
  `Caregiver` and `Vendor`). No copy-paste on stage.
- Family message text — **DONE on the phone sim** (`/caregiver` renders the real sentence);
  still **not** on the board timeline.

**7 · The timeline still shows no evidence *source*.** (LOW)
`RowDetail.tsx:98-114` derives its badge from `mockEvidenceSource({verified, actor})` and never
reads the real `payload.source` the portal writes (`server/portal.ts:39`). So Verified vs Reported
is on screen, but *"via magic link · no model"* is still only a spoken claim. The data is already
there — this is a render, not a feature.

**8 · One open escalation per order can mask a newer, worse reason.** (LOW)
Reproduced in the S3 F1 chain: with the silence escalation still open on #1061, the *"marked
delivered without proof of delivery"* escalation was silently dropped (`statemachine.ts:80-84`), so
the alert kept reading *"still unconfirmed 5h after placement"* on an order that was already
`delivered`. Only bites if you run 5b through to the delivered claim without swapping first.

**9 · `/driver` defaults to vendor 1.** (LOW) `Driver.tsx:16`. After the S1 swap to Canyon you must
change the picker or the page reads "Route's clear".

**10 · Post-death pickup copy says "Family is present — please schedule promptly."** (LOW)
`server/messaging.ts:127`. Correct for a discharge, tone-deaf for a death, and a judge reading the
vendor thread in scenario 2 will see it.

**11 · Numbers have drifted — read the seed print, don't quote the script.** (no fix needed)
On a Saturday-deadline run: #1042 reads **32% on-time (n=25)** and the swap line offers **Canyon
77%** (not 27% / 91%); #1043 scores **23** (not 17); #1061 scores **57** (not 58); #1060 is **25**,
one reason, as written. The script's own rehearsal rule already covers this — just never say "91%".

---

## Verdict

**All three scenarios walk end to end at the API layer with zero backend failures — the gap between
here and a rehearsable demo is the script, not the code: rewrite the board narration in scenarios 1
and 3 (punch #1, #2), retab the phone-sim beats to `/vendor-phone` and `/caregiver` (#3), fix the
scenario-2 refresh rule (#4), and put a SYNTHETIC label on the calls-avoided hero (#5).**
