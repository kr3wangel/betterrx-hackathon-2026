# The Pitch — draft 0

*The complete 5:00, word for word, as one continuous read. This is the rehearsal document: the
thing you say, in order, with the clicks folded in as stage directions. Sources:
[deliverables/SLIDES.md](deliverables/SLIDES.md) (the deck frames this),
[deliverables/DEMO-SCRIPT.md](deliverables/DEMO-SCRIPT.md) (every click below is verified there —
if this draft and the demo script disagree about what's on screen, the demo script wins).*

**Conventions in this draft**

- `▶` = a click or tab switch. Everything else is spoken.
- `[SEED]` = a number you read off that morning's `npm run seed` print — never off this page.
- `[SCREEN]` = a sentence you read verbatim off the screen, not from memory.
- **Bold lines** are the ones that must survive any cut — they carry the rubric rows.
- Product name: `APP_NAME` is still "BetterRX DME" pending Angel's decision. The pitch says
  "we built" / "the system" throughout, so the name only has to exist on slide 1 and the landing
  page. One decision, two artifacts.

**Timing rail** (targets, not handcuffs — the 0:30 slack at the end absorbs drift):

| 0:00 | 0:25 | 0:45 | 1:45 | 2:40 | 4:10 | 4:25 | 4:40 | 5:00 |
|---|---|---|---|---|---|---|---|---|
| open | problem | S1 | S2 | S3 | reports | close | done | slack |

*(S2 went 0:45 → 0:55 on 08-15 to put the vendor's reply on stage; the ten seconds came out of the
end slack, which is now 0:20. Everything from S3 on shifts ten seconds later.)*

---

## 0:00 — Cold open (laptop closed, look at the room)

> Margaret Osei is 71. Tomorrow morning she is coming home from the hospital to die at home,
> because that is what she asked for — and what her hospice promised her family. That promise
> only works if a hospital bed is in her living room tonight. The hospice does not own that bed.
> They don't employ the driver. They cannot see the truck. But they will get the phone call from
> her daughter either way.

*(Wording is deliberately the always-true version — "tomorrow morning / tonight" — so it works on
any demo date. If the demo lands on a Thursday, the original "Friday morning / Thursday night" is
also safe.)*

## 0:25 — The problem and the frame

> There are two moments a hospice is accountable for and cannot watch: equipment in place before a
> discharge home, and equipment out of the house after a death. Today that runs on phone, fax, and
> vendor portals — and your own discovery found someone dying without the vendor ever finding out.
> You called this *taking care of these patients*. That's the register we built in.
>
> Every solution to this problem dies on the same question: **what does the vendor have to do?**
> **Our answer: tap a link.** No account, no app, no password. And everything we'll show you sits
> on one honest spine: every status change goes through one state machine into an append-only
> ledger that records who said it, through which channel, with what evidence.

▶ *Open tab 1 — the board.*

## 0:45 — Scenario 1: the case worker's save (1:00)

*(Seeded ~40s before you started speaking; tab 1 hard-refreshed.)*

> This is the case manager's whole world: what needs a person, what's moving, what's done.
> One row needs a person right now — Margaret's bed.

▶ *Click the Margaret Osei row open.*

> Nobody called anyone to learn this. The risk here is rules, not a model — every reason is a
> sentence a case manager can argue with. [SCREEN — read the strongest risk reason aloud, verbatim.]
> The vendor's own on-time history for this equipment, on this weekday, says this bed is in danger.

▶ *Click `Swap vendor` → pick the vendor the seed print named.*

> One action. The order re-issues to the vendor who runs [SEED]% on-time for hospital beds on this
> deadline's weekday, the text goes out on its own —

*(gesture as the row leaves "Needs you" by itself)*

> — and it clears itself. Nobody marks anything resolved.

▶ *Tab 7, the vendor's phone → pick the new vendor. Point at the text.*

> That is the entire vendor onboarding. A text, with a link.

▶ *Click the link → portal opens → tap Confirm → close the tab.*

> No login. One tap. Confidence 1.0 — there is no model in the path of a vendor telling us yes.

▶ *Tab 2, driver → switch picker to the new vendor → Start delivery → Complete delivery → sign →
Confirm delivery. Back to tab 1 as the badge flips.*

> **"Delivered" isn't a claim here. It's a photo, a signature, and a timestamp — the badge says
> *Verified*, not vendor-reported. Margaret's bed is in the house tonight.**

## 1:45 — Scenario 2: the nurse in the home (0:55)

*(Reseed scenario2; hard-refresh tabs 1 and 3.)*

> The second moment happens on the worst week of a family's life.

▶ *Tab 3 → Ruth Nakamura → "Passed away" → "Confirm, with care".*

> The nurse is standing in the living room. She taps this once. That's the whole trigger — your FAQ
> asked for the nurse as primary and the EMR as fallback, and that is exactly how it's built: both
> paths call the same function, and the ledger shows which one fired first.

▶ *Tab 1 — no click. Ruth's two orders appear as one pickup row.*

> Two pickups scheduled. Zero phone calls made by anyone in that house. And the vendor got one
> text, not two — a bed and a concentrator in the same living room is one truck at one door.

▶ *Tab 7 → Wasatch → type the affirmative digit the text names ([SCREEN] — read it off the bubble,
the pairs rotate) → the receipt lands. Glance at tab 1.*

> **One digit from the vendor, and both pickups are committed — the trip is the unit, and no model
> touched it.** [SCREEN — the texted receipt: *"Got your "N" — both pickups are on the books for today."*] **One death. One text. One
> trip. One digit.**

▶ *Tab 2, driver — two PICK UP cards.*

> The dispatcher sees logistics — "call ahead, be brief and kind." Never the death.

▶ *Complete pickup → sign → Confirm pickup. Point at the coral panel.*

> This is the actual sentence the family received: [SCREEN — read it]. **Ruth's family made zero
> phone calls. That's the product.**

## 2:30 — Scenario 3: the cold-start vendor (1:30 — the climax)

*(Reseed scenario3 as you start this beat; hard-refresh tab 1. The silence clock is now running.)*

> Now the part your FAQ made table stakes — and what we built above it. Two orders, two vendors.
> The first has never heard of us. No contract, no account, no software. The hospice typed their
> phone number in from its own rolodex.

▶ *Tab 7 → Timpanogos → point at the one outbound text.*

> This is everything we send them.

▶ *Click the magic link → the portal, one order → tap Confirm → close. Tab 1: pill flips live.*

> One tap, and the hospice board just changed before his thumb left the screen. The portal isn't
> something vendors adopt. **It's what's already waiting behind the link we sent them.**
>
> But the second vendor — nobody tapped.

▶ *Tab 7 → Beehive. The nag is in the thread (or arrives on the next tick — narrate, never wait).*

> So the software nagged them. The case manager didn't.

▶ *Tab 1 — Eleanor's row jumps into "Needs you" on its own.*

> **In the phone world, silence is ambiguous — did the fax go through? Here, silence is a reading.
> An untapped link is exactly as loud as an unanswered text, and it reaches a human before the
> deadline does — not after.**

▶ *Click the row open — the escalation sentence and the nag, on the record with a clock.*

> [SCREEN — the escalation reason.] And the case manager's next move is already sitting on the
> row — the same one-click swap you watched save Margaret.
>
> One more thing, because everything I've shown you so far still comes from the vendor. When a
> driver delivers, the system texts the **family caregiver** one question: is it clean and working,
> 1 to 5. A one or a two escalates immediately, and every score lands on that vendor's scorecard.
> Condition surveys aren't new — suppliers already run them on themselves for accreditation.
> **What's new is who owns the answers.** The household is the only party who ever sees what
> actually came off the truck, and today nobody asks them.

## 4:00 — The reporting beat (0:15)

▶ *Tab 4 → /reports.*

> The third hospice user never opens the board. This is the Director of Nursing's screen — vendor
> scorecards from the same data the risk engine reads, so it cost nothing. And the number we
> actually care about: **every status this system captured without a human picking up a phone —
> computed from the event ledger of a simulated year, and labeled synthetic, because it is.**

## 4:15 — Close (0:15 — step away from the laptop)

> Every mechanism you just watched maps to one phone call a human never had to make. Margaret's
> bed was in the house before she was. Ruth's family woke up and the hospital bed was already
> gone — and nobody in that house ever knew any of this existed. **The measure we built for is
> phone calls that never happened. And the vendor's entire cost of entry was tapping one link.**

---

## What this draft deliberately does NOT say (Q&A pocket, don't volunteer)

| If a judge asks… | The pocket answer |
|---|---|
| "Where's the AI?" | Exactly one place: reading a vendor's free-text reply — which order, and when is "Thursday morning." Haiku 4.5, ~620 in / ~50 out tokens, ~$0.003–0.006 per order, measured. Auto-applies only at confidence ≥ 0.8 with a resolved order; everything else lands in a human review queue. No API key at all → it degrades *to the queue*, not to guessing. Risk scoring is deliberately rules — a score has to be a sentence a case manager can argue with. |
| "What about vendors on landlines?" | Half a rolodex is office landlines, which can't receive a text. The ladder's first rung is channel-agnostic: carrier lookup routes to SMS or a 30-second check-in call where pressing 1 is deterministic. Spec'd (`docs/IVR-SIM-SPEC.md`), not built this weekend — production path, said plainly. |
| "What happens when a vendor has twenty of these?" | The asking collapses; the answering never does. **Built:** a stop is one text and one reply code, not one per item — so a vendor's five live codes count *stops*, which is their actual unit of work — and once those five are spent, one rate-limited digest points at the portal instead of a sixth text. **Also built:** the fan-out underneath. One digit against a two-item stop writes two per-order commitments, and every order keeps its own confirmation, its own clock, its own escalation, and its own proof — there is no group row anywhere in the ledger. *We batch the asking, never the answering.* What's designed and **not** built is the driver's grouped stop view at the other end of the truck — `docs/SMS-BATCHING-SPEC.md` §6, same status as the voice fork, and I'll say so. |
| "How does this integrate with BetterRX?" | A DME order rides the pipe medications already ride: sibling of `newMedications`, same envelope, HCPCS where meds carry NDC; patient status from your eRx ADT events as the fallback behind the nurse. The built-vs-sketched table in `deliverables/INTEGRATION-SKETCH.md` lets you check every claim. |
| "Who pays?" | Your §5: the hospice, per-patient-day, bundled with the pharmacy PPD they already pay. We quote you rather than model it. |
| "Is this data real?" | No — synthetic, generated, and labeled synthetic on every surface it appears. CMS DMEPOS grounds utilization and cost; it's billing data, not logistics, so we drew no timeliness conclusions from it. Your §6 asked for honesty over manufactured precision. |
| "What happens after this weekend?" | It was built to be picked up: state machine, risk engine, and the parse gate are test-covered (224 tests, re-counted 08-15), every assumption is in a register with what breaks if it's wrong, and the simulator seams (EMR feed, channel, inventory) swap transport, not architecture. |

## Cut order (if behind at 3:00)

1. Scenario 1's delivery leg — stop after the vendor confirms ("and the driver flow you'll see in
   scenario 2 closes it with a signature").
2. The reporting beat — fold its one number into the close.
3. The condition-check beat shrinks to one sentence.
4. **Never cut:** the cold open, scenario 3's silence (5b), the close.

## Known gaps in draft 0 (for draft 1)

- **The name.** Slide 1 and the landing page need `APP_NAME` decided; the spoken script survives
  without it.
- **Narration layer.** If wave 2 ships, scenario 3 gains the projector toast ("Beehive accepted…")
  and beats 5a/6 get easier to narrate — draft 1 should decide whether the presenter acknowledges
  the toasts or lets them speak. Rehearse `?quiet=1` both ways.
- **Timings are inherited, not measured.** The two timed rehearsals will re-cut this; expect
  scenario 3 to run long and the cut order to matter.
- The condition-check beat currently sits inside scenario 3's time box. If rehearsal shows it
  crowding the silence climax, move it to the reporting beat ("and this column is the family's
  answers").
