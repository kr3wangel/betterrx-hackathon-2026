# Deliverable E — Demo Script (5:00, click-by-click)

*Assumptions this document relies on: see [ASSUMPTIONS.md](ASSUMPTIONS.md).*

*Rewritten for the magic-link vendor channel (team decision, `docs/PROBLEM-THESIS.md`), then
**reconciled on 2026-08-14 against the shipped three-section board and the two phone simulators**
(`client/src/pages/Hospice.tsx`, `client/src/lib/board.ts`, `client/src/components/board/*`,
`VendorPhone.tsx`, `Caregiver.tsx`, `Nurse.tsx`, `Driver.tsx`, `Demo.tsx`) using the beat-by-beat
verification in [`docs/E2E-WALKTHROUGH.md`](../E2E-WALKTHROUGH.md). Every screen action below was
checked against a component on `main`. Rehearse twice against the clock after code freeze.*

**Arc (north star):** heart open → mechanism middle → heart close. We open on Margaret, not on a
board. The product is the meat in the middle; the family is the bread.

**Markers used below**
- `[FE PENDING: x]` — backend works, no screen yet. This doubles as the FE teammate's checklist;
  every one is listed again in [FE punch list](#fe-punch-list). Four of these were **struck on
  08-14** — the screens shipped (nurse, `/reports`, linkify, family message text).
- `[SEED PENDING: x]` — needed a line in `scripts/seed.ts` before the beat landed as written.
  **None remain**: every seed edit this script asked for is in `scripts/seed.ts` (see pre-demo §1).
- `[BLOCKED: x]` — cannot work as described today, even with FE time, without new backend.
- `[QUIRK: x]` — works, but behaves in a way that will bite you on stage if you don't know it.

**Roles:** Angel narrates · FE drives screens · DATA runs seeds from the terminal.

> **The board has no columns and no banner.** If you learned this script from an earlier draft,
> unlearn the kanban. `/hospice` is three stacked sections — **Needs you**, **On the way** (with a
> "N more, nothing due before …" collapse), **Done · N this week** — and a row is one line of text
> with a pill on the right. An order that needs a human is the lead row of **Needs you** and its
> pill is a coral **Swap vendor** button. Everything else about the order — vendor name, deadline,
> risk reasons, the ledger — is **behind a click on the row**.

---

## Timing budget (5:00)

| # | Beat | Length | Running |
|---|---|---|---|
| 1 | Cold open — Margaret | 0:25 | 0:25 |
| 2 | The problem + the one-line frame | 0:20 | 0:45 |
| 3 | **Scenario 1** — the case worker's save | 1:00 | 1:45 |
| 4 | **Scenario 2** — the nurse in the home | 0:55 | 2:40 |
| 5 | **Scenario 3** — the cold-start vendor (climax) | 1:30 | 4:10 |
| 6 | Reporting beat — the directing nurse | 0:15 | 4:25 |
| 7 | Close — the family line | 0:15 | 4:40 |
| — | **Slack** (seed reloads, a watchdog tick that runs late, one judge interruption) | **0:20** | 5:00 |

> **Scenario 2 grew from 0:45 to 0:55 on 08-15**, and the ten seconds came out of the slack, not
> out of another beat — the vendor-reply beat (step 2b) is the only place the batching payoff is
> visible on stage. Slack is now **0:20**. If that feels thin at the second rehearsal, the honest
> trade is scenario 2's step 5 (the optional caregiver-thread glance), which was already optional.

Cut order if you are behind at 3:00: drop the scenario-1 delivery (stop after the vendor confirms),
then the reporting beat. **Never cut scenario 3's silence variant** — it is the differentiator.

---

## Pre-demo checklist

**0. Demo-morning rule, before anything else: reseed, then re-read the print.**
Seed timestamps are relative to `Date.now()` and vendor rates are derived per *weekday*, so a
scenario seeded yesterday is a different demo today. On demo morning, in this order:

```bash
npm run db:reset && npm run seed scenario1
```

…then **read the block `npm run seed` prints** (§6 below) and write that morning's numbers on your
hand. Never speak a percentage this document contains — they are examples, and they were true for
one run on one date.

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
| #1043 moved to **Canyon Home Medical** | The contrast row has to be genuinely healthy. It stays far under the threshold on every weekday. |
| Each seeded order writes its outbound **`v_order_request`** message (same template `POST /orders` uses) | The vendor thread shows the real text with the real magic link before anyone clicks anything. |
| The four demo patients' *older* episodes are only materialized once closed (`seed.ts:370-374`, `DEMO_PATIENTS = {1,3,4,5}`) | Marking Ruth deceased used to trigger **13** pickups. Now it triggers exactly the **2** the script promises — and, just as important, no stray history order of Margaret's, Frank's or Eleanor's can wander into their board row and change the counts you narrate. |

**2. `.env` for the demo machine** — re-verified against `server/watchdog.ts:9-12`.

```bash
ANTHROPIC_API_KEY=<real key>   # only needed for the S1 fallback path + Q&A parse demo
PORT=3001
ACK_NAG_HOURS=4                # 5b's order is 5h old → nags on the first tick; 5a's is fresh → never
ACK_ESCALATE_HOURS=0           # REQUIRED: escalate on the tick after the nag (default 2 = never, on stage)
# PICKUP_WINDOW_HOURS — LEAVE UNSET (24).
```

> `ACK_ESCALATE_HOURS=0` is the one setting the demo cannot do without. The code reads
> `ACK_ESCALATE_HOURS` with a default of **2** (`watchdog.ts:11`) and escalates only once the nag
> *itself* is older than that (`watchdog.ts:92`) — so at the default, beat 5b's escalation never
> fires inside a five-minute demo. `ACK_NAG_HOURS` defaults to **2** (`watchdog.ts:10`) and could
> be left alone — 5a's fresh order is inside the grace window either way — but set it to 4 anyway
> so 5a stays quiet with margin. `PICKUP_WINDOW_HOURS` defaults to **24** (`watchdog.ts:9`) and
> `ETA_CHECK_HOUR` to **8** (`watchdog.ts:12`); neither needs touching.

> `[QUIRK]` Do **not** set `PICKUP_WINDOW_HOURS=0` "to demo the overdue path": the pickup clock now
> correctly anchors to the `pickup_triggered` event (`pickupAnchor()` in `server/watchdog.ts`), but
> with a 0-hour window every freshly triggered pickup still flips to red **Pickup overdue** on the
> next 30s tick and wrecks the clean pickup. Narrate the overdue path instead.

**3. Boot order, and the refresh rule**

```bash
npm run db:reset && npm run seed scenario1   # then start the server
npm run dev                                  # server :3001 + client :5173
```

The watchdog ticks at boot and every 30s (`server/index.ts:30-31`). **Seeding writes straight to
SQLite and broadcasts nothing.**

> **Standing rule: hard-refresh every open tab after every seed.** The old rule — *"seed, count to
> thirty, confirm the board"* — is false for scenario 2 and was measured false: 75 seconds and
> three watchdog ticks after `npm run seed scenario2` produced **zero** events and **zero**
> messages, so nothing broadcast and nothing refetched. `tick()` has no branch that fires on an
> all-`delivered` board (`server/watchdog.ts:71-113`). Scenarios 1 and 3 *do* self-heal within one
> tick — they seed `ordered` rows, the first tick writes `risk_updated`, and that broadcast
> refetches every `useLive` — but **scenario 2 will never refresh itself.** Don't rely on the
> distinction on stage; just refresh.

Two tabs need the refresh for their own reasons even when a broadcast does land:
- **`/nurse` (tab 3)** loads its patient list once, with `useEffect(load, [])` — not `useLive`
  (`Nurse.tsx:53-59`). After seeding scenario 2 it is stale until you refresh it.
- **`/reports` (tab 4)** is a page you open cold in beat 6; refresh it when you seed, not when you
  arrive on it.

**4. Browser tabs (left → right, same window, `Cmd+1`…`Cmd+7`)**

| Tab | URL | Used in |
|---|---|---|
| 1 | `http://localhost:5173/hospice` | all — **the board** |
| 2 | `http://localhost:5173/driver` | S1 step 5, S2 steps 3-5 |
| 3 | `http://localhost:5173/nurse` | S2 step 1 |
| 4 | `http://localhost:5173/reports` | S6 |
| 5 | `http://localhost:5173/demo` | fallback only — EMR feed, send-a-text-by-hand |
| 6 | `http://localhost:5173/caregiver` | S3's F1 chain; goes live in S1 the instant the POD lands |
| 7 | `http://localhost:5173/vendor-phone` | **S1 steps 3-4, S2 step 2b, all of S3** — the vendor's handset |

**Setup order matters.** Type tabs 1–5 yourself. Then, standing on **tab 5**, open the account menu
(top-right, under the role list) → **Simulated phones** → **"Caregiver's phone"**, then the same
menu again → **"DME vendor's phone"** (`App.tsx:50-53, 96-108`). Both entries carry
`target="_blank"`, so each lands in a *new* tab to the right of the one you opened it from. Glance
at the tab bar afterwards and drag if the order came out wrong — dragging during setup is free,
doing it mid-demo is not.

> ⚠️ **Open them during setup, not mid-demo.** Open a phone from tab 1 while presenting and every
> "Tab N" instruction below shifts by one.

**Sign in as `Driver` before the demo** — do it once on **tab 2** during setup. Every POD writes the
signed-in role into the ledger (`api.ts:6` sends `X-Role`, the ledger stores it as `actor_role`), and
the browser's default is **Case Manager** — so an untouched machine records a case manager signing
for the equipment, which is the one line a judge reading the ledger will pick out. `[QUIRK]` The role
is **one global setting, not per tab** (`localStorage` key `betterrx.role`, `auth.tsx:22`): switching
it on tab 2 switches it for tabs 1, 3 and 4 too, so whatever it says is what the ledger records for
*every* tap you make. That only bites if you point at role attribution on stage. If you plan to, flip
to **Field Nurse** for S2 step 1 and back to **Driver** before S1 step 5 / S2 step 3; otherwise leave
it on Driver and don't narrate who acted.

**Why `/vendor-phone` is last:** magic links inside the thread are real anchors with
`target="_blank"` (`PhoneScreen.tsx:135-146`), so tapping one spawns the portal to the *right* of
tab 7 — past the end of this table, disturbing nothing. When you're done with the portal, `Cmd+W`
and you are back on the handset with the numbering intact.

**`/vendor` is not in the list, on purpose.** It is the **dispatcher's own board** — open orders
plus an in-page free-text simulator (`Vendor.tsx:24,48`). It has no digit quick-reply buttons.
Every vendor-facing beat in this script happens on the handset at tab 7, where replies are typed.

**What each phone is.** Tab 7 is the DME dispatcher's phone: a vendor picker in the header and the
real thread. **There are no tap-buttons — SMS has none.** You TYPE the digit the question's own
body names (pairs rotate: one text says "reply 1", the next "reply 3") into the composer, and
`VendorPhone.tsx` posts a gateway-shaped `{vendor_id, body}`. **Bubbles show only the time — no
outcome annotations** (removed 08-15: a real handset shows nothing under a sent text, and the
vendor's phone has never heard of our review queue). Instead, **every vendor update gets a texted
receipt back** (added 08-15) — "Got it — order #X is confirmed with you", or "a coordinator will
take a look" when it parks for review — so the thread reads like a real SMS conversation. The
system's side of the story is narrated from **tab 1**: the state pill flips when a parse
auto-applies, and low-confidence prose lands in the board's review queue. Tab 6 is the family's
phone, one thread per household: submitting a
**delivery** POD fires the condition check automatically (`routes.ts:144-146`), so it lights up on its
own during S1 step 5, and a 1–5 reply rolls into the condition stats behind `/reports`. That's the
beat the CEO asked for by name at the briefing.

**Only a *delivery* POD sends it.** `kind !== 'pickup'` — S2's two pickups deliberately send
nothing, because the guards in `server/condition.ts` keep that channel silent once a patient has
died. Don't stand there waiting on tab 6 during S2; the silence is the feature.

**5. Magic links are clickable.** ~~`[FE PENDING: linkify]`~~ — **DONE**
(`components/PhoneScreen.tsx:135-146`, used by `VendorPhone`, `Caregiver` and `Vendor`). No
copy-paste on stage. If a click still fails, paste the URL: with the default `MAGIC_LINK_SECRET`
(`demo-secret`) the tokens are stable, and all four were verified live.

| Vendor | Portal URL |
|---|---|
| 1 Wasatch Medical Supply | `http://localhost:5173/portal/0ba1ed9f8fc6b1e9a57f` |
| 2 Beehive DME Co | `http://localhost:5173/portal/5526bc0f1e5aa153d8ae` |
| 3 Canyon Home Medical | `http://localhost:5173/portal/5c231c9153da814e84df` |
| 4 Timpanogos Home Medical | `http://localhost:5173/portal/1c228237679004bcd506` |

**6. Numbers: read them off the seed print. Do not read them off this page.**

Vendor rates are *derived* from a simulated year keyed to `Date.now()`, and risk keys off the
**target date's weekday** — so every cell moves when the demo date moves. `npm run seed` prints
everything this script would otherwise quote (`scripts/seed.ts:533-588`). The print has three
blocks; here is the shape, with `N` where your number goes:

```
seeded 'scenario1'
  patients=… vendors=… catalog=… codes
  history: … simulated orders over …d, … materialized (last …d)
  vendor_stats derived from simulated history — not hand-typed

  vendor on-time (derived, all codes):
    Wasatch Medical Supply     NN% on-time  pickup avg NNh  condition N.NN/5 (NN% rated 1-2)  n=NNN
    Beehive DME Co             NN% on-time  pickup avg NNh  condition N.NN/5 (NN% rated 1-2)  n=NNN
    Canyon Home Medical        NN% on-time  pickup avg NNh  condition N.NN/5 (NN% rated 1-2)  n=NNN
    Timpanogos Home Medical    no history — 0 vendor_stats rows (the cold start)

  demo orders — computed risk (threshold 70):
    #1042 Hospital bed, semi-electric   score=NNN  AT RISK
         · <the reason, verbatim — this is the sentence you read aloud>
         · <…>
         swap options (<Day> deadline): Wasatch NN% · Canyon NN%
    #1043 Oxygen concentrator           score= NN  ok
```

**How to use it, per beat:**
- **S1 beat 1** — the reasons printed under `#1042` are the exact strings the row detail will
  render. Pick the strongest one and read *that*, not a remembered one.
- **S1 beat 2** — the `swap options (<Day> deadline):` line names the vendor to swap to and its
  percentage **for this equipment code on this deadline's weekday**. Say that vendor and that
  number, nothing else. Note the print lists only the three vendors with history; the dialog on
  screen also offers **Timpanogos**, which reads *"New — no history yet"*.
- **S3 beat 1** — confirm `#1060` prints a low score with one reason and `#1061` prints **under
  70**. If #1061 ever prints `AT RISK`, the silence beat is contaminated — reseed on a different
  target weekday or narrate the risk instead of the silence.
- **The threshold in the print header** (`threshold 70`) is `RISK_THRESHOLD`; the board uses the
  same number (`client/src/lib/atRisk.ts:5`).

**Example only — the 2026-08-14 run.** These are here to show you what the print looks like and
what "good" reads like. **They are not facts about your demo.** Deadlines that day landed Sat/Mon:

| Figure | Value *that day* (example only) |
|---|---|
| Wasatch Medical Supply, all codes | 88% on-time · pickups avg 24h · condition 4.13/5 |
| Beehive DME Co, all codes | 61% on-time · pickups avg 73h · condition 3.54/5 (17% rated 1–2) |
| Canyon Home Medical, all codes | 88% on-time · pickups avg 31h · condition 4.12/5 |
| Timpanogos Home Medical | no history at all — 0 `vendor_stats` rows *(this one is structural, not dated — it is true every run)* |
| #1042 (hero) | risk 100, four reasons |
| #1043 (contrast) | risk 23 |
| #1060 (cold start) | risk 25, one reason |
| #1061 (the silence) | risk 57 — deliberately *under* 70, so nothing but the silence flags it |

How far these drift is not theoretical: across weekdays, Beehive's hospital-bed cell swings between
**27% and 87%**, and Wasatch drops to **61% on Fridays** (the planted Friday heavy-item weakness,
`scripts/seed.ts`). Two walkthroughs a day apart read #1042's vendor as 27% and then 32%, and the
best swap as 91% and then 77%. **Never quote a number the print didn't just give you.**

**One more rehearsal check that only fails on the day.** Confirm the cold-open story matches the
clock. Seed deadlines are relative (`now + 12h` for the hero), so "Friday morning / Thursday night"
only lines up on a Thursday demo. Universal wording that is always true: *"home tomorrow morning —
the bed has to be there tonight."* The board's own **When** column will read `Today` or `Tomorrow`
depending on the hour you seeded (`board.ts:89-98`) — glance at it before you describe it.

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

**Seed:** `npm run seed scenario1` — run it ~40s before you speak, then **hard-refresh tab 1**.

**Starting state (after the first watchdog tick):**
- **Needs you · 1**, and the count is red. The single row reads
  **`Margaret Osei` · `Delivery` · `Hospital bed` · `Today`-or-`Tomorrow`**, and where every other
  row on the board carries a grey status, this one carries a **coral `Swap vendor` button**
  (`board.ts:127-131` → `BoardRow.tsx:40-43,84-100`). That colour *is* the alarm — there is no
  banner. The row does **not** show the vendor, the risk score, or the reasons; all of that is one
  click away.
- **On the way** holds `Margaret Osei · Delivery · Oxygen concentrator · Accepted ✓` — the healthy
  contrast — plus everything else still in motion, and a **"N more, nothing due before …"** collapse
  for anything further out than six days.
- **Done · N this week** at the bottom, with `✓ N of N` for how many completions carry a photo and
  a signature.

| # | Click | What the audience sees | Presenter says |
|---|---|---|---|
| 1 | **Click the Margaret Osei row in Needs you** (anywhere but the pill) | The row opens in place: `Beehive DME Co · #1042 · Hospital bed` with a grey **Reported** badge · **Needed by** / **Vendor promised** ("Nothing promised yet") · *"The vendor has not replied yet · nudged Xm ago"* · then the risk reasons as plain bullets, each a full sentence · then the event ledger with timestamps | "Nobody called anyone to learn this. It's rules, not a model — every reason is a sentence a case manager can argue with." **Read one reason aloud, verbatim, off the screen.** |
| 2 | **`Swap vendor`** on that row → in the dialog, the vendor the seed's `swap options` line named | Dialog: *"Send this to another vendor."* Each alternative is a button — vendor name, and under it that vendor's own decision line for **this equipment on this deadline's weekday** ("NN% on-time for hospital beds on Saturday"), with the cold-start vendor reading *"New — no history yet"*. One click sends it — **no confirm step** | "One action. The order re-issues to the vendor who is *NN%* on-time for this equipment on this day, and the text goes out on its own." |
| 2b | *(watch the board — don't click)* | The row **leaves Needs you by itself** (`routes.ts:106` resolves the open escalation, `statemachine.ts:55-58` clears `risk_score`, `risk_reasons` and the stale ETA), the section falls to **Needs you · 0** — *"Nothing needs a person right now."* — and Margaret's two orders **collapse into one row under On the way**: `Margaret Osei · Delivery · 2 items · 1 of 2 moving` (`board.ts:147-162`) | "And it clears itself. Nobody marks anything resolved." |
| 3 | Tab 7 `/vendor-phone` → header picker → the new vendor | The thread shows the outbound: *"New order #1042: 1x Hospital bed… confirm here: http://localhost:5173/portal/…"*, the URL a live link | "That's the entire vendor onboarding. A text with a link." |
| 4 | Click the link (opens a new tab) → portal → **Confirm** (optionally set an ETA) → `Cmd+W` back to tab 7 | No-login page: vendor name, their open orders, **Confirm · Set ETA · Can't fill it**. Tab 1's grouped row ticks to **`2 of 2 moving`** live | "No login. One tap. Confidence 1.0 — no model involved in a vendor telling us yes." |
| 5 | Tab 2 `/driver` → **switch the vendor picker to the new vendor** → **Start delivery** → **Complete delivery** → sign → **Confirm delivery** | The job card walks through; back on tab 1 the row's detail badge flips from **Reported** to green **Verified**, and **Done · N this week** ticks up | "Delivered isn't a claim here. It's a signature and a timestamp — **verified**, not vendor-reported. Margaret's bed is in the house tonight." |

**Read this before you rehearse:**
- **Step 5's picker is a trap.** `/driver` defaults to **vendor 1, Wasatch** (`Driver.tsx:24`).
  After you swap #1042 to a different vendor, the page reads *"Route's clear"* until you change the
  dropdown. Change it *before* you point at the screen.
- **Button labels, exactly:** `Start delivery` → `Complete delivery` → sign → `Confirm delivery`.
  There is no button called "Submit proof of delivery".
- The badge says **Verified** / **Reported** — a green check icon and the word, no `✓` in the text
  (`components/EvidenceBadge.tsx`). Before the POD the detail header already reads **Reported**,
  which is the setup for the line in step 5: *"right now that's a claim; watch it become proof."*
- **Don't type the digit reply in step 3.** The order-request bubble on tab 7 names its own reply
  pair — answering by digit is scenario 3's beat. Typing it here skips the portal.
- The `/portal/:token` page, the plain-language state labels and the evidence badge have all
  **shipped** (`pages/VendorPortal.tsx`, `lib/domain.ts:9-18`, `components/EvidenceBadge.tsx`).
  Steps 4 and 5 are clicks now, not narration.
- Risk 100 is not a fluke of the demo date: the hero was re-checked against all seven possible
  deadline weekdays and clears the threshold on every one, while #1043 stays far beneath it. The
  *reasons and percentages* still move — read them off the print (pre-demo §6).
- The ladder also texts Beehive a nag in the background before you swap; that is what puts
  *"nudged Xm ago"* in the row detail at step 1. Same order, and the swap clears everything.
  Exactly one escalation is ever open per order (`statemachine.ts:80-84`).
- **Fallback if the portal page misbehaves:** in the tab-7 thread, type *"yes, we'll have it there
  by 7am"* → Claude parses it → confidence ≥ 0.8 auto-applies → **Accepted ✓**. Needs
  `ANTHROPIC_API_KEY`. Say: *"a vendor who won't tap can just text back — same pipeline, one extra
  safety gate."*
- ~~`[FE PENDING: escalation reason on the board]`~~ **RESOLVED — and in this scenario, resolved
  by design, not by rendering.** `RowDetail` now renders open escalations as bold red lines
  (`RowDetail.tsx:83-86,128-132`) — but it deliberately filters out any escalation that quotes a
  current risk reason, because #1042's escalation *is* the risk reasons joined together and would
  print the same sentences twice. **Verified live 08-15: #1042's row renders no escalation line**
  — the reasons you read at step 1 are `risk_reasons`, same as before. Scenario 3's silence
  escalation is worded differently and *does* render — see that scenario's notes. Nothing changes
  in what you say at step 1.

---

## 4 · Scenario 2 — the nurse in the home (0:55)

**Seed:** `npm run seed scenario2` — then **hard-refresh tab 1 *and* tab 3**. This scenario seeds an
all-`delivered` board, so **nothing will broadcast and nothing will refresh itself** — measured, not
assumed (pre-demo §3). Tab 3 `/nurse` needs its own refresh because it loads patients once.

**Starting state:** #1050 *Hospital bed* and #1051 *Oxygen concentrator*, both for **Ruth
Nakamura** / Wasatch, are `delivered` — which is **not a live state**, so they are not rows on the
board at all. They are inside **Done · N this week** (open `history ▸` if you want to show them).
**Needs you · 0.** Ruth is `active`. No risk, no deadlines.

| # | Click | What the audience sees | Presenter says |
|---|---|---|---|
| 1 | Tab 3 `/nurse` → **Ruth Nakamura** → **Passed away** → **Confirm, with care** | A phone-shaped screen: *"Who has a change to report?"*, then *"What changed for Ruth Nakamura?"* with two choices — *Went home / discharged* and *Passed away*. The confirm card reads *"We'll schedule the equipment pickup with care and a note for the family. Take your time — this is the only step you need to do."* Then a toast: *"Recorded, with care."* | "The nurse is standing in the living room. She taps this once. That's the whole trigger — the sponsor told us their own discovery found the EMR-only path fail: someone dies and the vendor never finds out." |
| 2 | *(switch to tab 1 — no click)* | Ruth's two orders leave **Done** and appear in **On the way** as **one grouped row**: `Ruth Nakamura · Pickup · 2 items · — · 0 of 2 moving` (no date, because a pickup has no deadline of its own). **One** pickup text lands in Wasatch's thread, with a magic link — *"Pickup needed — 2 items from one home (hospital bed, oxygen concentrator), area Ogden. Family is present — please schedule promptly. Reply 1 if you can get both today, 2 to give us a window: `…/portal/<token>`"* | "Two pickups scheduled. Zero phone calls made by anyone in that house — **one death, one text, one trip.**" |
| 2b | Tab 7 `/vendor-phone` → header picker → **Wasatch** → in the message box type **the affirmative digit the text itself names** (read it off the bubble — *"Reply N if you can get both today"*) → send | The bubble goes out, the in-flight line reads **"sending…"** — not *"reading…"*, the model's word — and the system **texts a receipt back into the thread**: *"Got your "N" — both pickups are on the books for today. Thanks."* (`groupAckText()`, `server/messaging.ts`). Glance at tab 1: Ruth's grouped row reflects the vendor's commitment (green `Confirmed ✓`) | "One digit from the vendor, and both pickups are committed — the trip is the unit, and no model touched it." |
| 3 | Tab 2 `/driver` → vendor **Wasatch** *(already the default — no switch needed here)* | Two **PICK UP** job cards, each carrying *"**The family is grieving.** Call ahead, be brief and kind."* | "The dispatcher sees logistics. Never the death." |
| 4 | **Complete pickup** → sign → **Confirm pickup** | The job card is replaced by a green completion card — and inside it, a coral **Family notified** panel quoting the **actual sentence** sent to the household: *"Your hospice team: the equipment has been picked up. There's nothing else you need to do. We're thinking of your family."* (`Driver.tsx:73-81,221-226`) | **"Ruth's family made zero phone calls. That's the product."** |
| 5 | *(optional, if you have the slack)* tab 6 `/caregiver` → Ken Nakamura's thread | The same sentence, in the household's own thread | — |

**Read this before you rehearse:**
- ~~`[FE PENDING: nurse screen]`~~ — **DONE.** `/nurse` shipped (`pages/Nurse.tsx:70` posts
  `POST /api/patients/:id/status`, actor `hospice`, `payload.source:'nurse'`). Scenario 2 is now
  narrated as the nurse's own tap, for real. **The button says "Passed away", not "Patient has
  died"**, and the confirm is *"Confirm, with care"* — read the screen, don't paraphrase it, the
  wording is doing work.
- ~~`[FE PENDING: family message text]`~~ — **DONE where this beat needs it.** The driver's
  completion card renders the real family sentence (step 4). It is **still not rendered on the board
  timeline**, which prints event labels only (`RowDetail.tsx:100-118`) — so take step 5 to tab 6 or
  leave it on the driver card; don't point at the board's ledger and claim the sentence is there.
- "Two pickups" is now literally two: the trigger returns `pickups_triggered: [1050, 1051]`. Before
  the seed fix it returned **13** — Ruth's share of the synthetic year was still sitting in
  `delivered`, and every one of them fired a pickup text into Wasatch's thread.
- **Two pickups, one text — that's trip batching, built 08-15, and step 2b is the only place it is
  visible.** Both orders go to Wasatch from the same home, so `setPatientStatus()` sends a single
  `v_pickup_group` question spending **one** of Wasatch's five reply pairs instead of two. The
  spare line if a judge leans in: *"We batch the asking, never the answering — every order still
  keeps its own clock and its own proof."*
- **Step 2b's order is not negotiable: step 2 first, then the digit.** Do not touch the phone until
  tab 1 has shown the grouped row and you have read the ONE text out of Wasatch's thread. The whole
  point of the beat is that the audience sees *one* question before they see it answered *twice*;
  answer it first and there is nothing left to point at.
- **Read the digit off the bubble — it is not always `1`.** Pairs rotate ((1,2) (3,4) (5,6) (7,8)
  (9,0), odd = affirmative) and the question states its own pair in its body: *"Reply N if you can
  get both today, N+1 to give us a window."* Say the digit you can see on the projector.
- **The digit consumes the question — type it once.** A second copy of the same digit does not
  re-apply; the question is already answered, so the repeat drops into the human review queue
  (`sms.ts:331-333`) and your receipt line is gone. If you fat-finger it, move on — don't retype.
- **What tab 1 does at step 2b:** the row reflects the vendor's commitment, and the commitment
  itself is one click down — open the row and each sub-row's ledger reads *"ETA set · group reply ·
  no model"* (`domain.ts`). **Check at rehearsal what the row actually reads after the digit and
  narrate that**, in your own words — this pill was being changed on 08-15 and the script
  deliberately doesn't quote its text. Never promise a specific pill on stage.
- **Step 2b does not disturb step 3.** The driver's card copy keys off the order's state, not off
  the vendor's answer (`Driver.tsx:202,268-272`), and a pickup affirmative deliberately writes **no
  ETA** — so the two PICK UP cards and the *"family is grieving"* line are identical whether or not
  the vendor has said yes. Verified end to end: the E2E run drove both PODs *after* the group reply.
- **The digit also texts the household — once, for the whole trip.** The group affirmative sends a
  single `f_pickup_notice` off the anchor order (`sms.ts:313-314`), not one per item. It is a
  *different* text from step 4's closing sentence (`f_picked_up_thanks`), so step 4's coral panel
  still lands as written; just don't say the family hears nothing until the driver is done. If you
  take step 5 to tab 6 you will see both, in order.
- **The driver still sees two cards, and that's honest.** Grouping the *asking* is built; grouping
  the driver's *stop view* is designed only (`docs/SMS-BATCHING-SPEC.md` §6). Don't imply
  otherwise at step 3.
- **Fallback today:** tab 5 `/demo` → the **EMR feed (fallback path)** card → Ruth Nakamura →
  **Passed away** (`Demo.tsx:65-128`, `POST /api/emr/patient-status`, actor `system`, source `emr`).
  It produces the identical pickup cascade and toasts the count. **This card is on `/demo` — it is
  not on the board's right rail any more.** If you use it, the narration *must* flip: *"this is the
  EMR fallback firing — in the real product the nurse's tap gets there first, and this is the
  belt-and-suspenders behind her."* Do not call an EMR button a nurse tap on stage; a judge who read
  the FAQ will catch it.
- ~~`[QUIRK]` pickup-text tone~~ **FIXED, with one caveat re-checked 08-15.** The *single-order*
  pickup request (`pickupRequestText()`) reads *"Reply 1 if you can get it today, 2 to give us a
  window"* with no mention of the family. The *grouped* text scenario 2 actually sends
  (`pickupGroupText()`) does keep one line — *"Family is present — please schedule promptly"* —
  deliberately, because on a multi-item stop that is the scheduling constraint. It names no
  patient, no address, and no death. Still safe to open Wasatch's thread on stage; just don't
  claim the text says nothing about the family, because a judge can read it on the projector.
- Optional one-liner if you have slack: *"and if that pickup sits past the window, the watchdog
  escalates it on its own — the hospice knows before the family has to look at that bed another
  day."* (`server/watchdog.ts:107-113`.)

---

## 5 · Scenario 3 — the cold-start vendor (1:30, the climax)

**Seed:** `npm run seed scenario3` — **run it as you start this beat**, then hard-refresh tab 1. The
silence clock starts at seed time and you want the nag and the escalation to land live, on stage,
during this scenario.

**Starting state:** **Needs you · 0** — *"Nothing needs a person right now."* Under **On the way**,
two quiet rows, both with grey **`Waiting on vendor`** pills:
- `Frank Delgado · Delivery · Hospital bed` — this is #1060, to **Timpanogos Home Medical**, the
  vendor with zero history.
- `Eleanor Vance · Delivery · Standard wheelchair` — this is #1061, to Beehive, scoring *under* the
  threshold on every deadline weekday it can land on, deliberately: nothing but the silence is
  allowed to flag it.

**The vendor's name is not on the row.** A board row is who / action / item / when / pill
(`board.ts:133-145`) — you have to open a row to see which vendor it went to. Both beats below open
one, so this is a stage direction, not a problem.

### 5a · The tap (~45s)

| # | Click | What the audience sees | Presenter says |
|---|---|---|---|
| 1 | Tab 1 → **click the Frank Delgado row open** | The detail: `Timpanogos Home Medical · #1060 · Hospital bed` · **Nothing promised yet** · *"The vendor has not replied yet"* · a single risk bullet · a ledger with one entry | "This vendor has never heard of us. No contract, no account, no software. The hospice typed their phone number in from its own rolodex." |
| 2 | Tab 7 `/vendor-phone` → picker → **Timpanogos Home Medical · Ray** | One outbound text: order details + `confirm here: …/portal/1c22…` | "This is everything we send them." |
| 3 | Click the magic link (new tab) | A page opens: vendor name, their open orders — **exactly one**, nothing else in the list — and **Confirm · Set ETA · Can't fill it** | "No login screen. No signup. No password reset email at 6pm on a Thursday." |
| 4 | Tap **Confirm**, then `Cmd+W` → tab 1 | Frank's row pill flips **`Waiting on vendor` → `Accepted ✓`** live over SSE. The row does not move — it was never in trouble | "One tap. Deterministic — confidence 1.0, no model, nothing to review. The portal isn't something vendors adopt. **It's what's already waiting behind the link we sent them.**" |

### 5a-alt · The rolodex, performed live (~60s) — **either this or 5a, never both**

Same beat, stronger claim: instead of pointing at seeded Timpanogos, type a vendor into
existence on stage. V7's "identify, invite, activate" becomes three things the audience watches
happen. Costs ~15s over 5a (scenario runs ~1:45) — and the typing time is not dead air: it is
exactly what covers the watchdog ticks 5b needs, so you arrive at the silence beat with the nag
and escalation already landed. Decide at rehearsal which variant you're doing; don't improvise
the choice on stage.

| # | Click | What the audience sees | Presenter says |
|---|---|---|---|
| 1 | Tab: `/order` → patient **Harold Whitfield** (or Dorothy Chen — **never Frank or Eleanor**, their rows carry this scenario's beats) → keep Hospital bed / Urgent | The form filling in; the context rail naming the patient | "New admission, needs a bed — and the vendor I want isn't in our network. Yet." |
| 2 | Under the vendor picker → **"Not listed? Add a vendor by phone…"** → type a name (*Alpine Mobility*) and **`385-555-0142`** → tick extra **Serves** chips or leave them → **Add vendor** | The inline form; the patient's market chip is locked on; toast: *"their first text — with their portal link — goes out when you place this order"* | "This vendor does not exist in our system. No contract, no account, no software. The hospice types their phone number in from its own rolodex — that's the entire recruitment step." |
| 3 | **Place order** | Auto-navigates to the board, the new row highlighted under **On the way** | "Identified. Now watch the invite." |
| 4 | Tab 7 `/vendor-phone` → picker → **Alpine Mobility** | **Exactly one text**: order details, a reply pair, the magic link | "This is everything we send them. This is the entire onboarding." |
| 5 | Click the magic link (new tab) → **Confirm** → `Cmd+W` → tab 1 | Portal: vendor name, exactly one order, **Confirm · Set ETA · Can't fill it**. Back on tab 1 the row flips **`Waiting on vendor` → `Accepted ✓`** live | "Activated — one minute, start to finish. The portal isn't something they adopted. **It's what was already waiting behind the link we sent them.**" |

**5a-alt traps (all verified live 08-15 on a scenario3 scratch server):**
- **The phone number must not collide with a seeded vendor** (`801-555-0101/0202/…`).
  `POST /api/vendors` is idempotent on phone — a collision *selects* the existing vendor
  instead of creating yours, and the beat dies. `385-555-0142` is safe. Fat-fingering is
  also safe: re-adding the same number never duplicates, it re-selects.
- **The new order stays quiet by design** — measured risk 25 after the first tick, far
  under the 70 threshold, so **Needs you · 0 survives** and Eleanor's row is still the only
  one that moves in 5b. The only open escalation on the board is #1061's.
- The phone simulator's vendor picker refreshes over SSE when the order broadcasts — the
  new vendor is in the picker by the time you switch tabs. If it ever isn't, hard-refresh
  tab 7.
- **Don't tap the link or type the digit before the board beat** — same rule as scenario 1
  step 3. The reply pair on the invite is scenario-3 ammunition only if you haven't spent it.
- **Every reseed wipes the added vendor**, so rehearsal runs are clean and the same
  name/number works every time.
- If the typing feels risky on the day, fall back to 5a unchanged — seeded Timpanogos tells
  the same story and the rolodex line stays narration.

### 5b · The silence (~45s)

| # | Click | What the audience sees | Presenter says |
|---|---|---|---|
| 5 | Tab 7 → picker → **Beehive DME Co · Marcus** | The order request for #1061 — and, after the first watchdog tick, an automatic second message: *"Order #1061 (Standard wheelchair) hasn't been confirmed — reply N to accept, N+1 if you can't fill it, or tap to accept or decline: …"* (the digits are the pair the nag's own body names — it reuses the original request's pair) | "Nobody tapped this one. So the software nagged them. The case manager didn't." |
| 6 | Tab 1 | **Eleanor Vance's row jumps out of On the way and into `Needs you`**, on its own, live — the section header turns red and the row's pill is now a coral **`Swap vendor`** | "In the phone world, silence is ambiguous — did the fax go through? Here silence is a reading. An untapped link is exactly as loud as an unanswered text, and it reaches a human before the deadline does, not after." |
| 7 | **Click that row open** | In red, the watchdog's own sentence: *"No response to the automated check-in — order #1061 is still unconfirmed 5h after placement"* — above it, *"The vendor has not replied yet · nudged Xm ago"*: the nag is on the record, in the row, with a clock on it | **Read the red sentence off the screen, verbatim.** Then: "the software wrote that, and the case manager's next move is already sitting on the row." *(gesture at the coral pill — the same one-action escape hatch from scenario 1)* |

**Read this before you rehearse:**
- **The escalation sentence IS on screen now — read it off the row.** ~~`[FE PENDING: escalation
  reason in the row detail]`~~ **DONE** — `RowDetail` renders open escalations as bold red lines,
  deduped against the risk bullets (`RowDetail.tsx:83-86,128-132`). **Verified live 08-15:**
  opening Eleanor's row shows *"No response to the automated check-in — order #1061 is still
  unconfirmed 5h after placement"* in red above the two grey risk bullets. The sentence is
  verbatim from the watchdog (`watchdog.ts:94-103`), fires exactly once, and beat 7 may now be
  read directly off the screen — the strongest version of that beat. (Scenario 1's escalation
  still renders nothing, deliberately: it quotes the risk reasons, which are already on the row.)
- **Timing, measured 08-15 with NO env overrides:** the escalation is anchored to *placement*
  (nag past 2h of silence, escalation past 4h total — `server/watchdog.ts`), so with #1061's 5h
  backdate the nag goes out on the **first** tick (≤30s after the seed) and the escalation on the
  **next** (≤60s) — roughly when 5a ends. Verified live: escalation open at ~60s, sentence verbatim.
  `ACK_NAG_HOURS`/`ACK_ESCALATE_HOURS` in `.env` are tuning knobs, not demo requirements — leave
  them unset. Both broadcast over SSE (`messaging.ts:36`,
  `statemachine.ts:86`), which is what makes beats 5 and 6 land without a refresh. #1060 is freshly
  placed and is never nagged. Beehive is nagged once and only once (matched by template,
  `watchdog.ts:46-53`). If you arrive early, pause on the nag and let the escalation appear live; if
  it hasn't, narrate it and move on. **Never stand in silence waiting for a tick.**
- The portal page has **shipped** — step 3 is a real click, and the confirm was verified end to end
  (`POST /api/portal/1c2282…/orders/1060/confirm` → `state: "dispatched"`).
- **The digit beat, if you have 10 spare seconds at beat 5:** type `1` into the box on the vendor
  phone (there is nothing to tap — SMS has no buttons, and no annotations appear under the sent
  text, exactly like a real handset). Two things then happen at once: **a receipt texts back on
  the phone** — *"Got your \"1\" — order #1061 (…) is confirmed with you. Thanks."*, exactly what a
  production SMS system would send — and on **tab 1**, #1061 flips to **Accepted ✓** live over
  SSE, with the event noting *"Vendor accepted by text (replied 1)"* at confidence 1.0 — a
  template × position lookup (`server/sms.ts` `VENDOR_ROUTES`), no model call at all. Narrate it
  that way: "the vendor's phone stays a plain text conversation; our side is where the
  intelligence shows." **This ends the silence beat**, so only do it after beats 6 and 7 have
  landed.
  - **Verified 08-14: the digit here is `1`.** Vendor reply codes rotate — each open question owns a
    pair, allocated per vendor (`server/slots.ts`) — but Beehive has only #1061 open in this
    scenario, so it gets the first pair and `1` means accept. Re-check after re-seeding if you have
    placed extra orders with Beehive during rehearsal: the message body always names its own digits,
    so read the text on screen rather than trusting this line.
- ~~`[FE PENDING: evidence source on the timeline]`~~ **DONE** — the ledger now reads the real
  `payload.source` + actor and prints *"digit reply · no model"*, *"nurse tap · no model"*,
  *"vendor text · parsed by Claude"* per event. Point at it when you say "no model."
- `[QUIRK]` One open escalation per order can mask a newer, worse one (`statemachine.ts:80-84`). If
  you run 5b all the way through to a delivered claim *without* swapping first, the *"marked
  delivered without proof of delivery"* escalation is silently dropped and #1061 keeps sitting in
  **Needs you** on the strength of the stale silence escalation. Swap or accept; don't do both.
- Q&A ammunition (do **not** demo, no time): the Claude parse pipeline still runs the free-text
  channel, confidence-gated at 0.8 with a human review queue reachable from the board's *"N vendor
  replies need review"* button (`Hospice.tsx:56-66`); the IVR spec (`docs/IVR-SIM-SPEC.md`) covers
  the rolodex landlines that cannot receive SMS at all.

---

## 6 · Reporting beat — the directing nurse (0:15)

**Click:** tab 4 → `/reports`. ~~`[FE PENDING: reports view — the entire beat]`~~ — **DONE**
(`pages/Reports.tsx`: KPI row, vendor scorecards, condition stats, cost of care, cost approvals).
This beat is no longer cuttable-by-default; cut it only if you are behind.

| What the audience sees | Presenter says |
|---|---|
| Vendor scorecards — on-time by equipment × weekday, the same table the risk engine reads | "The third hospice user is the directing nurse. She never opens the board. This is her screen — and it's the exact data the risk engine already uses, so it cost us nothing." |
| The big coral **"phone calls that never happened"** counter, with its three-part breakdown | "And this is the number we actually care about: every status this system got without a human picking up a phone — **computed from the event log of a simulated year.**" |

- **Say the synthetic caveat out loud, every time.** The counter is a 5xl hero with no label on it
  (`Reports.tsx:137-151`), and the overwhelming majority of it is the seeded synthetic year, not
  your five minutes on stage. The cost cards further down the same page *are* labelled
  `synthetic` — which makes the unlabelled hero look deliberate. FAQ §6 penalises manufactured
  precision. ~~`[FE PENDING: SYNTHETIC label]`~~ **DONE** — the hero now wears the same
  `synthetic` badge as the cost cards, with the server's counting rule printed underneath.
- **Do not demo the cost-approval queue as a gate.** The approve/decline buttons are local
  `useState` — no API call, no persistence, and nothing stops an over-threshold order from shipping
  (`Reports.tsx:450-457`, `docs/FEATURES.md` §2). Show it as a *design* if it comes up, never as a
  control.
- Both former `[BLOCKED]` markers are stale — the backend shipped long ago:
  `GET /api/reports/vendor-scorecards` and `GET /api/reports/summary` (`routes.ts:317,321`,
  `server/reports.ts`), and the five calls the page makes were all verified live.

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
| Board looks stale / empty right after a seed | Hard-refresh. Seeds write straight to SQLite and broadcast nothing; the UI only refetches on SSE (`client/src/lib/useLive.ts`). Scenario 2 will **never** self-heal. |
| Scenario 2's board still shows nothing after a refresh | You refreshed tab 1 but the seed hadn't finished, or you're on the wrong scenario. Re-run the seed, watch it print, *then* refresh. Also refresh tab 3 — `/nurse` never refetches on its own. |
| `/driver` says "Route's clear" | Wrong vendor in the picker — it defaults to Wasatch (`Driver.tsx:24`). After the S1 swap you must change it. |
| The header dot is red / "disconnected" | Refresh the tab — SSE reconnects on its own. Don't restart the server mid-demo. |
| Portal page 404s on a link | Paste the URL from the token table above. If `MAGIC_LINK_SECRET` is set in `.env`, those tokens are wrong — unset it and restart. |
| You've lost track of which tab is which | The two phones and the portal all open in new tabs. `Cmd+W` any portal tab you're done with; the phones live at 6 and 7. |
| A row you expected in **Needs you** is in **On the way** | It is under the risk threshold and has no open escalation (`lib/atRisk.ts:54-59`) — that is the design, not a bug. Read the seed print: if the score isn't ≥ 70, the row won't move. |
| A row you expected has vanished into a collapse | **"N more, nothing due before …"** hides anything due beyond six days (`board.ts:208-214`). Click `show ▾`. |
| Venue wifi dies | Everything except the free-text parse is local. Both magic-link beats and every digit reply still work. Only the S1 SMS *fallback* needs the network. |
| A live parse comes back wrong (Q&A path) | That's the review queue demo, not a failure: "the model knows what it doesn't know; a person decides." The queue opens from the board's *"N vendor replies need review"* button. |
| A transition 409s (`cannot apply X while order is Y`) | You clicked out of order. Reseed that scenario — it's one command and ~10 seconds. |
| You're past 4:00 and still in scenario 3 | Skip the reporting beat, go straight to the close. The close is never cut. |

---

## FE punch list

Everything the demo needs that has no screen yet, in the order that buys the most demo. Struck
items were verified shipped on 2026-08-14 (`docs/E2E-WALKTHROUGH.md`).

1. ~~**`/portal/:token` page**~~ — **DONE** (`client/src/pages/VendorPortal.tsx`, route in
   `App.tsx`). Confirm / ETA / decline all wired; verified live against vendor 4's token.
2. ~~**Nurse status screen**~~ — **DONE** (`pages/Nurse.tsx`: patient list → *Went home / discharged*
   or *Passed away* → confirm → `POST /api/patients/:id/status`). Scenario 2's primary framing is
   real; the EMR button on `/demo` is now genuinely the fallback.
3. ~~**Evidence badge**~~ — **DONE** (`components/EvidenceBadge.tsx`: green **Verified** vs grey
   **Reported**, on the row detail and per event).
4. ~~**Linkify magic links**~~ — **DONE** (`components/PhoneScreen.tsx:135-146`). No copy-paste on
   stage.
5. ~~**Plain-language state labels**~~ — **DONE** (`client/src/lib/domain.ts:9-18`).
6. ~~**`/reports` view**~~ — **DONE** (`pages/Reports.tsx`).
7. ~~**Render `family_notified` payload text**~~ — **DONE on the driver's completion card**
   (`Driver.tsx:73-81,221-226`) **and in the `/caregiver` thread**. Still **not** on the board's
   event ledger, which prints labels only — S2 step 5 works around it by staying on the driver card.
8. ~~**SYNTHETIC label on the calls-avoided hero**~~ **DONE** — badge + counting rule shipped.
   *(Still open from the aside: `household_confirmations` is computed by the API and never
   rendered in the breakdown.)*
9. **Render the escalation reason in `RowDetail`** — `detail.escalations` is already fetched and
   never rendered (`RowDetail.tsx:15,36-37`). Today the watchdog's best sentence — *"No response to
   the automated check-in — order #1061 is still unconfirmed 5h after placement"* — exists only in
   the API. This is the single line that would let scenario 3's climax be *read* instead of
   described.
10. ~~**Render event `payload.source`**~~ **DONE** — real source + actor rendered per event;
    `mockEvidenceSource` survives only as the fallback for seeded history rows with null payloads.
11. ~~**Post-death pickup copy**~~ **DONE** — gentler wording shipped and test-pinned.
</content>
</invoke>
