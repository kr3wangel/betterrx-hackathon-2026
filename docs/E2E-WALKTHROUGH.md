# E2E walkthrough — do the three demo scenarios actually walk?

**Verdict: yes. All three scenarios walk end to end through the real UI — every click in
[`DEMO-SCRIPT.md`](deliverables/DEMO-SCRIPT.md) lands on a real control and produces the promised
result. The overnight work (board gating, narration toasts, handoffs, the landing page, the rebuilt
`/vendor`, the rotating reply codes) is on screen and behaves. What is now out of date is the
*script*, not the code: the vendor magic link changed shape, the vendor phone lost its tap-buttons,
`/driver` no longer defaults to Wasatch, and the escalation sentence — which the script tells you
NOT to read aloud — is now rendered in red on the row. Four small honesty/robustness defects are
listed under (a); none of them block a rehearsal.**

Run on **2026-08-15, 14:00–14:25 UTC** against the worktree branch
`worktree-agent-ac1c291f50d5ac651` with local `main` merged in (the full overnight run). Authority
for the beats: `docs/deliverables/DEMO-SCRIPT.md`. Wave brief: `docs/OVERNIGHT-PLAN.md` §4.1.
**No source file was modified — this document is the only thing written.**

---

## How this was run

| | |
|---|---|
| API | `DB_PATH=<scratch>/e2e4.db PORT=3299 ACK_NAG_HOURS=4 ACK_ESCALATE_HOURS=0 npx tsx server/index.ts` |
| Client | `npx vite build client` → `client/dist`, served by a 40-line static+proxy server on **:3298** (proxies `/api/*`, including SSE, to :3299). So every beat below is the **built client**, driven by real DOM clicks. |
| Browser | headless Chrome 151 over CDP on :9333 (plain node, no new deps) — real `click()`, real `Input.dispatchMouseEvent` for the signature canvas, real `<select>` change events |
| Seeds | `DB_PATH=<scratch>/e2e4.db npx tsx scripts/seed.ts scenarioN` |

**The shared dev server on `:3001` / `:5173` and `data/app.db` were never touched.** Everything —
scratch DB, Chrome profile, driver scripts — lived in the session scratchpad and is deleted.

Repo gates, run clean on the merged tree: **`npm test` → 199 passed / 15 files**;
**`npm run typecheck` → clean**; `npx vite build client` → clean.

> **One caveat on today's data.** Seeded on 2026-08-15, scenario 3's `#1061` scores **exactly 70** —
> the threshold — so it is `AT RISK` from the first tick. The seed print already warns about this
> ("If #1061 ever prints `AT RISK`, the silence beat is contaminated"). See morning decision (c-4).
> To verify the silence ladder cleanly I re-ran it with `ACK_NAG_HOURS=0 ACK_ESCALATE_HOURS=0` so
> the under-threshold `#1060` carried the beat instead. Env only — no source or seed edits.

---

## Scenario 1 — the case worker's save

`seed scenario1`. Deadline landed on a **Saturday**; `#1042` risk **100** / 4 reasons,
`#1043` risk **0**; swap options `Wasatch 96% · Canyon 70%`.

| # | Beat | Expected | Actual | |
|---|---|---|---|---|
| 0 | **First paint — no false all-clear** | the board must not say "Nothing needs a person" before data lands | Sampled every 60 ms from navigation, and again with every `/api/*` request held 4 s: the loading paint renders **9 skeleton nodes and no headline at all**. The words "Nothing needs a person right now" never appear before data. | **PASS** (wave 1A) |
| 1 | Needs you · 1 | red count, Margaret Osei lead row, coral `Swap vendor` pill | `1 order needs someone.` / `Needs you · 1` / `Margaret Osei · Today · Delivery · Hospital bed · [Swap vendor]`. `On the way · 1` holds the oxygen concentrator as `Accepted ✓`. `Done · 154 this week`. | **PASS** |
| 2 | **Click the row open** | vendor, badge, deadline, promise, nudge line, four reasons, ledger | Opens in place: `Beehive DME Co · #1042 · Hospital bed · Reported` · **NEEDED BY** Aug 15, 8:06 PM · **VENDOR PROMISED** "Nothing promised yet" · *"The vendor has not replied yet · nudged 1m ago"* · then all four risk reasons as sentence-cased bullets · then the ledger. | **PASS** |
| 2b | Escalation sentence in the row | wave 1A: `RowDetail` renders `detail.escalations` | **Rendered — but deliberately suppressed here.** `RowDetail.tsx:69-72` filters out any escalation whose reason contains a risk reason, because the watchdog's *risk* escalation quotes the reasons verbatim and would print twice. In S1 the escalation *is* the four reasons, so the bullets are the whole story. Proven working on a non-duplicate escalation in S3 below. | **PASS** (by design) |
| 3 | **Swap dialog copy** | one-click alternatives with a per-vendor decision line | `Send this to another vendor` → `Canyon Home Medical / 70% on-time for hospital beds on Saturday` · `Timpanogos Home Medical / New — no history yet` · `Wasatch Medical Supply / 96% on-time for hospital beds on Saturday` · `Close`. Vendor-specific, equipment-specific, weekday-specific, and the cold start reads honestly. No confirm step. | **PASS** |
| 3b | **Own action must not double-toast** | the swap is my click — narration must stay quiet | Exactly **one** toast: *"Margaret's hospital bed moved to Wasatch Medical Supply / They've been texted."* — the dialog's own receipt. The narration hook stayed silent (`expectOwn` suppression). The row also **pulsed** (`row-ack`, 15 samples over 1.2 s). | **PASS** (wave 2A/2B) |
| 3c | The row clears itself | Needs you → 0, orders group | `Nothing needs a person right now.` / `Needs you · 0`, and Margaret's two orders collapse to `Margaret Osei · Today · Delivery · 2 items · 1 of 2 moving`. | **PASS** |
| 4 | Vendor thread | the outbound text with a live link | `New order #1042: 1x Hospital bed, semi-electric (E0260), deliver by today 8:06 PM, area Provo. Reply 1 to accept, 2 if you can't fill it — or confirm here: localhost:5173/o/cb23a0667c` | **PASS** / **script stale** — see (b-1) |
| 5 | Tap the link → confirm | no-login page, board flips live | `/o/cb23a0667c` renders `Order #1042 · Wasatch Medical Supply · Hospital bed, semi-electric · Urgent · Ordered · Due in 20h` with **`Yes, we can fill it` · `Accept with an ETA` · `Can't fill it`**. Tapping the first → page reads `Accepted` + *"Confirmed — thank you"*; the board ticks to **`2 of 2 moving`**. | **PASS** / **script stale** — see (b-2) |
| 5b | **Narration toast on vendor accept** | the board speaks | *"Wasatch Medical Supply accepted Margaret's hospital bed"* on the board tab, ~2 s after the tap (250 ms debounce + the hook's four world fetches). Row pulsed. | **PASS** (wave 2A) |
| 6a | Driver: auto-picked vendor | wave 3: first vendor with an actionable order | Landed on **Canyon Home Medical** (it owns `#1043`, the first actionable row in `/api/orders`) — **not** the swapped vendor. Presenter must still change the picker. | **PASS** (behaves as built) / **script stale** — see (b-3) |
| 6b | **Start delivery guard** | no double-tap window | After the tap the `Start delivery` button is **gone**, replaced by `On the truck` + `Complete delivery`. No re-enable, so no second tap can 409. | **PASS** (wave 1C) |
| 6c | **Signature auto-capture** | drawing alone arms the confirm | Before drawing: `Confirm delivery` disabled + *"Sign in the box above to finish."* After a mouse stroke on the canvas: **enabled**, hint gone. No separate save step. | **PASS** (wave 1C) |
| 6d | POD → delivered | verified badge, family sentence | `DELIVERED · Hospital bed, semi-electric · Margaret Osei · signature on file` + coral **Family notified** panel quoting *"Your hospice team: the hospital bed, semi-electric has been delivered and set up. If anything isn't right, call us — we'll handle it with the supplier."* API: `state: delivered`, `delivery_verified: true`. Board `Done` ticks 154 → 155. | **PASS** |
| 6e | The "photo and a signature" line | should describe what just happened | Board reads *"Every delivery had a photo and a signature."* and `✓ 155 of 155` — but this delivery had **no photo**. See regression (a-2). | **FAIL (honesty)** |

---

## Scenario 2 — the nurse in the home

`seed scenario2`. `#1050` + `#1051` delivered for Ruth Nakamura / Wasatch; board starts
`Needs you · 0`, `On the way · 0`.

| # | Beat | Expected | Actual | |
|---|---|---|---|---|
| 1 | `/nurse` → Ruth → **Passed away** | the three-step phone-shaped flow | `Who has a change to report?` → 12 patients → Ruth → `What changed for Ruth Nakamura?` with `Went home / discharged` and **`Passed away` / "The patient has passed. We'll handle pickup gently."** → confirm card: *"Confirm Ruth Nakamura has passed away / We'll schedule the equipment pickup with care and a note for the family. Take your time — this is the only step you need to do."* → **`Confirm, with care`** / `Not yet`. Every word matches the script. | **PASS** |
| 2 | **The toast** | script says *"Recorded, with care."* | *"**Recorded, with care** / 2 pickups are on the driver's list for Ruth Nakamura. The family will be handled gently."* — **with a `See the pickups` action button**. Richer than the script describes. | **PASS** / **script stale** — see (b-4) |
| 3 | **"See the pickups" handoff** | lands on `/driver`, right vendor, rows highlighted + scrolled | Lands on `/driver` with the picker **already on Wasatch Medical Supply** (steered by the handoff, not by the default), both rows `1051` and `1050` present, and **both carrying `row-ack`** on the very first 120 ms sample. | **PASS** (wave 2B) |
| 4 | Driver sees pickups | two PICK UP cards with the grieving note | `2 stops on your route.` — two `PICK UP` cards, each with *"**The family is grieving.** Call ahead, be brief and kind."* | **PASS** |
| 5 | Board reacts | orders leave Done, group under On the way | `Ruth Nakamura · — · Pickup · 2 items` under **On the way**. | **PASS** |
| 6 | Pickup POD | Done + the real family sentence | `PICKED UP · Oxygen concentrator · Ruth Nakamura · signature on file` + **Family notified**: *"Your hospice team: the equipment has been picked up. There's nothing else you need to do. We're thinking of your family."* Verbatim. | **PASS** |

> **Where the script is now stale for S2:** step 3 says *"vendor **Wasatch** (already the default —
> no switch needed here)"*. Wasatch is **not** the default any more — `/driver` picks the first
> vendor with an actionable order (wave 3), and in this scenario the *handoff* is what puts you on
> Wasatch. The reason in the parenthetical is wrong even though the outcome is right; and if the
> presenter navigates to `/driver` by the nav instead of by the toast button, the auto-pick decides,
> not Wasatch. Replacement wording in (b-3)/(b-5).

---

## Scenario 3 — the cold-start vendor

`seed scenario3` fired into a running server, as the script says. `#1060` → Timpanogos (risk 25,
one reason), `#1061` → Beehive (**risk 70 today — see the caveat above**).

| # | Beat | Expected | Actual | |
|---|---|---|---|---|
| 5a·1 | Board start state | two quiet rows, `Waiting on vendor` | `Needs you · 0` · `On the way · 2`: `Frank Delgado · Tomorrow · Delivery · Hospital bed · Waiting on vendor` and `Eleanor Vance · Monday · Delivery · Standard wheelchair · Waiting on vendor`. | **PASS** |
| 5a·2 | Timpanogos thread | one outbound with the link | `New order #1060: 1x Hospital bed, semi-electric (E0260), deliver by tomorrow 4:11 AM, area Provo. Reply 1 to accept, 2 if you can't fill it — or confirm here: localhost:5173/o/8f23e57f8f` | **PASS** / **script stale** — (b-1) |
| 5a·3 | Fresh link resolves | vendor name, the order, three actions | `Order #1060 · Timpanogos Home Medical · Hospital bed, semi-electric · Urgent · Ordered · Due in 20h · by Sun 4:11 AM` + `Yes, we can fill it` / `Accept with an ETA` / `Can't fill it`. Cold start reads clean. | **PASS** / **script stale** — (b-2) |
| 5a·4 | **Confirm flips the board live, with narration** | pill flips + a toast | Pill `Waiting on vendor` → `Accepted ✓` and toast ***"Timpanogos Home Medical accepted Frank's hospital bed"*** landed **+2.0 s** after the tap; row `1060` pulsed. | **PASS** (wave 2A) |
| 5b·5 | The nag, with a reply code | automatic second message on the first tick | +12 s after the seed: *"Order #1061 (Standard wheelchair) hasn't been confirmed — **reply 1 to accept, 2 if you can't fill it**, or tap to accept or decline: localhost:5173/o/012377672a"*. The nag **reuses the order's own pair** rather than spending a new one, so it is `1`/`2` here — same as the original request. `#1060` was never nagged. | **PASS** — the script's "the digit here is `1`" survives |
| 5b·6 | The escalation moves the row | row jumps to Needs you, live | Confirmed twice. `1 order needs someone.` / `Needs you · 1` with `Eleanor Vance … [Swap vendor]`; and in the clean re-run, `#1060` jumped on its own to `Needs you · 2`. | **PASS** |
| 5b·7 | **The escalation sentence is readable in the row** | wave 1A | **Rendered, in red.** Row `#1060` open shows, in `text-destructive`, verbatim: ***"No response to the automated check-in — order #1060 is still unconfirmed 0h after placement"***, sitting between the nudge line and the risk bullets. Confirmed via the computed class, not just the text. | **PASS** — the script's biggest stale line, see (b-6) |
| 5b·7b | **Escalation narrates** | alert toast carrying the reason | ***"Frank's hospital bed is at risk — escalated"*** with the escalation sentence as the toast description, and the row pulsed (20 samples). | **PASS** — but see (a-1) |
| — | Digit reply on the handset | typed digit applies deterministically | Typed `1` into the composer on `/vendor-phone` → receipt ***"1 · Accept — applied · no model needed"***, `#1061` → `dispatched`, event `vendor_accepted (vendor)`, **and the board (a different tab) narrated "Beehive DME Co accepted Eleanor's standard wheelchair"**. | **PASS** / **script stale** — (b-7) |
| — | Reports counters moved | breakdown must sum to the hero | `/api/reports/summary` → `calls_avoided: 205`, breakdown `1 + 204 + 0 + 0 = 205`. On screen: `SYNTHETIC` badge, `205`, *"phone calls that never happened"*, and the four-part line *"1 vendor texts auto-applied · 204 vendor self-updates · 0 auto-triggered pickups · **0 household confirmations**"*. The old gap (`household_confirmations` computed but never rendered) is **closed**. | **PASS** |

---

## Cross-cutting checks

| Check | Actual | |
|---|---|---|
| **Landing page `/`** | Outside the Shell. `betterRX` mark, `BetterRX DME`, and the promise *"Hospice equipment, tracked from the order to the pickup — so nobody in a grieving house has to chase a truck."* Then `WHO ARE YOU TODAY?` and **six persona cards**, each with initials, label, a plain-English line, **and the destination printed under it**. Below: *"The two people this system texts who never log in."* with both phone links. | **PASS** |
| **Cards land where `homeFor` derives** | Clicked all six: CM→`/hospice`, AN→`/hospice`, FN→`/hospice`, DS→`/driver`, DR→`/driver`, DON→`/hospice`. Every landing matches the path the card itself prints. | **PASS** (mechanically) / see (c-1) |
| **The two phone links open** | Both are real anchors with `target="_blank"` → `/vendor-phone` and `/caregiver`. | **PASS** |
| **`/demo` on the landing page** | **Absent** — the landing page's only anchors are the two phones. | **PASS** |
| **`/demo` as a route** | **Still routable and still renders** (`Demo controls · Presenter tools…`, EMR feed card). Unlisted in every nav. This is the script's tab 5 fallback, so it working is *good* — but "absent" is only true of the nav and the landing page. | **PRESENT — intentional?** see (c-3) |
| **Retired nav** | No role's nav contains `/vendor` or `/vendor-portal`. CM `[/hospice,/order,/nurse,/reports]` · AN `[/hospice,/order]` · FN `[/hospice,/nurse]` · DS `[/driver]` · DR `[/driver]` · DON `[/hospice,/reports]` · signed-out `[/hospice,/order,/nurse,/driver,/reports]`. | **PASS** (wave 1C) |
| **Both still load by URL** | `/vendor` renders the **wave-3 rebuilt** dispatcher board on tokens — vendor picker, `Open orders (41)`, `StatusPill`, `URGENT` / `Verified` badges, ETA column, in-page reply simulator. `/vendor-portal` (no token) renders a graceful *"Open the link we texted you / Your orders live at a private link — no account, no password."* | **PASS** (wave 3) |
| **Watchdog `risk_updated` must not toast** | `risk_updated` is in `MUTED_TYPES` (`narration.ts:52`). Observed across ~4 minutes of live ticks with the board open: **zero** toasts from risk recomputation, while the rows kept updating. | **PASS** |
| **`?quiet=1`** | Arrive with `?quiet=1` → `sessionStorage.betterrx.quiet = "1"`, remote mutation fires → **0 toasts, rows still pulse** (52 `row-ack` samples across both rows). Navigate again **without** the param in the same session → still 0 toasts. `?quiet=0` → flag cleared, toast returns. | **PASS** (wave 2A) |
| **Loading states** | API held 4 s: `/hospice` 9 skeleton nodes · `/reports` 6 · `/vendor` 4 · `/nurse` 3 · **`/driver` 0**. | **PASS except `/driver`** — (a-3) |
| **Server-unreachable states** | `/api/*` blocked: header dot flips to **Disconnected**; `/hospice` → *"Can't reach the server — this board may be out of date. Still trying."*; `/reports` → *"Couldn't load the reports / We can't reach the server right now. Nothing is lost — try again in a moment."* + `Try again`; **`/driver` → nothing at all** below the persona header. | **PASS except `/driver`** — (a-3) |
| **Repo health** | `npm test` **199/199, 15 files** · `npm run typecheck` clean · `vite build client` clean. | **PASS** |

---

## Punch list

### (a) Regressions needing a fix

**a-1 · Narration can silently drop an event when several broadcast in the same watchdog tick.**
(MEDIUM — narration only; the board itself is never wrong)
`useEventStream.ts` holds a **single slot**: `es.onmessage` sets `stream.last` and notifies, and
`useEventNarration` queues off the `lastEvent` *state value*. When the watchdog's synchronous tick
loop writes several frames into one network write, the browser can dispatch them in one task, React
batches the `setState` calls, and the effect sees only the **last** frame — so any narratable event
followed by a non-narratable one (`message`, `risk_updated`) in that batch is dropped.
Observed: `#1061`'s escalation, firing in a busy post-seed tick alongside a `v_ack_nag` message and
several `risk_updated`s, produced **no toast**; `#1060`'s escalation 30 s later on a quiet tick
toasted correctly. Client-originated bursts (two HTTP POSTs) both narrate fine, which fits — those
are separate tasks. *One clean reproduction plus an identified mechanism; I did not build a
synthetic multi-frame-in-one-write probe to nail it beyond doubt.*
**Demo impact:** S3's escalation toast is best-effort. The row still moves, which is the beat.
**Fix shape:** make the stream deliver a queue (or a monotonically-tagged array) rather than one
slot, or have `acquire()` push straight into the narration queue instead of routing through React
state.

**a-2 · "Every delivery had a photo and a signature." is false about the delivery you just did.**
(MEDIUM — honesty, ~2 lines)
`board.ts:222` — `hasPod = (o) => o.state === 'picked_up' ? o.pickup_verified : o.delivery_verified`,
and `delivery_verified` is true on a **signature alone**. `Hospice.tsx:141` then prints *"Every
delivery had a photo and a signature."* whenever `withPod === completions`. The demo's own POD
(script step 5: `Start delivery → Complete delivery → sign → Confirm delivery` — no photo step)
produced `photo_path: null` and still counted, so the board asserted a photo that does not exist.
FAQ §6 penalises exactly this. **Fix shape:** say what is actually counted — *"Every delivery closed
out with proof."* — or count photos for real.

**a-3 · `/driver` is the only page with neither a loading state nor a failed state.** (LOW-MEDIUM)
`Driver.tsx:104` gates the `EmptyState` on `vendorId !== null && jobs`, so while the API is in
flight — and permanently, if it never answers — the page renders the persona header and **nothing
else**. Every other surface got a skeleton and an error card in wave 3. Under a blocked API the
vendor `<select>` doesn't even render, so there is no control to touch.

**a-4 · `/vendor` prints `Open orders (0)` while still loading.** (LOW)
Skeletons render below, but the section count is already committed to zero. A judge watching the
page settle sees "0" turn into "41".

### (b) Demo-script lines now stale

**b-1 · The vendor magic link changed shape.**
The script quotes, in pre-demo §5, S1 step 3 and S3 5a·2, a vendor-wide link:
> *"New order #1042: 1x Hospital bed… confirm here: `http://localhost:5173/portal/…`"*

Actual, every outbound vendor template (`server/portal.ts:51`, `orderLink()`):
> *"New order #1042: 1x Hospital bed, semi-electric (E0260), deliver by today 8:06 PM, area Provo. Reply 1 to accept, 2 if you can't fill it — or confirm here: `localhost:5173/o/cb23a0667c`"*

Per-**order**, ten hex characters, **no `http://`** (deliberate — `Linkify` puts the scheme back to
build the href, `PhoneScreen.tsx:136-141`). **Replacement:** describe it as *"a short link about this
one order"*. Keep the four `/portal/<20-hex>` URLs in the §5 table — `portalLink()` still exists and
`/portal/:token` still resolves — but relabel that table **"paste-in fallback, not what the text
says."**

**b-2 · The page the link opens is a single-order page, not the vendor's list.**
Script (S1 step 4 / S3 5a·3):
> *"No-login page: vendor name, their open orders, **Confirm · Set ETA · Can't fill it**"*
> *"A page opens: vendor name, their open orders — **exactly one**, nothing else in the list"*

Actual (`/o/:token` → `PortalOrder`): a page for **that order alone** — `Order #1060 ·
Timpanogos Home Medical · Hospital bed, semi-electric · Urgent · Ordered · Due in 20h · by Sun
4:11 AM` — with buttons **`Yes, we can fill it` · `Accept with an ETA` · `Can't fill it`**.
**Replacement:** *"No login screen. The text was about one order, so the link opens that one order —
and the only three things a vendor can say about it."* The "exactly one, nothing else in the list"
line should go: it now reads as a coincidence rather than the point.

**b-3 · `/driver` no longer defaults to Wasatch.**
Script, S1 "Read this before you rehearse":
> *"**Step 5's picker is a trap.** `/driver` defaults to **vendor 1, Wasatch** (`Driver.tsx:24`)."*

and the failure drill:
> *"`/driver` says 'Route's clear' | Wrong vendor in the picker — it defaults to Wasatch (`Driver.tsx:24`)."*

Actual (`Driver.tsx:50-60`): it opens on **the first vendor that has an actionable order**, settled
once, and a handoff overrides even that. In this run it landed on **Canyon Home Medical**.
**Replacement:** *"Step 5's picker is still a trap, for a new reason. `/driver` opens on whichever
vendor has the first actionable order — not on the vendor you just swapped to. Change the dropdown
before you point at the screen."* And for the drill: *"Wrong vendor in the picker. It auto-picks the
first vendor with work, which after a swap is usually not yours."*

**b-4 · The nurse toast is richer than the script says, and carries a button.**
Script, S2 step 1: *"Then a toast: **'Recorded, with care.'**"*
Actual: *"**Recorded, with care** / 2 pickups are on the driver's list for Ruth Nakamura. The family
will be handled gently."* **with a `See the pickups` action button.**
**Replacement:** *"Then a toast — **'Recorded, with care'** — that counts the pickups back to her and
offers **See the pickups**. Tap it."* This is the best handoff in the build and the script does not
mention it at all.

**b-5 · S2 step 3's parenthetical is wrong.**
Script: *"Tab 2 `/driver` → vendor **Wasatch** *(already the default — no switch needed here)*"*
**Replacement:** *"The **See the pickups** button from step 1 lands you here with Wasatch already
selected and both rows ringed. (If you navigate here by the nav instead, check the picker — it
auto-picks, and it may not pick Wasatch.)"*

**b-6 · The escalation sentence IS on screen now. Two script blocks say it isn't.**
Script, S3 "Read this before you rehearse":
> *"**The escalation sentence is not on screen.** … but **no component renders escalation text**. … Do **not** read the sentence out as though it's on the screen. `[FE PENDING: escalation reason in the row detail]`"*

and FE punch list item 9 (*"Render the escalation reason in `RowDetail`"*), and S1's
`[FE PENDING: escalation reason on the board]`.
Actual: `RowDetail.tsx:110-114` renders every open escalation in `text-destructive`. Verified live:
***"No response to the automated check-in — order #1060 is still unconfirmed 0h after placement"***,
red, on the open row. It also narrates as the toast's description.
**Replacement for the S3 block:** *"Click the row open and **read the red sentence**: 'No response to
the automated check-in — order #1061 is still unconfirmed 5h after placement.' That is the
watchdog's own words, on the row, with the nudge clock under it."* Strike FE punch item 9. **One
subtlety to keep:** `RowDetail` deliberately hides an escalation that merely repeats the risk
reasons (`RowDetail.tsx:69-72`), so in **scenario 1** there is no red sentence — the four bullets
are it. Don't promise a red line in S1.

**b-7 · The vendor phone has no tap-buttons any more.**
Script, pre-demo §4 ("What each phone is"):
> *"under the **newest unanswered question only** — tappable `1 · Accept` / `2 · Can't fill` buttons with an *'applied · no model needed'* receipt (`QuickReplies.tsx:15-31`, `VendorPhone.tsx:115,162`)"*

Actual (`VendorPhone.tsx:131-133`, a deliberate change): *"There are no reply buttons, because SMS
has none — a vendor on a real handset types '7' into the box like any other text."* The screen is a
thread plus a full on-screen keyboard; the send posts to gateway-shaped
`POST /api/messages/inbound`. The receipt survives: typing `1` produced ***"1 · Accept — applied ·
no model needed"***. Note the script **already says this correctly** in the S3 body (*"there is
nothing to tap — SMS has no buttons"*), so §4 contradicts §5's own beat.
**Replacement for §4:** *"Tab 7 is the DME dispatcher's phone: a vendor picker, the real thread, and
a keyboard. There is nothing to tap — SMS has no buttons, so you type the digit, exactly as a
dispatcher would. The receipt under your bubble reads 'applied · no model needed'."*

**b-8 · The script has no beat for the landing page.**
`/` is new tonight and is the first thing a judge sees if anyone types the bare host.
**Suggested addition to the tab table:** a tab 0 at `http://localhost:5173/` — *"the front door:
name, promise, and one card per persona, each showing where it lands."* Worth 5 seconds at the top
of beat 2 if the deck allows.

**b-9 · Stale lines in the previous version of this document**, for anyone working from it: old
punch #1 (columns/banner), #2 (reasons behind a click), #3 (digit quick-replies on `/vendor-phone`),
#6 (`[FE PENDING]` markers) and #9 (`/driver` defaults to vendor 1) are all superseded above.

### (c) Morning decisions

**c-1 · Three persona cards land somewhere other than what their line promises.** *(pending
decision, not a bug — flagged in the brief for `field_nurse`; it is actually three.)*
`homeFor()` returns the **first** `surfaceLinks` entry containing the role, and `/hospice` is first
and lists four of the six roles. So:

| Card | Its line | Lands on | Arguably wants |
|---|---|---|---|
| Field Nurse | "Tell the system a patient has died or gone home" | `/hospice` | `/nurse` |
| Admissions Nurse | "Place an order for a patient coming home" | `/hospice` | `/order` |
| Director of Nursing | "Where the time and the money went" | `/hospice` | `/reports` |

The cards print their destination, so nothing lies on screen. But the *promise* and the *landing*
disagree three times out of six, and S2 opens on the Field Nurse. Options: reorder `surfaceLinks`
(changes nav order for everyone), or give `homeFor` an explicit per-role map. **Angel's call.**

**c-2 · Product name.** `APP_NAME` renders as **"BetterRX DME"** on the landing page. Parked by the
overnight plan as a morning decision; noting that it is now *visible on the front door*, not just in
a constant.

**c-3 · `/demo` stays routable but unlisted — confirm that's the intent.** It is off the nav and off
the landing page, and the demo script needs it as the tab-5 fallback (EMR feed, send-a-text-by-hand),
so keeping it routable looks right. Just confirm nobody meant "delete the page".

**c-4 · Scenario 3's silence beat is contaminated on today's date.** Seeded 2026-08-15, `#1061`
computes to **exactly 70** — the threshold — so it is flagged by *risk*, not by silence, and the
one-open-escalation-per-order rule (`statemachine.ts:80-84`) then masks the silence escalation
entirely. Consequences on stage: the row is already in **Needs you** before the ladder runs, so beat
5b·6's "it jumps out on its own" doesn't happen; and 5b·7's red sentence is suppressed as a
duplicate. **Re-run the seed print on demo morning.** If `#1061` prints `AT RISK`, either reseed onto
a different target weekday or narrate the risk instead of the silence — the script's own §6 already
says this; it just came true.

**c-5 · Keep `/vendor` and `/vendor-portal` routable at all?** Both work and `/vendor` is a genuinely
good rebuilt screen, but neither is in any nav and neither is in the script. If they're kept, they're
Q&A material ("what does the dispatcher see if they *do* log in?"); if not, they're two more URLs to
explain.

---

## Verdict

**Three for three. Every beat of the demo script lands on a real control and produces the promised
outcome, through the built client, on a clean isolated stack, with `npm test` 199/199 and
`typecheck` clean. The overnight waves are visibly on screen and behave: the board no longer lies
during its first paint, the swap dialog is honest about a vendor with no history, the escalation
sentence is finally readable in red on the row, the nurse's "See the pickups" toast steers the
driver page to the right vendor and rings the right rows, `?quiet=1` silences narration without
killing the pulses, and no role's nav can reach the retired vendor pages. Fix (a-2) before anyone
says "every delivery had a photo" out loud, decide (c-1) and (c-4) over coffee, and spend the
rehearsal budget on the script rather than the code — (b-1) through (b-8) are the only things
standing between this and a clean click-for-click run.**
