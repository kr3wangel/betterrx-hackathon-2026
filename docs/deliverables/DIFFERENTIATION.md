# Deliverable C — Differentiation Snapshot

*Assumptions this document relies on: see [ASSUMPTIONS.md](ASSUMPTIONS.md).*

## Today: phone, fax, and one login per vendor

The hospice is accountable for two moments it cannot observe, because a separate DME vendor executes
both: equipment in place before a discharge home, and equipment out of the house after a death.
Coordination runs on phone calls, faxes, and vendor-specific portals — one login per vendor, built
for the vendor's operations, not the hospice's discharge. Status lives inside the vendor's four
walls. Nobody is watching the clock but the case manager, and she is watching it by calling.

The load-bearing failure is that **silence is ambiguous**. A vendor who hasn't called back might be
loading the truck or might have lost the fax, and there is no way to tell without dialing. So the
hospice finds out an order slipped when the family calls, and it absorbs the blame — family
experience, CAHPS — for a failure it literally could not watch happen.

## The baseline every team will show

The sponsor FAQ (§3) told all of us the same thing: *"design for a vendor who may never log into
anything and only ever responds via a confirmation email or text (SMS/magic-link style) as the
baseline."*

So the demo where an order goes out as a text and the vendor taps a link to confirm is **table
stakes as of that document** — every team read it, every team will show it. We built it (per-vendor
token, no login, one tap to Confirm / set ETA / Can't fill it), and we do not claim it as
differentiation. It is the floor. Everything below is what we put above the floor.

## Above the line

| The phone-and-fax world | The baseline link everyone will show | What we built on top |
|---|---|---|
| Case manager calls to ask | Vendor *can* confirm | **Silence ladder** — nobody has to ask. Unanswered at 2h the system nags; 2h later it escalates |
| "It's delivered" on voicemail | A tap that says delivered | **Verified vs vendor-reported** — every status badged by evidence; unproven claims escalate |
| Family calls about the bed | Nothing — the link only covers what the hospice already knew to ask | **Nurse-primary pickup trigger**, EMR webhook as the redundant fallback |
| Someone interprets a voicemail | Model parses free text | **Two input paths, two trust levels** — a tap needs no model; free text is confidence-gated to a human queue |
| Failure found at the front door | The link tells you it's late | **Rules-based risk fires before the deadline**, in sentences, with a one-click vendor swap |
| Whoever is on shift | One link, one order | **Three personas, one ledger** — ordering nurse, case worker, directing nurse |

### 1. The silence ladder — silence is signal from hour one

An order placed and not acknowledged is the most common failure in this problem, and today it looks
exactly like an order going fine. In our system it doesn't. A 30-second watchdog walks every open
order: unconfirmed two hours after placement, the vendor gets an automated check-in with the tap
link; two hours after that with still no answer, an escalation lands on the case worker's board
naming the hours — *"No response to the automated check-in — order #14 is still unconfirmed 6h after
placement."* The nag fires once, never repeats, never fires at a vendor who already accepted, and
resets its clock when an order is swapped to a new vendor. Both thresholds are config
(`ACK_NAG_HOURS`, `ACK_ESCALATE_HOURS`).

The point is not the nag. The point is that **the software does the chasing, so the case manager
never polls and the vendor is never punished for being busy** — and non-response, which was
ambiguity in the phone world, becomes a timestamped event with an owner. An untapped link is
silence exactly like an unanswered voicemail; the difference is who notices.

### 2. Verified vs vendor-reported — the board shows promises and proofs separately

A dispatcher can type "delivered" to get you off the phone, the same way he can say it into
voicemail. We don't pretend a vendor's word is truth just because it arrived digitally. Every order carries two proof flags computed from the
proof-of-delivery record — a driver's photo and signature, captured on a phone at the door — and
the board badges accordingly: **✓ Verified** where there is a POD, **Vendor-reported** where there
is only a claim, and in-flight states are marked vendor-reported on their face.

The teeth: a delivery or pickup that arrives as a vendor *claim* with no proof behind it opens an
escalation in plain language — *"marked delivered by the vendor without proof of delivery — confirm
with the family or request a POD."* A driver POD opens nothing. Same state on the board, different
evidence, different consequence. The claim still lands in an append-only ledger that records who
said it and through which channel, so a vendor's record gets more truthful the longer they
participate. Today that claim is a voicemail with no badge and no ledger.

### 3. Pickup: the nurse in the room is the trigger, the EMR is the backup

Their own discovery has a death that never reached the vendor's system in time, which is why the FAQ
(§8) calls the nurse-in-the-home the preferred primary signal. Both paths run through **one function**
— the nurse route and the EMR webhook differ only in who is recorded as the actor and what source is
stamped on the event. Either one flips every delivered order for that patient into pickup, texts the
vendor a pickup request, and starts a 24-hour clock; past the window the order goes overdue and
escalates — *"family is still waiting."*

Nothing in the SMS-baseline story reaches this moment at all, because the baseline only carries
requests the hospice already knew to make. This is the reverse direction: the hospice's own event
triggering the vendor's work, with nobody in a grieving house dialing anyone.

### 4. Two input paths, two trust levels — the tap needs no model

A tap on the magic link is a **deterministic** event: no parse, no confidence score, no model in the
loop, actor recorded as the vendor. That is the demo path, and it is the right engineering answer
for a status field that drives escalations.

The Claude parse is the production path for the vendors who won't tap — the ones who text back
*"yes, bed will be there thursday by 10am."* It runs against that vendor's open orders as context,
returns schema-constrained JSON, and only auto-applies at **confidence ≥ 0.8 with a resolved
order**; everything else lands in a review queue on the hospice board with the parse shown for a
human to confirm or dismiss. With no API key configured the whole pipeline degrades *to the queue*
rather than guessing. AI where ambiguity is real, determinism where it isn't — and a human gate
between the model and any state change it isn't sure about.

### 5. Risk that fires before the deadline, in sentences

Scoring is deliberately rules-based, not ML: this vendor's on-time rate for **this equipment on this
weekday**, their average delivery hours against the hours actually remaining, unacknowledged orders
near a deadline, and an ETA that lands after the deadline. It produces human sentences — *"vendor is
62% on-time for Hospital bed, semi-electric on this weekday (n=40)"* — not a black-box number, and a case manager
can argue with it. Crossing the threshold escalates itself, with a one-click vendor swap that
re-sends the order and clears the flag. Risk is a flag, never a state, so nothing hides behind it.
Deadlines exist by default too (same-day for STAT/urgent, 24h routine, configurable — FAQ §7), so an
order can't quietly have no clock.

Inference-only designs — infer status from delivery and EMR events, no vendor input — are a
legitimate path the FAQ names, and we use event inference as our *verification* layer. But inference
cannot see intent before the deadline: there is no event to infer "accepted" or "on schedule for
tomorrow" from until the truck arrives or doesn't. That's learning about failure at the same moment
the fax world does.

### 6. Three personas, one system

The briefing named three hospice users and we built for all three rather than one dashboard:
the **ordering nurse** (places the order in the field, triggers pickup from the home), the **case
worker** (the lifecycle board, risk flags, escalations, review queue, vendor swaps), the **directing
nurse** (oversight — vendor scorecards, open escalations, pickup latency). One append-only event
ledger serves all three because every event carries its actor and its source; the directing nurse's
scorecards are the risk engine's own raw material, no new data collection.

### Stated honestly — what is running vs. what is designed

Running and test-covered today: the silence ladder, the verified/vendor-reported flags and their
escalations, the shared nurse/EMR pickup trigger, the magic-link tap path, the confidence-gated
parse and review queue, the risk engine and SLA defaults. **In progress:** the ordering nurse's
mobile pickup surface (the route and its logic are built and tested; the one-tap screen is not yet
on the board) and the directing-nurse reports view. **Production path, spec'd not built:** the voice
channel — an automated check-in call with press-1 confirm, because half a hospice's vendor rolodex
is office landlines that cannot receive SMS at all. Vendor timing data in the demo is **synthetic
and labeled synthetic**; vendor operational reality is an assumption we state, not one we validated
(FAQ §1).

## The measure: phone calls that never happened

Every mechanism above maps to a call a human didn't have to make.

| The call | What replaced it |
|---|---|
| "Did you get my fax? Are you coming?" | The check-in the system sent at hour two |
| "Where is it? Is it on the truck?" | The board, live, both sides looking at the same order |
| "It says delivered but there's no bed here" | The unproven-claim escalation, before the family notices |
| The widow calling about the bed in the living room | The nurse's tap before she left the house |
| "How is this vendor actually doing?" | Per-vendor × equipment × weekday history the ledger already holds |

For the hospice: discharges stop being hostage to vendor opacity, pickup delays get a clock and an
owner, and vendor choice becomes evidence-based. For the vendor: orders arrive structured instead of
as voicemails, proof of delivery protects them in billing disputes, and they're judged on measured
performance rather than the last bad anecdote — with nothing to log into.

And the real measure is the one nobody sees. The saved discharge looks, to the daughter, like
nothing happening. The bed is gone by evening without anyone in that house making a call.
**If we build this right, the family never knows the system exists.**
