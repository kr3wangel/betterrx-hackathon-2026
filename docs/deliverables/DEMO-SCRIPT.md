# Deliverable E — Demo Script (5:00, click-by-click)

*Assumptions this document relies on: see [ASSUMPTIONS.md](ASSUMPTIONS.md).*

*Rewritten for the magic-link vendor channel (team decision, `docs/PROBLEM-THESIS.md`). Every step
below was checked against the code at commit `b1b7995`. Rehearse twice against the clock after code
freeze.*

**Arc (north star):** heart open → mechanism middle → heart close. We open on Margaret, not on a
board. The product is the meat in the middle; the family is the bread.

**Markers used below**
- `[FE PENDING: x]` — backend works, no screen yet. This doubles as the FE teammate's checklist;
  every one is listed again in [FE punch list](#fe-punch-list).
- `[SEED PENDING: x]` — needs a line in `scripts/seed.ts` before the beat lands as written.
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

**1. Seed edits this script assumes.** Three small `scripts/seed.ts` changes; without them the names
on screen contradict the words coming out of the presenter's mouth.

```diff
  # scenario 1 — the cold open is Margaret's bed, so her name has to be on the card
- if (scenario === 'scenario1') {
-   seedOrder(1042, 1, 2, 0, 'ordered', 16, null)
-   seedOrder(1043, 1, 2, 1, 'dispatched', 16, 12)
+ if (scenario === 'scenario1') {
+   seedOrder(1042, 3, 2, 0, 'ordered', 16, null)   // patient 3 = Margaret Osei
+   seedOrder(1043, 3, 2, 1, 'dispatched', 16, 12)

  # scenario 2 — the prescribed closing line names Ruth (patient 5), seed currently uses Harold (2)
- } else if (scenario === 'scenario2') {
-   seedOrder(1050, 2, 1, 0, 'delivered', null, null)
-   seedOrder(1051, 2, 1, 1, 'delivered', null, null)
+ } else if (scenario === 'scenario2') {
+   seedOrder(1050, 5, 1, 0, 'delivered', null, null)  // patient 5 = Ruth Nakamura
+   seedOrder(1051, 5, 1, 1, 'delivered', null, null)

  # scenario 3 — needs a vendor with NO history (the cold start) and orders still awaiting a tap
+ insertVendor.run(4, 'Timpanogos Home Medical', '801-555-0404', 'sms', 'Provo / Orem', 'Ray')
+ // deliberately NO vendor_stats rows for vendor 4 — brand new, we have nothing on them
- } else if (scenario === 'scenario3') {
-   seedOrder(1060, 3, 1, 0, 'dispatched', 20, null)
-   seedOrder(1061, 4, 1, 2, 'dispatched', 44, null)
+ } else if (scenario === 'scenario3') {
+   seedOrder(1060, 4, 4, 0, 'ordered', 20, null)   // Frank Delgado → the brand-new vendor
+   seedOrder(1061, 1, 2, 2, 'ordered', 44, null)   // Eleanor Vance → Beehive: the link nobody taps
```

`[SEED PENDING]` **Backdating (strongly recommended, ~10 lines).** The silence ladder escalates with
`No response to the automated check-in — order #1061 is still unconfirmed ${h}h after placement`,
where `h` is *real* elapsed hours since the `order_placed` event (`server/watchdog.ts:57-58`). On a
freshly seeded order that renders **"unconfirmed 0h after placement"** — a weak quote at the climax.
Fix: let `seedOrder` write an explicit past `created_at` on the order row and its `order_placed`
event (e.g. 5h ago) for #1061. Then set `ACK_NAG_HOURS=4`, `ACK_ESCALATE_HOURS=0`: the first
watchdog tick sends the nag, the next one escalates, and the reason reads **"still unconfirmed 5h
after placement."** Without the backdate, fall back to `ACK_NAG_HOURS=0` + `ACK_ESCALATE_HOURS=0`
and accept the "0h" wording.

**2. `.env` for the demo machine**

```bash
ANTHROPIC_API_KEY=<real key>   # only needed for the S1 fallback path + Q&A parse demo
PORT=3001
ACK_NAG_HOURS=4                # with the backdate above; use 0 without it
ACK_ESCALATE_HOURS=0           # escalate on the tick after the nag
# PICKUP_WINDOW_HOURS — LEAVE UNSET (24).
```

> `[QUIRK]` Do **not** set `PICKUP_WINDOW_HOURS=0` "to demo the overdue path": the watchdog measures
> the pickup clock from `order.eta_at ?? order.created_at` (`server/watchdog.ts:63`), which for
> seeded orders is *order creation*, not the pickup trigger. Every card in scenario 2 would flip to
> red **Pickup overdue** within 30s and wreck the clean pickup. Narrate the overdue path instead.

**3. Boot order**

```bash
npm run db:reset && npm run seed scenario1   # then start the server
npm run dev                                  # server :3001 + client :5173
```

The watchdog ticks at boot and every 30s (`server/index.ts:30-31`). **Seeding does not broadcast
SSE** — after every `npm run seed`, either wait for the next tick or hard-refresh the tab. Standing
rule: *seed, count to thirty, confirm the board looks right, then talk.*

**4. Browser tabs (left → right, same window, `Cmd+1/2/3`)**

| Tab | URL | Used in |
|---|---|---|
| 1 | `http://localhost:5173/hospice` | all |
| 2 | `http://localhost:5173/vendor` | S1, S3 |
| 3 | `http://localhost:5173/driver` | S1, S2 |
| 4 | `http://localhost:5173/reports` | S6 · `[FE PENDING]` |

Phone (optional, for the driver POD): `/driver` over the venue LAN needs `server.host: true` in
`client/vite.config.ts` — **not set today** `[FE PENDING: vite host]`. Laptop fallback works: the
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

**6. Two rehearsal checks that only fail on the day**
- Run scenario 1 once and look at what weekday `now + 16h` lands on. Vendor 1 is 62% on-time for
  **hospital beds on Fridays** by design (`scripts/seed.ts:29`). If the deadline lands on a Friday,
  swapping to Wasatch re-escalates the card ~30s later — **swap to Canyon Home Medical (90%)
  instead** that day.
- Confirm the cold-open story matches the clock. Seed deadlines are relative (`now + 16h`), so
  "Friday morning / Thursday night" only lines up on a Thursday demo. Universal wording that is
  always true: *"home tomorrow morning — the bed has to be there tonight."*

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
  DME Co — red ring, `risk 81`, due in 16h. **Dispatched** holds #1043 *Oxygen concentrator*
  (risk 56, no ring — a healthy card for contrast).
- A red escalation banner across the top: `1 escalation needs attention` with the joined reasons.

| # | Click | What the audience sees | Presenter says |
|---|---|---|---|
| 1 | *(none)* — point at the #1042 card | Risk 81, three plain-English reasons under the card: *"vendor is 72% on-time for Hospital bed, semi-electric on this weekday (n=25)"* · *"vendor has not accepted and deadline is in 16.0h"* | "Nobody called anyone to learn this. It's rules, not a model — every reason is a sentence a case manager can argue with." |
| 2 | In the red banner → **Swap vendor…** → *Wasatch Medical Supply (92% on-time)* | Banner clears (escalation auto-resolved, `routes.ts:71`), card returns to **Ordered** with the new vendor, risk badge gone (cleared on swap, `statemachine.ts:55`) | "One action. The order re-issues to a vendor who is 92% on-time, and the text goes out on its own." |
| 3 | Tab 2 `/vendor` → vendor picker → **Wasatch Medical Supply** | Phone thread shows the outbound: *"New order #1042: 1x Hospital bed… Confirm here: http://localhost:5173/portal/…"* | "That's the entire vendor onboarding. A text with a link." |
| 4 | Click the link → portal page → **Confirm** (with ETA) | `[FE PENDING: portal page]` No-login page for Wasatch's open orders; board flips #1042 to **Dispatched** live | "No login. One tap. Confidence 1.0 — no model involved in a vendor telling us yes." |
| 5 | Tab 3 `/driver` → vendor **Wasatch** → **Start delivery** → **Complete delivery** → sign → **Submit proof of delivery** | Card walks **In transit → Delivered**; a `✓ Verified` badge on the delivered card `[FE PENDING: badge]` | "Delivered isn't a claim here. It's a signature and a timestamp — **verified**, not vendor-reported. Margaret's bed is in the house tonight." |

**Read this before you rehearse:**
- `[FE PENDING: portal page]` — `GET /api/portal/:token`, confirm / ETA / decline all exist
  (`server/portal.ts`, `routes.ts:118-141`); there is **no `/portal/:token` route in
  `client/src/App.tsx`**. Step 4 is the only thing standing between backend and beat.
- **Fallback if the portal page isn't built by freeze:** in the same phone simulator, type
  *"yes, we'll have it there by 7am"* → Claude parses it → confidence ≥ 0.8 auto-applies →
  **Dispatched**. Needs `ANTHROPIC_API_KEY`. Say: *"a vendor who won't tap can just text back — same
  pipeline, one extra safety gate."*
- `[FE PENDING: plain-language labels]` — the board still reads `Dispatched` / `In transit`. The
  thesis bar is "Accepted" / "On the truck". Presenter says the plain words either way; the mismatch
  is visible on screen until `STATE_LABEL` in `client/src/lib/domain.ts` is reworded.
- `[QUIRK]` The middle risk reason renders as *"16.0h until deadline but vendor averages 16.0h"* —
  true but reads like a rounding artifact. Read the other two aloud.

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
Home Medical** (a vendor with zero history — no stats rows), and #1061 *Standard wheelchair* for
Eleanor Vance → Beehive DME Co. No red banner yet.

### 5a · The tap (~45s)

| # | Click | What the audience sees | Presenter says |
|---|---|---|---|
| 1 | Point at #1060 on the board | Ordered, no risk history, vendor "Timpanogos Home Medical" | "This vendor has never heard of us. No contract, no account, no software. The hospice typed their phone number in from its own rolodex." |
| 2 | Tab 2 `/vendor` → **Timpanogos Home Medical** | One outbound text: order details + `Confirm here: …/portal/1c22…` | "This is everything we send them." |
| 3 | Click the magic link | `[FE PENDING: portal page]` A page opens: vendor name, their open orders, **Confirm · Set ETA · Can't fill it** | "No login screen. No signup. No password reset email at 6pm on a Thursday." |
| 4 | Tap **Confirm** | Tab 1: #1060 flips **Ordered → Dispatched** live over SSE | "One tap. Deterministic — confidence 1.0, no model, nothing to review. The portal isn't something vendors adopt. **It's what's already waiting behind the link we sent them.**" |

### 5b · The silence (~45s)

| # | Click | What the audience sees | Presenter says |
|---|---|---|---|
| 5 | Tab 2 → **Beehive DME Co** | The order request for #1061, and — after the first watchdog tick — an automatic second message: *"Order #1061 (Standard wheelchair) hasn't been confirmed — tap to accept or decline: …"* | "Nobody tapped this one. So the software nagged them. The case manager didn't." |
| 6 | Tab 1 | Red banner: **"No response to the automated check-in — order #1061 is still unconfirmed 5h after placement"** | "In the phone world, silence is ambiguous — did the fax go through? Here silence is a reading. An untapped link is exactly as loud as an unanswered text, and it reaches a human before the deadline does, not after." |
| 7 | Point at the **Swap vendor…** control in that banner | The same one-action escape hatch from scenario 1 | "And the case manager's next move is already sitting in the alert." |

**Read this before you rehearse:**
- `[FE PENDING: portal page]` — same single missing screen as scenario 1 step 4. **This is the
  highest-value FE item in the repo**: without it the climax has no click.
- Timing: with `ACK_NAG_HOURS=4` + the backdate, the nag fires on the first tick after the seed
  (≤30s) and the escalation on the next (≤60s) — which is roughly when 5a ends. If you arrive early,
  pause on the nag message and let the escalation appear live; if it hasn't, narrate it and move on.
  **Never stand in silence waiting for a tick.**
- Without the backdate, the escalation reads *"unconfirmed 0h after placement"* — say
  *"we've compressed the clock for the demo; in production this ladder is hours."*
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

- `[BLOCKED: no endpoint exposes per-code/weekday `vendor_stats`]` — `GET /api/vendors` returns only
  `avg_on_time_rate` (`routes.ts:17-26`); the scorecard grid needs a small new route over
  `vendorStats()` in `server/store.ts`. Three lines of backend, but it does not exist today.
- `[BLOCKED: no counter endpoint]` — "phone calls that never happened" is derivable from
  `order_events` (auto-applied vendor updates + portal confirms + auto-triggered pickups), but
  nothing aggregates it yet.
- If neither ships: **cut this beat entirely** and put the number on a slide, labelled as computed
  from the event log. Do not mock a screen and call it live.

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

1. **`/portal/:token` page** — route in `App.tsx`, fetch `GET /api/portal/:token`, big
   **Confirm / Set ETA / Can't fill it** buttons hitting `POST /api/portal/:token/orders/:id/{confirm,eta,decline}`.
   Blocks **scenario 3's climax and scenario 1 step 4**. Backend is done.
2. **Nurse status screen** — phone-shaped, patient list → "Died / Discharged" → confirm →
   `POST /api/patients/:id/status`. Blocks scenario 2's primary framing (EMR button is a fallback,
   not a substitute).
3. **`✓ Verified` vs `vendor-reported` badge** on `OrderCard` — driven by POD presence / event actor.
   Blocks scenario 1's closing point.
4. **Linkify magic links** in the vendor phone simulator (currently plain text).
5. **Plain-language state labels** in `client/src/lib/domain.ts` — "Accepted", "On the truck",
   "Picked up" instead of `Dispatched` / `In transit`.
6. **Render `family_notified` payload text** on the order timeline — makes scenario 2's last beat
   land.
7. **Render event `payload.source`** (`portal` / `vendor_message` / `nurse` / `emr`) on the timeline —
   turns "confidence 1.0, no model" into something visible.
8. **`/reports` view** + the two small backend routes it needs (vendor scorecards, calls-never-made
   counter). Cuttable.
9. **`server.host: true`** in `client/vite.config.ts` — only needed to drive `/driver` from a real
   phone with a real camera. Cuttable (sign on the trackpad instead).
