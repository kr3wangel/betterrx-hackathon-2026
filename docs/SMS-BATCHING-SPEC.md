# Trip Batching & the Vendor-Side Question Gate — Design Spec

> **STATUS: TIER 2 (TRIP GROUPING) IS BUILT — 08-15. Everything else here is still design.**
> *(This line read SPEC'D, NOT BUILT when written; it has been overtaken twice — see both
> amendments below.)* The 08-14 team decision made this a design document only; the team approved
> the tier-2 build on 08-15 (§10) and it shipped. **In code today:** one grouped pickup question
> per multi-item stop, its per-order fan-out, and the §7 invariants pinned by tests. **Not in
> code:** the tier-3 burst trigger, `v_pickup_digest`, the group nag (§10.3), and the driver stop
> view (§6). Those stay production-path items, framed exactly like the IVR fork: *spec'd, cut on
> purpose.* FAQ §6 register throughout — the built half is strong enough that the unbuilt half
> does not need borrowing from.

> **Amended 08-14 late — rotating reply codes shipped (`ae91367`), and they change half of
> this document.** Each open vendor question now owns a digit **pair** — (1,2) (3,4) (5,6)
> (7,8) (9,0), odd is the affirmative — and prints that pair in its own body, so a question
> buried several texts back is still answerable. See `server/slots.ts` and the amendment at
> the top of `SMS-SIM-SPEC.md`. Three consequences for this spec, marked inline below:
>
> 1. **§1 defect 2 (reply ambiguity) is fixed**, by addressing rather than by gating. The
>    diagnosis was right and the reasoning still reads correctly; only the remedy differs.
> 2. **§4's gate must not be built as written** — it would delete the feature that shipped.
>    Rewritten in place; the part of it that survives is already in code.
> 3. **§3's tier 3 and the shipped `v_backlog_digest` are the same idea** with different
>    triggers. One of them has to win (§10.4).
>
> **§1 defect 1 — the spam wall — is untouched and still entirely real.** That is the part of
> this spec worth building, and tier 2 is still the best idea in it. Nothing below about
> trips, per-order invariants, or the driver stop view is affected.

> **Amended 08-15 — tier 2 shipped, and §1 defect 1 is closed for the pickup burst.**
> `setPatientStatus()` now groups its own `pickups_triggered` per vendor and sends **one**
> `v_pickup_group` question per multi-item stop instead of one per order (`server/pickups.ts`).
> The body is `pickupGroupText()` (`server/messaging.ts`) and links to the vendor portal; the
> manifest rides in `message_orders` (`server/db.ts`) written inside the message's own
> transaction; the anchor is the first order id on the message row. The affirmative position of
> `VENDOR_ROUTES.v_pickup_group` (`server/sms.ts`) fans `pickup_scheduled` out to every order on
> the manifest, each stamped `payload.source: 'group reply'` with `eta` null, and one
> `f_pickup_notice` goes to the household. Pinned by `tests/pickups.test.ts` (*trip batching*)
> and `tests/sms.test.ts` (*trip batching replies*). Read §3 tier 2, §5 and §8's send-path bullet
> as **built**; §3 tier 3, §6 and §10.3 as still designed.

## 1 · The failure, observed

Seed a world where one vendor owes several pickups and open `/vendor-phone`: four near-identical
bubbles land in the same minute. **As observed on 08-14, before `ae91367`:**

> *Pickup needed for order #2005 (Walker, folding wheeled), area Salt Lake City … Reply 1 if you
> can get it today, 2 to give us a window: `<link>`* — ×4, one per order, all at 5:58 PM.

Reproduce it today and you get four bubbles still, but reading "Reply 1", "Reply 3", "Reply 5",
"Reply 7" — which is precisely the split below: one defect fixed, one untouched.

Two distinct defects wearing one costume:

1. **The spam wall. FIXED for the pickup burst in the 08-15 tier-2 build; still true anywhere
   else a vendor accumulates questions.** As written: `setPatientStatus()` loops
   `sendVendorQuestion(…, 'v_pickup_request')` once per order (`server/pickups.ts:29-33`), and the
   watchdog nags per order too. A dispatcher's eyes glaze by bubble two; "please schedule
   promptly" repeated four times reads as noise, and the channel trains its own audience to
   ignore it. This is the adoption-risk failure mode from the IVR brainstorm, reproduced in SMS.

   Rotating codes made the four bubbles *distinguishable*, not *fewer*. Ruth's bed and
   concentrator still cost two texts and two of the vendor's five codes. Everything below stands —
   and tier 2 (§3) is what closed it: those two now cost **one** text and **one** code. A
   multi-patient burst still lands as one text per stop, which is the vendor's real unit; past
   five stops the shipped exhaustion digest takes over (§10.4).
2. **The reply ambiguity. FIXED in `ae91367`, by addressing rather than gating.** Recorded as
   written because the diagnosis was correct and the reasoning is what produced the fix.

   What was true: the simulator dodged the ambiguity because every reply carried
   `reply_to_message_id`, so the UI knew which bubble you answered, and **a real SMS gateway has
   no reply-to.** A bare "1" against four open `v_pickup_request` questions was a coin flip
   wearing confidence 1.0.

   What is true now: the four bubbles read "Reply 1", "Reply 3", "Reply 5", "Reply 7", each
   naming its own codes, and each carries its own **per-order** link (`/o/<token>`, shipped in
   `0dbb136`) rather than a shared vendor-level URL. `handleVendorInbound()`
   (`server/sms.ts:420`) resolves a bare digit by *ownership* — which unanswered question holds
   that pair — so the deterministic route table is reachable from a plain gateway payload with no
   reply-to at all.

   The family-side comparison in the original text still holds and is worth keeping: `householdGate()`
   (`server/messaging.ts:186`) enforces one open question per household. The vendor side did not
   get that rule, deliberately. A household thread carries one question because the household
   should only ever be asked one thing; a vendor thread carries five because a dispatcher has
   five jobs, and the answer was to make the five addressable rather than to serialise them.

## 2 · The organizing idea: the trip

The vendor's unit of work is not the order — it is **the trip** (one truck, one door, one time
window). Ruth dies with a bed and an oxygen concentrator in the house: that is one stop, and no
driver picks up the bed today and the concentrator Thursday. Our per-order messages make the
vendor translate our unit into theirs four times a day. Batching makes us speak trip on the
outbound — while the board keeps speaking order on the inbound.

**The invariant that makes it safe** (this line is the whole spec):

> **We batch the asking, never the answering. Commitments cascade down a trip; evidence never
> does.**

- A trip is atomic at the **planning** level: "yes, today" to a 2-item stop is one physical
  decision, so one group reply legitimately writes N per-order `pickup_scheduled` events. One tap
  from the vendor, N rows of visibility for the hospice.
- A trip is **not** atomic at the **outcome** level: the bed fits in the truck and the
  concentrator is missing, or contaminated, or the family kept it. Proof of delivery/pickup,
  signatures, and condition attestations are per item, always. The evidence ladder is untouched:
  a cascaded commitment renders **vendor-reported** (grey), and each item flips to **Verified**
  on its own POD or not at all.
- The mismatch case self-polices with machinery that already exists: "said yes to both, proof
  arrived for one" leaves the second order in `pickup_pending` with its own silence clock still
  running — un-acted-on items stay exactly as loud as before.

## 3 · Outbound: three message tiers

Tier selection happens at send time, from what is in the burst. PHI rules unchanged — no patient
names on the vendor channel, area granularity only (`SMS-SIM-SPEC.md §3.2`).

### Tier 1 — single order (today's behavior, kept)

One order in the burst → the existing per-order template, digits and all:

> Pickup needed for order #2005 (Walker), area Salt Lake City. Reply 1 if you can get it today,
> 2 to give us a window: `<link>`

Correct at this volume; the gate (§4) is the only change it inherits.

### Tier 2 — one household, several items (the Ruth case) — **BUILT 08-15**

All orders in the burst share a patient → **one message for the stop**. The batch is already
computed: `setPatientStatus()` returns `pickups_triggered: [1050, 1051]` in a single call.

Shipped exactly as specced. `setPatientStatus()` groups `delivered` orders per vendor
(`server/pickups.ts`); a stop of one keeps `v_pickup_request`, a stop of several sends one
`v_pickup_group` rendered by `pickupGroupText()` (`server/messaging.ts`). Real body, off a
scenario-2 smoke run:

> Pickup needed — **2 items from one home** (hospital bed, oxygen concentrator), area Ogden.
> Family is present — please schedule promptly. Reply 1 if you can get **both** today, 2 to give
> us a window: `http://localhost:5173/portal/<token>`

Two details the code settled that the draft left open: the items are the equipment names truncated
at the first comma and lower-cased ("hospital bed", not "Hospital bed, semi-electric"), and the
link is the **vendor portal**, not a per-order `/o/` link — a message about a stop has no single
order to point at. The "family is present" line survives here (it was cut from the single-order
`pickupRequestText()`), because on a multi-item stop it is the scheduling constraint, not colour.

The digit means "yes to the whole stop" and fans out per order (§5). Demo language this buys:
*"one death, one text, one trip."* Pinned by *asks once for a two-item stop, anchored on the first
order*, *names the count and every item, and no patient*, and *stays on the single template when
two vendors owe one item each* in `tests/pickups.test.ts`.

### Tier 3 — multi-patient burst (the §1 screenshot)

Orders for 2+ patients (or ≥5 orders) in one window → **a digest, and the digits deliberately
retire**:

> **4 pickups waiting** — 3 in Ogden, 1 in Salt Lake City. Tap to see and schedule each one:
> `<portal link>`

No digits at all, and *"reply 1 = yes to all"* is explicitly rejected (§9) — a bulk
undifferentiated yes is exactly the vendor-reported mush the evidence system exists to distrust.
Note the reason has narrowed since this was written: a digit against several open questions is no
longer *ambiguous* (each owns its own pair), so the case against a digest digit is now purely
about evidence quality, which is the stronger argument anyway. The digest carries no pair, and a
tier-3 digest is precisely the message sent when there are no pairs left to carry. The portal already lists each open order with its SLA clock
and per-order Confirm / ETA / Can't-do buttons, so at this volume it extracts **more** per-order
truth than SMS structurally can. The digest is a visibility upgrade disguised as spam control:
it routes the vendor to the surface where per-order answers are cheapest.

> **Partly shipped already.** `v_backlog_digest` (`server/messaging.ts:105`) is this message,
> reached from the other direction: it fires when a vendor's five reply pairs are all in use and
> a sixth question cannot be sent, rather than when a burst is large. It carries no digits, links
> to the portal, is rate-limited to one per vendor per 4h, and counts open orders from the same
> call the link lands on so the number in the text cannot contradict the page. Tier 3's *trigger*
> (burst size, 2+ patients or ≥5 orders) is the part that is not built. Reconcile before building
> — see §10.4.

**Coalescing window:** tier 2 needs none (same `setPatientStatus()` call = same message). Tier 3
uses the watchdog's 30s tick as the window — outbound pickup requests queue per vendor and flush
on tick, so "same burst" needs no new clock. Sub-minute latency on a message about a same-day
truck roll is free.

### How the tiers sit on top of reply pairs

They compose cleanly, and batching turns out to *raise* the ceiling rather than fight it:

| Tier | Pairs consumed | The digit means |
|---|---|---|
| 1 — single order | one | this order |
| 2 — one stop, N items | **one** | the whole trip (§5 already says this) |
| 3 — digest | none | nothing; there are no digits |

Tier 2 spending one pair for a stop rather than one per item is not a compromise, it is the same
claim §2 already makes: *one physical decision, one reply.* The practical effect is that the five
pairs stop counting orders and start counting **stops**, which is the vendor's actual unit of
work. Ruth's bed and concentrator take one code between them instead of two, and a vendor with
eight orders across four homes fits inside the code space with room to spare — so tier 2 also
pushes the tier-3 threshold further out, and the two changes are worth more together than apart.

**Cross-intent rule:** never merge templates. A `v_order_request` and a `v_pickup_request` in the
same window stay separate messages — "reply 1" must never mean two verbs in one bubble. Nags
(`v_ack_nag`) are per order and stay so; whether a tier-3 digest should absorb pending nags for
the same vendor is an open question (§10).

## 4 · Inbound: the vendor-side question gate — **SUPERSEDED, DO NOT BUILD AS WRITTEN**

The original rule was: *a digit auto-applies only when exactly one open vendor question exists;
two or more → deterministic bounce to the portal.*

**Building that now would delete the feature that shipped in `ae91367`.** Two or more open
questions is the case rotating codes exist to serve, and it is the common case: five questions
carrying five distinct pairs are not ambiguous, and bouncing a correctly-addressed digit would
send a vendor to a web page to answer something they had already answered correctly by text.

The instinct was right about *where* the danger is; it was aimed at a count when the real
question is ownership. The corrected rule, which is **already in code**:

> A digit auto-applies when **some unanswered question in that vendor's thread owns that pair.**
> A digit nothing owns is never applied to whatever is newest. If one or two questions are open
> we text back naming their codes; past that we send the portal link.

- Resolution is by ownership, not by count: `resolveDigit()` (`server/slots.ts:76`) walks the
  vendor's unanswered questions newest-first and returns the one holding the pair.
- The bounce survives, narrowed to unowned digits: `clarifyText()` (`server/messaging.ts:139`)
  produces *"That code doesn't match anything open. Reply 1 or 2 for #1042, 5 or 6 for #2204."*
  and past two open questions falls back to the portal link. The inbound is still recorded as
  `needs_review`, so the hospice sees it either way; the outcome is `clarify`.
- Free text stays ungated, exactly as originally specced — prose goes to Claude with the vendor's
  open orders as context, now plus a focus hint naming the newest unanswered question, under the
  same 0.8 gate (`routeText()`, `server/sms.ts:339`). "The bed yes, the concentrator no" is
  expressible in prose and lands in review if the model isn't sure.
- The overlapping-nag case the gate was partly aimed at is handled at the *send* side instead: a
  follow-up about an order we have already asked about reuses that order's pair rather than
  allocating a second one (`allocateSlot()`, `server/slots.ts:65`), so a nag and its original
  request are one question with one code.

**What genuinely remains open** is the ceiling, not the gate: there are five pairs, and a vendor
can have more than five open questions. That is what §3's tier 3 and the shipped digest are both
answers to, and it is the one place the two specs still have to be reconciled (§10.4).

## 5 · Reply semantics & provenance — **BUILT 08-15**

A tier-2 group message keys one `VENDOR_ROUTES` entry (`v_pickup_group`, `server/sms.ts`) whose
**affirmative position** applies `pickup_scheduled` to **every order in the group**, each event
stamped `payload.source: 'group reply'` — rendering in the ledger as *"group reply · no model"*
(`client/src/lib/domain.ts` `eventSourceNote()`) and on the badge as **vendor-reported**. The
problem position prompts *"When can you collect them? Text back a day and time."* and applies
nothing. The family-side `f_pickup_notice` side effect fires once per household, not once per
order — the household hears about the visit, not the manifest.

As built, the fan-out reads the manifest out of `message_orders` and falls back to the message's
own `order_id` when there is none, so a `v_pickup_group` fired by hand through `sendTemplate()`
still routes. Two behaviours the code had to decide and the draft did not:

- **Partial failure skips and records, never aborts.** An order whose state refuses the transition
  is left alone and named in the inbound row's notes (*"— not applied to #1051 (picked_up)"*).
  "Yes to both" when the bed was already collected is still a true answer about the concentrator,
  and throwing would discard it along with the pair. The reply resolves `applied` if anything
  applied, `needs_review` if nothing did.
- **The client says what happened.** The vendor phone labels the pair *"Yes — the whole stop"* /
  *"Give us a window"* (`client/src/components/QuickReplies.tsx`) and the delivery receipt reads
  *"applied to 2 orders · no model needed"* — the fan-out is visible to the person who caused it.

Pinned by *fans one digit out to every item, with group provenance and no eta*, *tells the
household once, not once per item, and retires one pair*, *skips an item whose state refuses the
transition and records it*, *leaves the evidence ladder exactly where it was*, *asks for one
window for the whole stop and applies nothing*, and *falls back to the anchor when the question
carries no manifest* (`tests/sms.test.ts`).

> Note the table is now indexed by **position, not digit**: `REPLY_ROUTES` split into
> `VENDOR_ROUTES` (a `[affirmative, problem]` tuple per template, because vendor digits rotate)
> and `FAMILY_ROUTES` (literal digits, unchanged). A group entry is a tuple like any other. The
> group message owns one pair, so "reply 5 for the whole stop, 6 to give us a window" is what the
> body says, and `routeDigit()` resolves 5 to offset 0 exactly as it does for a single order —
> the fan-out is in the action, not in the addressing.

**The digit speaks only for the whole trip.** Partial answers ("we can get the bed today, not the
concentrator") are not expressible in a digit by design — they go through the portal's per-order
buttons or through prose + the 0.8 gate. Bounce copy carries the hint: *"Tap here if it's not all
of them."*

**ETA anti-gaming rule survives batching:** the group affirmative writes `eta: null` exactly as
the single `v_pickup_request` route does (`VENDOR_ROUTES.v_pickup_request` in `server/sms.ts`) —
a vendor must not keep a whole trip permanently not-overdue by answering yes once a day.
`pickupAnchor()` semantics unchanged. This matters more under batching, not less: one gamed digit
would now hold N orders out of overdue instead of one.

## 6 · The driver's stop view (same concept, other end of the truck)

Drivers care about **everything going to or from the house** — deliveries included, not just
pickups. Specced end-state for `/driver`:

- Jobs group into **stop cards**: one card per (patient household × direction), listing every
  item on the manifest. "2 items → Nakamura residence, Ogden · pickup" instead of two cards the
  driver must mentally re-join.
- One trip-level flow, per-item evidence: **one signature per stop** (the person at the door
  signs once for the visit), but **per-item condition attestation and per-item completion** —
  each order's POD row and `delivered`/`picked_up` event stands alone, so a one-of-two outcome is
  recordable in place ("bed collected; concentrator not on site → flag"), which today requires
  abandoning a job card mid-flow.
- The grieving-household guidance ("call ahead, be brief and kind") renders once per stop, where
  it reads as instruction rather than boilerplate.

**Not built for the hackathon** — it touches the POD flow days before freeze, and scenario 2
demos cleanly on the two existing per-order cards. The two-card flow also under-claims rather
than over-claims (more taps for the driver, same evidence), which is the safe side to be wrong on.

## 7 · What batching must not touch

Stated as invariants so a future implementer can't trade them away:

1. **Per-order state, events, and ledgers** — no group rows in `orders` or `order_events`, ever.
   A trip is a messaging concept, not a domain entity; there is no `trips` table.
2. **Per-order silence clocks and escalations** — the ladder reads order age and per-order
   response state, and a digest neither acknowledges nor resets anything. Sending one message
   about four orders must leave four independently escalatable orders.
3. **The evidence ladder** — group replies cap at vendor-reported. Nothing batched can ever
   produce `delivery_verified` / a POD row / `family_confirmed`.
4. **PHI discipline** — batch bodies name counts, items, and areas; never patients. "2 items from
   one home" identifies no one.
5. **The confidence gate** — group digits are template×position lookups at confidence 1.0 like
   every digit today; prose still goes through the 0.8 gate. No new model surface.
6. **One pair per question, and a pair is never recycled while its question is open.** Batching
   changes how many orders sit behind a question; it must not change how many codes a question
   holds. A group that allocated one pair per item would spend the vendor's whole code space on a
   single stop and put several live digits on one decision — the same defect the ack-nag reuse
   rule exists to prevent (`server/slots.ts`).

## 8 · Implementation sketch (for whoever builds it later)

- **Schema:** `messages.order_id` is single today. Group messages need
  `message_orders(message_id, order_id)` — a join table beats a JSON column because replies must
  fan out per order transactionally. Single-order messages keep `order_id` as-is; the join table
  is only written for groups. `messages.reply_slot` already exists and needs no change: a group
  message owns one pair like any other question.
- **Templates:** add `v_pickup_group` (tier 2) and, if tier 3 survives §10.4, `v_pickup_digest` to
  `VendorTemplate`, `VENDOR_BODY`, and `VENDOR_ROUTES`. The digest gets **no** entry — it is
  informational, exactly like the shipped `v_backlog_digest`, and the route-table integrity test
  in `tests/sms.test.ts` already asserts that digests never appear in the route tables.
- **Bodies take their digits:** every question template now renders from the pair it was allocated
  (`orderRequestText(order, area, digits)` and friends), and the group body must do the same —
  "reply 5 for the whole stop, 6 to give us a window". There is deliberately no default pair; a
  template that hardcodes 1/2 is a bug the type checker will catch.
- **Send path:** `setPatientStatus()` groups its own `pickups_triggered` per vendor before sending
  (tier 1 vs 2 falls out of group size), and calls `sendVendorQuestion()` once for the group
  rather than once per order — that one call is what collapses N pairs into one. The watchdog
  accumulates per-vendor pickup requests and flushes on tick for tier 3.
- **~~Gate~~ — do not build.** See §4. Ownership already does this work, and a `COUNT(*)` bounce
  at 2+ open questions would break correctly-addressed replies. If you are reading this section
  looking for the ~15-line change, the 15 lines are already in `server/slots.ts`.
- **Tests** (the invariants that must be pinned): the group affirmative writes N
  `pickup_scheduled` events with group provenance; a group message consumes exactly one pair; the
  digest carries no digit routes; `f_pickup_notice` fires once per household; eta stays null on
  the group affirmative; and a digit owned by a group applies to every order in it and to nothing
  outside it.
- Rough order: tier 2 → reconcile the digests (§10.4) → tier 3 trigger → driver stop view. Tier 2
  is now the small one and carries most of the value; the stop view is a real FE lift.

## 9 · Explicitly rejected

- **"Reply 1 = yes to all" on the tier-3 digest.** "All four, two cities, today" is rarely a true
  answer, and a wrong bulk yes writes four confident-looking lies onto the board. Visibility
  argues for fewer, truer signals — the portal gives four real answers for one tap each.
- **Per-order sender numbers** (thread-per-order). Real gateways make this cost-prohibitive and
  it destroys the one-thread-per-vendor mental model the phones are built on. *Independently
  reached and rejected during the rotating-codes work for the same reasons, plus one more: a
  number pool does not survive a vendor with thirty open orders, which is exactly the volume
  where you need it. Worth saying on stage — it shows we know the medium — but as the thing we
  chose against, not the thing we are missing.*
- **Marking digest orders "seen/acknowledged"** on link tap. Opening a list is not a commitment;
  inferring anything from it would be exactly the evidence inflation §7.3 forbids.

## 10 · Open questions — RESOLVED at build time (team approved the build 08-15; decisions below)

> **Build decisions (Angel + team, 08-15, recorded in `docs/SMS-BATCHING-PLAN.md`):**
> **§10.4 → no burst trigger, no `v_pickup_digest`.** Tier 2 makes the five pairs count *stops*,
> and the shipped exhaustion digest already fires whenever a burst outruns the pairs — each
> refused `sendVendorQuestion()` attempts it, under the existing 4h rate limit. Exhaustion
> subsumes burst; one digest, one body, one rate limit, no race.
> **§10.1 → moot for pickups** (the ack-nag ladder targets `ordered`; pickup accountability is
> the per-order `pickup_overdue` clock, untouched). **§10.2 → silent** (the rate limit is the
> refresh policy). **§10.5 → no** (cross-intent rule stands). Group link = the vendor portal
> link. Group anchor = first order id on the message row; `message_orders` carries the manifest.
> Partial failure: skip-and-record, never abort the trip. Driver stop view (§6) stays unbuilt.

1. Should a tier-3 digest absorb pending `v_ack_nag`s for the same vendor into one "…and 2 orders
   still need a yes/no" line, or do nags stay separate messages? (Lean: absorb — same
   spam-wall logic — but the nag's per-template dedupe in the watchdog needs care.)
2. Digest refresh policy when the list changes materially (2 waiting → 6 waiting) before any
   portal visit: silent, or one "now 6 waiting" update per silence-ladder window?
3. Does the tier-2 group message get its own nag wording, or does the standard per-order nag
   ladder take over on the group's orders individually? (Lean: group nag, same fan-out rules —
   and note the pair-reuse rule makes this nearly free, since a group nag would reuse the group's
   own pair the way an ack-nag reuses its order's.)
4. **Reconcile tier 3 with the shipped `v_backlog_digest`.** They are one message with two
   triggers: burst size (this spec) versus reply pairs exhausted (built). Burst size catches a
   flood the moment it is sent; exhaustion catches a backlog however it accumulated, including
   slowly. They are not mutually exclusive and the honest answer is probably "fire on either,
   share one body and one rate limit" — but two digests racing each other in a thread is exactly
   the spam wall this spec opposes, so it needs deciding rather than assuming. Whichever wins
   should keep the shipped behaviour of counting open orders from the same call the link lands on.
5. Does tier 2 group across *directions*? A household with a delivery arriving and a pickup owed
   is one address but two errands, and §3's cross-intent rule says never merge templates. (Lean:
   no — that rule is right, and the driver stop view (§6) is where the two are rejoined.)

## Pitch integration

- **Q&A pocket** (do not volunteer): *"When a vendor has twenty of these, the asking collapses —
  one text per stop, and past five stops one digest and the portal becomes the workspace. But we
  batch the asking, never the answering: every order keeps its own confirmation, its own clock,
  and its own escalation, no matter how we packaged the text. Both of those are built. What's
  designed and not built is the driver's stop view at the other end of the truck — same status as
  the voice fork, and I'll say so."*
- **Split the claim carefully now that most of this shipped.** Built: rotating reply codes, the
  unowned-digit bounce, the backlog digest, and **trip grouping (tiers 1–2) with its per-order
  fan-out**. Designed only: the burst-size trigger (deliberately dropped — §10.4), the group nag
  (§10.3), and **the driver stop view (§6)**. That last one is the line to guard: claiming a
  grouped stop card on `/driver` would be exactly the manufactured precision FAQ §6 penalises, and
  scenario 2 still shows two per-order PICK UP cards.
- If a judge notices a flooded thread on a phone sim, this spec is the answer, by name — and the
  honest version of that answer is now "a stop is one text and one code; a vendor's five codes
  count stops, not items; past that, one digest and the portal."
- The SLIDES show-off inbox is for built things. Trip grouping earned its line there on 08-15;
  the driver stop view has not.
