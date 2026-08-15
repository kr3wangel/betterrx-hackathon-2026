# Deliverable E — Demo Script (5:00, click-by-click)

*Assumptions this document relies on: see [ASSUMPTIONS.md](ASSUMPTIONS.md).*

*Rewritten for the magic-link vendor channel (team decision, `docs/PROBLEM-THESIS.md`). Every step
below was checked against the code at commit `b1b7995`; the seed edits it used to ask for have since
landed and every number quoted below was **read off a real seed + server run on 2026-08-14** (see
"Numbers, and how to re-read them"). Rehearse twice against the clock after code freeze.*

**Arc (north star):** heart open → mechanism middle → heart close. We open on Margaret, not on a
board. The product is the meat in the middle; the family is the bread.

**Markers used below**
- `[FE PENDING: x]` — backend works, no screen yet. This doubles as the FE teammate's checklist;
  every one is listed again in [FE punch list](#fe-punch-list).
- `[SEED PENDING: x]` — needed a line in `scripts/seed.ts` before the beat landed as written.
  **None remain**: every seed edit this script asked for is in `scripts/seed.ts` (see pre-demo §1).
- `[BLOCKED: x]` — cannot work as described today, even with FE time, without new backend.
- `[QUIRK: x]` — works, but behaves in a way that will bite you on stage if you don't know it.

**Roles:** Angel narrates · FE drives screens · DATA runs seeds from the terminal.

---

## Timing budget (5:00)

| # | Beat | Length | Running |
|---|---|---|---|
| 1 | Cold open — Margaret | 0:25 | 0:25 |
| 2 | The problem + the one-line frame | 0:20 | 0:45 |
| 3 | **Scenario 1** — the case worker's save | 1:00 | 1:45 |
| 4 | **Scenario 2** — the nurse in the home | 0:45 | 2:30 |
| 5 | **Scenario 3** — the cold-start vendor (climax) | 1:30 | 4:00 |
| 6 | Reporting beat — the directing nurse | 0:15 | 4:15 |
| 7 | Close — the family line | 0:15 | 4:30 |
| — | **Slack** (seed reloads, a watchdog tick that runs late, one judge interruption) | **0:30** | 5:00 |

Cut order if you are behind at 3:00: drop the scenario-1 delivery (stop after the vendor confirms),
then the reporting beat. **Never cut scenario 3's silence variant** — it is the differentiator.

---

## Pre-demo checklist

**1. Seed state — `[SEED PENDING]` items are all landed.** `scripts/seed.ts` now produces exactly
what this script narrates; nothing has to be hand-edited before the demo. What changed, and why it
matters on stage:

| Landed in the seed | Why the script needs it |
|---|---|
| **Vendor 4 "Timpanogos Home Medical"**, inserted in every seed with **zero `vendor_stats` rows** | Scenario 3's cold start. Its portal token now resolves (it 404'd before); the risk engine says nothing about them because there is nothing to say. |
| Scenario 1 → **Margaret Osei** (patient 3); scenario 2 → **Ruth Nakamura** (patient 5) | The cold open and the closing line name them out loud. |
| Scenario 3 → #1060 (Frank Delgado) to **Timpanogos**, #1061 (Eleanor Vance) to **Beehive**, both in **`ordered`** | The silence ladder only runs on `ordered`. Both beats were dead before this. |
| #1061 **backdated 5h** — order row *and* its `order_placed` event | The escalation reads "still unconfirmed **5h** after placement" instead of "0h". `requestAnchor()` reads the event, not just `created_at` (`server/watchdog.ts:18-25`). |
| #1042 backdated **6h**, deadline pulled to **+12h** | Puts the hero card over the threshold on *every* demo date — a (vendor × code × weekday) stats cell holds only ~20 orders, so its on-time rate alone is too noisy to carry the beat. |
| #1043 moved to **Canyon Home Medical** | The contrast card has to be genuinely healthy. It now scores ≤ 17 on every weekday. |
| Each seeded order writes its outbound **`v_order_request`** message (same template `POST /orders` uses) | The vendor thread shows the real text with the real magic link before anyone clicks anything. |
| A demo patient's *older* episodes are only materialized once closed | Marking Ruth deceased used to trigger **13** pickups (her share of the synthetic year). Now it triggers exactly the **2** the script promises. |

**2. `.env` for the demo machine**

```bash
ANTHROPIC_API_KEY=<real key>   # only needed for the S1 fallback path + Q&A parse demo
PORT=3001
ACK_NAG_HOURS=4                # 5b's order is 5h old → nags on the first tick; 5a's is fresh → never
ACK_ESCALATE_HOURS=0           # REQUIRED: escalate on the tick after the nag (default 2 = never, on stage)
# PICKUP_WINDOW_HOURS — LEAVE UNSET (24).
```

> `ACK_ESCALATE_HOURS=0` is the one setting the demo cannot do without: the ladder escalates only
> once the nag itself is older than this, so at the default `2` the beat-5b banner never appears.
> `ACK_NAG_HOURS` can stay at its default `2` — 5a's fresh order is still inside the grace window
> either way. Verified live: nag at the boot tick, escalation 30s later, and **no** nag for 5a.

> `[QUIRK]` Do **not** set `PICKUP_WINDOW_HOURS=0` "to demo the overdue path": the pickup clock now
> correctly anchors to the `pickup_triggered` event (`pickupAnchor()` in `server/watchdog.ts`), but
> with a 0-hour window every freshly triggered pickup still flips to red **Pickup overdue** on the
> next 30s tick and wrecks the clean pickup. Narrate the overdue path instead.

**3. Boot order**

```bash
npm run db:reset && npm run seed scenario1   # then start the server
npm run dev                                  # server :3001 + client :5173
```

The watchdog ticks at boot and every 30s (`server/index.ts:30-31`). **Seeding does not broadcast
SSE** — after every `npm run seed`, either wait for the next tick or hard-refresh the tab. Standing
rule: *seed, count to thirty, confirm the board looks right, then talk.*

**4. Browser tabs (left → right, same window, `Cmd+1`…`Cmd+6`)**

| Tab | URL | Used in |
|---|---|---|
| 1 | `http://localhost:5173/hospice` | all |
| 2 | `http://localhost:5173/vendor` | S1, S3 |
| 3 | `http://localhost:5173/driver` | S1, S2 |
| 4 | `http://localhost:5173/reports` | S6 · `[FE PENDING: reports page]` (both backend routes exist) |
| 5 | `http://localhost:5173/vendor-phone` | **no scene calls for it** — full-screen twin of tab 2's thread |
| 6 | `http://localhost:5173/caregiver` | **no scene calls for it** — but it goes live the instant S1 step 5's POD lands |

**Tabs 5 and 6 are optional and no beat in this script requires them.** Tab 5 is the same vendor
thread as the in-page simulator on tab 2, just full-screen on a handset — every vendor beat as
written works on tab 2. Tab 6 is the family's phone: submitting proof of delivery in S1 step 5
fires the condition text automatically (`routes.ts:143`), so if it's open you can turn to it and
show the check arriving, and a 1–5 reply is recorded and rolls into the condition stats behind
`/reports`. That's the beat the CEO asked for by name at the briefing, and it is currently in the
deck but not in this script.

**Only a *delivery* POD sends it.** `kind !== 'pickup'` — S2's two pickups deliberately send
nothing, because the guards in `server/condition.ts` keep that channel silent once a patient has
died. Don't stand there waiting on tab 6 during S2; the silence is the feature.

Both open from the **account menu → Simulated phones** (top-right, under the role list), so you
don't have to type a URL mid-demo.

> ⚠️ **Open them during setup, not mid-demo.** They open in a *new* tab, and Chrome places a
> link-opened tab immediately to the right of the tab you opened it from. Open from tab 1 while
> presenting and `/vendor` becomes tab 3 — every "Tab 2 / Tab 3 / Tab 4" instruction below shifts
> by one. Open them last, from tab 4, so they land at 5 and 6 and the numbering above holds.

Phone (optional, for the driver POD): `/driver` over the venue LAN needs `server.host: true` in
`client/vite.config.ts` — **set** (`vite.config.ts:17`), so this works. Laptop fallback works too: the
POD submit only requires the **signature** (photo is optional, `Driver.tsx:88`), and "Take photo" on
a laptop opens a file dialog, not a camera — so **sign with the trackpad and skip the photo** unless
you're on a phone.

**5. Magic-link fallback.** Links are rendered as plain text in the phone simulator today
`[FE PENDING: linkify]`. If clicking fails, paste the URL directly. With the default
`MAGIC_LINK_SECRET` (`demo-secret`) the tokens are stable:

| Vendor | Portal URL |
|---|---|
| 1 Wasatch Medical Supply | `http://localhost:5173/portal/0ba1ed9f8fc6b1e9a57f` |
| 2 Beehive DME Co | `http://localhost:5173/portal/5526bc0f1e5aa153d8ae` |
| 3 Canyon Home Medical | `http://localhost:5173/portal/5c231c9153da814e84df` |
| 4 Timpanogos Home Medical | `http://localhost:5173/portal/1c228237679004bcd506` |

All four verified live (`GET /api/portal/1c2282…` → 200, Timpanogos, one `ordered` order).

**6. Numbers, and how to re-read them on demo morning.** Vendor rates are *derived* from a simulated
year keyed to `Date.now()`, so a per-weekday cell moves when the demo date moves. **`npm run seed`
prints everything this script quotes** — vendor on-time, each demo order's score and reasons, and a
`swap options` line for any at-risk card. Read that print, then use these words. As of the
**2026-08-14** run (deadlines landing Sat/Mon):

| Figure | Value that day |
|---|---|
| Wasatch Medical Supply, all codes | **88%** on-time · pickups avg **24h** · condition **4.13/5** |
| Beehive DME Co, all codes | **61%** on-time · pickups avg **73h** · condition **3.54/5** (17% rated 1–2) |
| Canyon Home Medical, all codes | **88%** on-time · pickups avg **31h** · condition **4.12/5** |
| Timpanogos Home Medical | **no history at all** — 0 `vendor_stats` rows |
| #1042 (hero) | risk **100**, four reasons |
| #1043 (contrast) | risk **17** |
| #1060 (cold start) | risk **25**, one reason |
| #1061 (the silence) | risk **58** — deliberately *under* 70, so nothing but the silence flags it |

**Two rehearsal checks that only fail on the day**
- **Which vendor to swap to.** The seed prints `swap options (<weekday> deadline): …` under #1042 —
  say that vendor and that number. On 2026-08-14 it read *Wasatch 73% · Canyon 91%*, so Canyon was
  the right swap; Beehive's bed cell swings between **27% and 87%** across weekdays and Wasatch's
  drops to **61% on Fridays** (the planted Friday heavy-item weakness, `scripts/seed.ts`). Never
  quote a number the print didn't just give you.
- Confirm the cold-open story matches the clock. Seed deadlines are relative (`now + 12h` for the
  hero), so "Friday morning / Thursday night" only lines up on a Thursday demo. Universal wording
  that is always true: *"home tomorrow morning — the bed has to be there tonight."*

---

## 1 · Cold open (0:25) — the patient, not the product

**No screen.** Laptop closed or board still on the previous slide. Look at the room.

> "Margaret Osei is 71. On Friday morning she is coming home from the hospital to die at home,
> because that is what she asked for and what her hospice promised her family. That promise only
> works if a hospital bed is in her living room the night before. The hospice does not own that bed,
> does not employ the driver, and cannot see the truck. They will get the phone call from her
> daughter either way."

## 2 · The problem + the frame (0:20)

> "Two moments a hospice is accountable for and cannot watch: equipment before a discharge home,
> and pickup after a death. It runs on phone, fax, and portals — and their own discovery has
> someone dying without the vendor ever finding out. Every fix dies on the same question: *what does
> the vendor have to do?* Our answer is: tap one link in a text they already got. No account, no
> app, no password."

Now open tab 1.

---

## 3 · Scenario 1 — the case worker's save (1:00)

**Seed:** `npm run seed scenario1` — run it ~40s before you speak, then hard-refresh tab 1.

**Starting state (after the first watchdog tick):**
- Board columns: **Ordered** holds #1042 *Hospital bed, semi-electric* for Margaret Osei / Beehive
  DME Co — red ring, **risk 100**, placed 6h ago, due in 12h. **Accepted** holds #1043 *Oxygen
  concentrator* for Margaret / Canyon Home Medical (**risk 17**, no ring — the healthy contrast).
- A red escalation banner across the top: `1 escalation needs attention` with the joined reasons.
  (It stays at one: `escalate()` refuses a second open escalation on the same order,
  `statemachine.ts:80-84`. The ladder does quietly text Beehive a nag in the background — same card,
  and the swap clears everything.)

| # | Click | What the audience sees | Presenter says |
|---|---|---|---|
| 1 | *(none)* — point at the #1042 card | Risk 100 and four plain-English reasons: *"vendor is 27% on-time for Hospital bed, semi-electric on this weekday (n=26)"* · *"12.0h until deadline but vendor averages 15.9h for this equipment"* · *"vendor has not accepted and deadline is in 12.0h"* · *"vendor has not acknowledged the order 6.0h after placement"* | "Nobody called anyone to learn this. It's rules, not a model — every reason is a sentence a case manager can argue with." |
| 2 | In the red banner → **Swap vendor…** → the vendor the seed's `swap options` line named (Canyon Home Medical, 91% on that run) | Banner clears (escalation auto-resolved, `routes.ts:71`), card returns to **Ordered** with the new vendor, risk badge gone (cleared on swap, `statemachine.ts:55`) | "One action. The order re-issues to a vendor who is 91% on-time for this equipment on this day, and the text goes out on its own." |
| 3 | Tab 2 `/vendor` → vendor picker → the new vendor | Phone thread shows the outbound: *"New order #1042: 1x Hospital bed… Confirm here: http://localhost:5173/portal/…"* | "That's the entire vendor onboarding. A text with a link." |
| 4 | Click the link → portal page → **Confirm** (with ETA) | No-login page listing that vendor's open orders; board flips #1042 to **Accepted** live | "No login. One tap. Confidence 1.0 — no model involved in a vendor telling us yes." |
| 5 | Tab 3 `/driver` → the same vendor → **Start delivery** → **Complete delivery** → sign → **Submit proof of delivery** | Card walks **On the truck → Delivered**; a `✓ Verified` badge on the delivered card | "Delivered isn't a claim here. It's a signature and a timestamp — **verified**, not vendor-reported. Margaret's bed is in the house tonight." |

**Read this before you rehearse:**
- The `/portal/:token` page, the plain-language state labels and the `✓ Verified` badge have all
  **shipped** (`client/src/pages/VendorPortal.tsx`, `client/src/lib/domain.ts:9-18`,
  `client/src/components/EvidenceBadge.tsx`). Steps 4 and 5 are clicks now, not narration.
- Risk 100 is not a fluke of the demo date: the card was re-checked against all seven possible
  deadline weekdays and scores **75–100** on every one, while #1043 never exceeds **17**.
- **Fallback if the portal page misbehaves:** in the same phone simulator, type
  *"yes, we'll have it there by 7am"* → Claude parses it → confidence ≥ 0.8 auto-applies →
  **Accepted**. Needs `ANTHROPIC_API_KEY`. Say: *"a vendor who won't tap can just text back — same
  pipeline, one extra safety gate."*
- The old `[QUIRK]` about *"16.0h until deadline but vendor averages 16.0h"* is gone — the deadline
  moved to +12h, so that reason now reads *"12.0h until deadline but vendor averages 15.9h"*. It is
  the single best line on the card; read it aloud.

---

## 4 · Scenario 2 — the nurse in the home (0:45)

**Seed:** `npm run seed scenario2` — then hard-refresh tab 1.

**Starting state:** **Delivered** column holds #1050 *Hospital bed* and #1051 *Oxygen concentrator*,
both for **Ruth Nakamura**, vendor Wasatch. No risk, no deadlines. Ruth is `active`.

| # | Click | What the audience sees | Presenter says |
|---|---|---|---|
| 1 | Nurse's phone → **Ruth Nakamura → Patient has died** `[FE PENDING: nurse screen]` | One tap, one confirm | "The nurse is standing in the living room. She taps this once. That's the whole trigger — the sponsor told us their own discovery found the EMR-only path fail: someone dies and the vendor never finds out." |
| 2 | *(watch tab 1)* | Both cards jump **Delivered → Pickup**; two pickup texts appear in Wasatch's thread, each with a magic link | "Two pickups scheduled. Zero phone calls made by anyone in that house." |
| 3 | Tab 3 `/driver` → vendor **Wasatch** | Two **PICK UP** jobs, each with *"The family is grieving. Call ahead, be brief and kind."* | "The dispatcher sees logistics. Never the death." |
| 4 | **Complete pickup** → sign → **Submit proof of pickup** | Card moves to **Done**; expand it → Activity shows `picked_up (driver)` then `family notified (system)` | — |
| 5 | Point at the timeline | `family_notified` event | **"Ruth's family made zero phone calls. That's the product."** |

**Read this before you rehearse:**
- "Two pickups" is now literally two: the trigger returns `pickups_triggered: [1050, 1051]`. Before
  the seed fix it returned **13** — Ruth's share of the synthetic year was still sitting in
  `delivered`, and every one of them fired a pickup text into Wasatch's thread.
- `[FE PENDING: nurse screen]` — the backend route is live and is the *preferred primary* trigger:
  `POST /api/patients/:id/status {status:'deceased'}` → actor `hospice`, `payload.source:'nurse'`
  (`server/pickups.ts:26`). Needs a phone-shaped screen (patient list → "Died / Discharged" →
  confirm). One screen, one POST.
- **Fallback today:** the **EMR simulator** card on the right rail of `/hospice` → Ruth → **Deceased**
  (`POST /api/emr/patient-status`, actor `system`, source `emr`). It produces the identical pickup
  cascade. If you use it, the narration *must* flip: *"this is the EMR fallback firing — in the real
  product the nurse's tap gets there first, and this is the belt-and-suspenders behind her."*
  Do not call an EMR button a nurse tap on stage; a judge who read the FAQ will catch it.
- `[FE PENDING: family message text]` — the timeline prints the event type only; the actual sentence
  sent to the family (*"Equipment has been picked up. Thank you."*, `routes.ts:102`) is in
  `payload.text` and never rendered. Rendering it makes step 5 land far harder.
- Optional one-liner if you have slack: *"and if that pickup sits past the window, the watchdog
  escalates it on its own — the hospice knows before the family has to look at that bed another
  day."* (`server/watchdog.ts:62-69`.)

---

## 5 · Scenario 3 — the cold-start vendor (1:30, the climax)

**Seed:** `npm run seed scenario3` — **run it as you start this beat.** The silence clock starts at
seed time and you want the nag and the escalation to land live, on stage, during this scenario.

**Starting state:** **Ordered** column holds #1060 *Hospital bed* for Frank Delgado → **Timpanogos
Home Medical** (a vendor with zero history — no stats rows; risk **25**, one reason, no ring), and
#1061 *Standard wheelchair* for Eleanor Vance → Beehive DME Co (risk **58** — under the threshold on
every deadline weekday it can land on, deliberately: nothing but the silence is allowed to flag it).
No red banner yet.

### 5a · The tap (~45s)

| # | Click | What the audience sees | Presenter says |
|---|---|---|---|
| 1 | Point at #1060 on the board | Ordered, no risk history, vendor "Timpanogos Home Medical" | "This vendor has never heard of us. No contract, no account, no software. The hospice typed their phone number in from its own rolodex." |
| 2 | Tab 2 `/vendor` → **Timpanogos Home Medical** | One outbound text: order details + `Confirm here: …/portal/1c22…` | "This is everything we send them." |
| 3 | Click the magic link | A page opens: vendor name, their open orders, **Confirm · Set ETA · Can't fill it** | "No login screen. No signup. No password reset email at 6pm on a Thursday." |
| 4 | Tap **Confirm** | Tab 1: #1060 flips **Ordered → Accepted** live over SSE | "One tap. Deterministic — confidence 1.0, no model, nothing to review. The portal isn't something vendors adopt. **It's what's already waiting behind the link we sent them.**" |

### 5b · The silence (~45s)

| # | Click | What the audience sees | Presenter says |
|---|---|---|---|
| 5 | Tab 2 → **Beehive DME Co** | The order request for #1061, and — after the first watchdog tick — an automatic second message: *"Order #1061 (Standard wheelchair) hasn't been confirmed — tap to accept or decline: …"* | "Nobody tapped this one. So the software nagged them. The case manager didn't." |
| 6 | Tab 1 | Red banner: **"No response to the automated check-in — order #1061 is still unconfirmed 5h after placement"** | "In the phone world, silence is ambiguous — did the fax go through? Here silence is a reading. An untapped link is exactly as loud as an unanswered text, and it reaches a human before the deadline does, not after." |
| 7 | Point at the **Swap vendor…** control in that banner | The same one-action escape hatch from scenario 1 | "And the case manager's next move is already sitting in the alert." |

**Read this before you rehearse:**
- The portal page has **shipped** — step 3 is a real click, and the confirm was verified end to end
  (`POST /api/portal/1c2282…/orders/1060/confirm` → `state: "dispatched"`).
- Timing, measured: with `ACK_NAG_HOURS=4`, `ACK_ESCALATE_HOURS=0` and #1061's 5h backdate, the nag
  goes out on the **first** tick (the boot tick, or ≤30s after the seed) and the escalation on the
  **next** (≤60s) — roughly when 5a ends. #1060 is freshly placed and is never nagged. If you arrive
  early, pause on the nag message and let the escalation appear live; if it hasn't, narrate it and
  move on. **Never stand in silence waiting for a tick.**
- The escalation text is verbatim: *"No response to the automated check-in — order #1061 is still
  unconfirmed 5h after placement"*. It fires once and only once, and Beehive is nagged once and only
  once (matched by template, `server/watchdog.ts:46-53`).
- `[FE PENDING: evidence source on the timeline]` — portal taps write `payload.source: 'portal'`
  (`server/portal.ts:38`), but the Activity list shows only type + actor, so "confidence 1.0, no
  model" is a spoken claim with nothing on screen backing it. Rendering *"via magic link · no model"*
  turns it into evidence.
- Q&A ammunition (do **not** demo, no time): the Claude parse pipeline still runs the free-text
  channel, confidence-gated at 0.8 with a human review queue on the same board; the IVR spec
  (`docs/IVR-SIM-SPEC.md`) covers the rolodex landlines that cannot receive SMS at all.

---

## 6 · Reporting beat — the directing nurse (0:15)

**Click:** tab 4 → `/reports`. `[FE PENDING: reports view — the entire beat]`

| What the audience sees | Presenter says |
|---|---|
| Vendor scorecards — on-time by equipment × weekday, the same table the risk engine reads | "The third hospice user is the directing nurse. She never opens the board. This is her screen — and it's the exact data the risk engine already uses, so it cost us nothing." |
| A **"phone calls that never happened"** counter | "And this is the number we actually care about: every status this system got without a human picking up a phone." |

- Both former `[BLOCKED]` markers are **stale — the backend shipped**:
  `GET /api/reports/vendor-scorecards` and `GET /api/reports/summary` (`routes.ts:317,321`,
  `server/reports.ts`), and `summary` already feeds the calls-avoided number on the board. Only the
  `/reports` **page** is missing.
- The calls-avoided figure counts the seeded synthetic year, not the demo. Wherever it appears it
  needs the SYNTHETIC label — say "computed from the event log of a simulated year", never imply it
  came from the five minutes on stage.
- If the page doesn't ship: **cut this beat entirely** and put the number on a slide, labelled as
  computed from the event log. Do not mock a screen and call it live.

---

## 7 · Close (0:15) — back to the family

Close the laptop or step away from it.

> "Every mechanism you just watched maps to one phone call a human never had to make. Margaret's bed
> was in the house before she was. Ruth's family woke up on the worst week of their lives and the
> hospital bed was already gone — and nobody in that house ever knew any of this existed. That's the
> measure we built for: **phone calls that never happened.** And the vendor's entire cost of entry
> was tapping one link."

---

## Failure drills (rehearse these)

| If this happens | Do this |
|---|---|
| Board looks stale / empty right after a seed | Hard-refresh. Seeds write straight to SQLite and broadcast nothing; the UI only refetches on SSE (`client/src/lib/useLive.ts`). |
| The header dot is red / "disconnected" | Refresh the tab — SSE reconnects on its own. Don't restart the server mid-demo. |
| Portal page 404s on a link | Paste the URL from the token table above. If `MAGIC_LINK_SECRET` is set in `.env`, those tokens are wrong — unset it and restart. |
| Venue wifi dies | Everything except the free-text parse is local. Both magic-link beats still work. Only the S1 SMS *fallback* needs the network. |
| A live parse comes back wrong (Q&A path) | That's the review queue demo, not a failure: "the model knows what it doesn't know; a person decides." |
| A transition 409s (`cannot apply X while order is Y`) | You clicked out of order. Reseed that scenario — it's one command and ~10 seconds. |
| You're past 4:00 and still in scenario 3 | Skip the reporting beat, go straight to the close. The close is never cut. |

---

## FE punch list

Everything the demo needs that has no screen yet, in the order that buys the most demo.

1. ~~**`/portal/:token` page**~~ — **DONE** (`client/src/pages/VendorPortal.tsx`, route in
   `App.tsx:94`). Confirm / ETA / decline all wired; verified live against vendor 4's token.
2. **Nurse status screen** — phone-shaped, patient list → "Died / Discharged" → confirm →
   `POST /api/patients/:id/status`. Blocks scenario 2's primary framing (EMR button is a fallback,
   not a substitute). **The one demo-critical screen still missing.**
3. ~~**`✓ Verified` vs `vendor-reported` badge**~~ — **DONE** (`components/EvidenceBadge.tsx`, on the
   card and per event in `OrderCard.tsx:124,179`).
4. **Linkify magic links** in the vendor phone simulator (currently plain text). Demo-critical,
   ~10 lines: without it both magic-link beats need a copy-paste on stage.
5. ~~**Plain-language state labels**~~ — **DONE** (`client/src/lib/domain.ts:9-18`: "Accepted",
   "On the truck", "Picked up").
6. **Render `family_notified` payload text** on the order timeline — makes scenario 2's last beat
   land.
7. **Render event `payload.source`** (`portal` / `vendor_message` / `nurse` / `emr`) on the timeline —
   turns "confidence 1.0, no model" into something visible.
8. **`/reports` view** — the two backend routes it needs already exist
   (`/api/reports/vendor-scorecards`, `/api/reports/summary`). Cuttable.
9. ~~**`server.host: true`**~~ — **DONE** (`client/vite.config.ts:17`), so `/driver` runs from a real
   phone on the venue LAN.
