# Trip Batching & the Vendor-Side Question Gate — Design Spec

> **STATUS: SPEC'D, NOT BUILT.** Team decision (Angel, 2026-08-14 night): this is a design
> document only. Nothing in this file exists in code, and nothing in the demo depends on it.
> It exists because (a) the failure it fixes is real and visible today (§1), and (b) "what
> happens when a vendor has twenty of these?" is a judge question that deserves a designed
> answer, not an improvised one. In the pitch this is a production-path item, framed exactly
> like the IVR fork: *spec'd, cut on purpose.* FAQ §6 register throughout.

## 1 · The failure, observed

Seed a world where one vendor owes several pickups and open `/vendor-phone`: four near-identical
bubbles land in the same minute —

> *Pickup needed for order #2005 (Walker, folding wheeled), area Salt Lake City … Reply 1 if you
> can get it today, 2 to give us a window: `<link>`* — ×4, one per order, all at 5:58 PM.

Two distinct defects wearing one costume:

1. **The spam wall.** `setPatientStatus()` loops `sendToVendor(…, 'v_pickup_request')` once per
   order (`server/pickups.ts:30`), and the watchdog nags per order too. A dispatcher's eyes glaze
   by bubble two; "please schedule promptly" repeated four times reads as noise, and the channel
   trains its own audience to ignore it. This is the adoption-risk failure mode from the IVR
   brainstorm, reproduced in SMS.
2. **The reply ambiguity.** All four bubbles say "Reply 1" and all four carry the *same*
   vendor-level portal URL. Today the simulator dodges the ambiguity because every reply carries
   `reply_to_message_id` (`server/sms.ts:137-141`) — the UI knows which bubble you answered. **A
   real SMS gateway has no reply-to.** A bare "1" against four open `v_pickup_request` questions
   is a coin flip wearing confidence 1.0. The family side already has the fix —
   `householdGate()` (`server/messaging.ts:90`) enforces one open question per household — and the
   vendor side never got it.

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

### Tier 2 — one household, several items (the Ruth case)

All orders in the burst share a patient → **one message for the stop**. The batch is already
computed: `setPatientStatus()` returns `pickups_triggered: [1050, 1051]` in a single call.

> Pickup needed — **2 items from one home** (hospital bed, oxygen concentrator), area Ogden.
> Family is present — please schedule promptly. Reply 1 if you can get **both** today, 2 to give
> us a window: `<link>`

The digit means "yes to the whole stop" and fans out per order (§5). Demo language this buys:
*"one death, one text, one trip."*

### Tier 3 — multi-patient burst (the §1 screenshot)

Orders for 2+ patients (or ≥5 orders) in one window → **a digest, and the digits deliberately
retire**:

> **4 pickups waiting** — 3 in Ogden, 1 in Salt Lake City. Tap to see and schedule each one:
> `<portal link>`

No "reply 1": a digit against four questions is not an answer, and *"reply 1 = yes to all"* is
explicitly rejected (§9) — a bulk undifferentiated yes is exactly the vendor-reported mush the
evidence system exists to distrust. The portal already lists each open order with its SLA clock
and per-order Confirm / ETA / Can't-do buttons, so at this volume it extracts **more** per-order
truth than SMS structurally can. The digest is a visibility upgrade disguised as spam control:
it routes the vendor to the surface where per-order answers are cheapest.

**Coalescing window:** tier 2 needs none (same `setPatientStatus()` call = same message). Tier 3
uses the watchdog's 30s tick as the window — outbound pickup requests queue per vendor and flush
on tick, so "same burst" needs no new clock. Sub-minute latency on a message about a same-day
truck roll is free.

**Cross-intent rule:** never merge templates. A `v_order_request` and a `v_pickup_request` in the
same window stay separate messages — "reply 1" must never mean two verbs in one bubble. Nags
(`v_ack_nag`) are per order and stay so; whether a tier-3 digest should absorb pending nags for
the same vendor is an open question (§10).

## 4 · Inbound: the vendor-side question gate

Ported from `householdGate()`, independent of batching, and the piece that makes digits honest on
a real gateway:

> A digit reply auto-applies **only when exactly one open (unanswered) vendor question exists in
> that vendor's thread.** Two or more open questions → deterministic bounce, no model:
>
> *"You've got 3 open requests — tap here to answer each one: `<portal link>`"*

- The bounce is a `prompt`-kind route (the `v_eta_check` digit-2 pattern, `sms.ts:74`), records
  the inbound, answers nothing, and never guesses.
- Free text is ungated — prose already goes to Claude with the vendor's open orders as context
  and the 0.8 confidence gate underneath (`routeText()`, `sms.ts:288-301`). "The bed yes, the
  concentrator no" is expressible in prose and lands in review if the model isn't sure.
- The gate also covers cases batching can't prevent: a nag and a fresh order request overlapping
  in one thread.

## 5 · Reply semantics & provenance

A tier-2 group message keys one `REPLY_ROUTES` entry (e.g. `v_pickup_group`) whose digit-1 action
applies `pickup_scheduled` to **every order in the group**, each event stamped
`payload.source: 'group reply'` — rendering in the ledger as *"group reply · no model"* and on
the badge as **vendor-reported**. Same for digit-2's prompt. The family-side `f_pickup_notice`
side effect (`sms.ts:233-235`) fires once per household, not once per order — the household hears
about the visit, not the manifest.

**The digit speaks only for the whole trip.** Partial answers ("we can get the bed today, not the
concentrator") are not expressible in a digit by design — they go through the portal's per-order
buttons or through prose + the 0.8 gate. Bounce copy carries the hint: *"Tap here if it's not all
of them."*

**ETA anti-gaming rule survives batching:** the group digit-1 writes `eta: null` exactly as the
single `v_pickup_request` route does (`sms.ts:76-87`) — a vendor must not keep a whole trip
permanently not-overdue by texting 1 once a day. `pickupAnchor()` semantics unchanged.

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
5. **The confidence gate** — group digits are template×digit lookups at confidence 1.0 like every
   digit today; prose still goes through the 0.8 gate. No new model surface.

## 8 · Implementation sketch (for whoever builds it later)

- **Schema:** `messages.order_id` is single today (`sms.ts:153`). Group messages need
  `message_orders(message_id, order_id)` — a join table beats a JSON column because replies must
  fan out per order transactionally. Single-order messages keep `order_id` as-is; the join table
  is only written for groups.
- **Templates:** add `v_pickup_group` (tier 2) and `v_pickup_digest` (tier 3) to
  `MessageTemplate`, `VENDOR_BODY`, and `REPLY_ROUTES` (digest gets **no** digit routes — an
  unmapped digit already lands in review via the `unmapped` outcome, `sms.ts:210-211`; with the
  §4 gate it bounces instead).
- **Send path:** `setPatientStatus()` groups its own `pickups_triggered` per vendor before
  sending (tier 1 vs 2 falls out of group size); the watchdog accumulates per-vendor pickup
  requests and flushes on tick for tier 3.
- **Gate:** one `COUNT(*)` over unanswered outbound vendor questions in `routeDigit()` before the
  action dispatch; ≥2 → the bounce prompt. ~15 lines.
- **Tests** (the invariants that must be pinned): group digit-1 writes N `pickup_scheduled`
  events with group provenance; digest carries no digit routes; the gate bounces at 2+ open
  questions and stays out of the way at 1; `f_pickup_notice` fires once per household; eta stays
  null on group digit-1.
- Rough order: gate → tier 2 → tier 3 → driver stop view. First two are small; tier 3 adds the
  flush queue; the stop view is a real FE lift.

## 9 · Explicitly rejected

- **"Reply 1 = yes to all" on the tier-3 digest.** "All four, two cities, today" is rarely a true
  answer, and a wrong bulk yes writes four confident-looking lies onto the board. Visibility
  argues for fewer, truer signals — the portal gives four real answers for one tap each.
- **Per-order sender numbers** (thread-per-order). Real gateways make this cost-prohibitive and
  it destroys the one-thread-per-vendor mental model the phones are built on.
- **Marking digest orders "seen/acknowledged"** on link tap. Opening a list is not a commitment;
  inferring anything from it would be exactly the evidence inflation §7.3 forbids.

## 10 · Open questions (decide at build time, not now)

1. Should a tier-3 digest absorb pending `v_ack_nag`s for the same vendor into one "…and 2 orders
   still need a yes/no" line, or do nags stay separate messages? (Lean: absorb — same
   spam-wall logic — but the nag's per-template dedupe in the watchdog needs care.)
2. Digest refresh policy when the list changes materially (2 waiting → 6 waiting) before any
   portal visit: silent, or one "now 6 waiting" update per silence-ladder window?
3. Does the tier-2 group message get its own nag wording, or does the standard per-order nag
   ladder take over on the group's orders individually? (Lean: group nag, same fan-out rules.)

## Pitch integration

- **Q&A pocket** (do not volunteer): *"When a vendor has twenty of these, texts collapse into one
  digest and the portal becomes the workspace — but we batch the asking, never the answering:
  every order keeps its own confirmation, its own clock, and its own escalation, no matter how we
  packaged the text. Designed, not built this weekend — same status as the voice fork, and I'll
  say so."*
- If a judge notices the flooded thread on a phone sim, this spec is the answer, by name.
- Do **not** add this to the SLIDES show-off inbox — that list is for built things.
