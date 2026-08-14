# Problem Thesis — why the system is shaped this way

The reasoning behind the build. Read this before touching scope or pitch content.

## North star — the register everything ships in

The two failure moments in this problem are the two most human moments in hospice care. Write every
patient-adjacent word — pitch, UI copy, demo data, message templates — in that register.

- **Delivery before discharge is not SLA compliance.** It's a patient with days left spending one of
  them stuck in a hospital because the bed isn't home yet. The hospice promised this family a death
  at home; whether that promise is kept is sitting in a vendor's truck the hospice can't see.
- **Pickup after death is not asset recovery.** It's a family grieving in a living room dominated by
  a hospital bed — every day it stays, the death stays physically present in the house. And today,
  the person chasing that pickup is often the widow. *Nobody in a grieving house should have to
  chase a truck.*

**The system's emotional claim is provable: the family never knows it exists.** Every mechanism maps
to a phone call a human never had to make. Silence-as-signal means the nurse finds out Tuesday
evening — so the family never finds out at all; the saved discharge looks, to the daughter, like
nothing happening, which is the point. The EMR-triggered pickup means the bed is gone by evening
without the widow calling anyone. **The measure of this system is phone calls that never happened.**
Cold version (deliverables): coordination overhead removed. Warm version (the room): a nurse never
again saying "I don't know" to a family on the worst week of their lives.

What this means on build day:

- **Pitch arc:** open on the patient (Margaret is coming home Friday morning to die at home — that
  only works if a bed arrives Thursday), mechanism in the middle, close on the family (zero phone
  calls; the bed was gone by evening). Heart is the bread, mechanism is the meat — never the
  reverse. An emotional *middle* reads as manipulation; an emotional *frame* reads as purpose.
- **Scenario 2's closing line:** "Ruth's family made zero phone calls. That's the product."
- **Copy tone:** the respectful-tone pass already planned for scenario 2 extends to *everything*
  family-adjacent — the family-notified message, pickup call scripts (dispatchers hear logistics,
  never the death), demo patient names and details that read like real people.
- **Their words beat ours:** capture verbatim emotional language from BetterRX's own briefing
  ("taking care of these patients") and quote it back in the pitch. Proving we heard them today
  outranks any line we could write.

**Second north star — the user (verbatim from the briefing): "think of your mom's least technical
friend, that's who you are designing for."** The hospice-side users are case managers and nurses,
not operators of software. Combined with the FAQ's "judging weight sits primarily on the hospice-side
experience," this is the UI bar:

- Every screen has **one obvious next action**; no dashboard that needs explaining.
- **Plain words everywhere**: "Accepted," "On the truck," "Delivered," "Picked up" — never
  `dispatched`, `in_transit`, or anything that smells like a state machine. Risk reasons already
  read as human sentences ("vendor is 62% on-time for beds on Fridays") — that style is the rule,
  not the exception.
- **Big touch targets, tablet- and phone-first** — the nurse trigger is one tap from a phone in
  someone's home; the order form is finishable in under a minute by someone who has never seen it.
- The test for any screen: would your mom's least technical friend know what happened and what to
  do next, without anyone standing behind her? Say the line back to them in the pitch when showing
  the board.

## The problem, precisely

Hospices are accountable for two moments they can't observe or control, because a separate DME vendor executes both: **equipment in place before a discharge home**, and **equipment picked up promptly after a death**. Coordination runs on phone, fax, and per-vendor portals, so neither side sees the other's status. The hospice absorbs the blame (family experience, CAHPS scores) for failures it literally cannot watch happen.

Reframed once, the whole problem is: **the hospice has no reporting from the vendor side.** BetterRX's own discovery reached the same conclusion — "delivery visibility, not DME ownership, is the higher-leverage problem." Everything we built is a machine for extracting truthful status from the vendor side at the lowest possible cost to the vendor.

## What we know vs. what we assume

**From the brief (their discovery — treat as fact):**
- Ordering today: phone, fax, or vendor-specific portals. **Texting is not on their list** — never claim SMS is the status quo; it's our chosen *upgrade* from phone/fax.
- Bigger vendors' ops software often has GPS tracking and POD internally, but it is "rarely surfaced back to the hospice in a usable way." The gap is *surfacing*, not data creation — for them.
- Reporting fails in both directions: hospices don't hear about deliveries; vendors don't hear about deaths ("someone would die and StateServ wouldn't know about it").
- BetterRX has **zero vendor network today**. Value must exist before any vendor relationship does.

**From the sponsor FAQ (2026-08-14, `docs/BOUNTY-FAQ.md` — went to every team, treat as doctrine):**
- **Our baseline architecture is now officially prescribed** (§3): "design for a vendor who may never
  log into anything and only ever responds via a confirmation email or text (SMS/magic-link style)
  as the baseline." Validation — and a warning: every team read this. SMS-reply vendors are table
  stakes as of this document; our differentiation moves up the stack (IVR/landline reach,
  silence-as-signal nag ladder, deterministic DTMF vs confidence-gated parse, verified-vs-reported).
- **Vendor network-building is out of scope** — participation is an assumed given. Pitch the channel
  UX and the reporting machine, not recruitment.
- **Judging weight sits primarily on the hospice-side experience** (§3) — the board, review queue,
  escalation flow, and cost view are scoring-critical, not polish.
- **eRx already receives admission/discharge/death events** (§4) — the EMR-signal design is
  "existing infrastructure," and the FAQ includes real `newOrUpdatePatient` / `newMedications` JSON
  payloads; the integration sketch mirrors them.
- **Pickup trigger: nurse-in-the-home is the preferred PRIMARY signal, EMR the redundant fallback**
  (§8) — their own discovery has a death that never reached the vendor's system in time. Scenario 2
  leads with the nurse tap; the EMR webhook is belt-and-suspenders.
- **Who pays** (§5): hospice pays per-patient-day, bundled with the pharmacy PPD BetterRX already
  charges. Closed question — quote it.
- **Risk scoring is judged on approach + honesty about the baseline** (§6), CMS DMEPOS PUF is the
  sanctioned public source, and synthetic timing data must be loudly labeled synthetic —
  "manufactured precision" is explicitly penalized.
- **SLA assumption** (§7): same-day for urgent/STAT, 24h for routine — stated, configurable, ours to
  declare.
- **Equipment condition/cleanliness is a named strong differentiator** (§9) — broken wheelchairs, a
  contaminated chair in their interviews. A photo/checklist condition step at delivery rides our
  existing POD capture nearly for free. Design the order flow forward-compatible with a live
  inventory check (graceful fallback when absent) — "exactly the kind of thinking we value most."
- **Vendor operational reality can't be validated this week** (§1) — state operational assumptions
  explicitly in every deliverable; an assumptions register earns points.

## The core asymmetry: who can integrate

- **Hospice side CAN integrate.** Hospices run real EMRs (HCHB, Axxess, WellSky) with actual partner layers — so an EMR webhook for patient status is credible engineering, and we designed for it.
- **Vendor side largely CANNOT.** The long tail of regional DME vendors is a warehouse, trucks, and a dispatcher — no IT staff, no API, no webhook endpoint. Any architecture whose entry requirement is vendor-side integration (API, webhook, portal login) excludes most of the vendors causing the pain, and has zero value at vendor-count zero.

Design rule that falls out: **integration is the ceiling, never the floor.** The floor must be a channel every vendor already has.

## The vendor adoption ladder

Each rung is lower effort than the vendor's status quo, so participation is pulled, not pushed:

| Rung | Vendor does | We get |
|---|---|---|
| 0 | Nothing — hospice enters their phone number (its existing rolodex) | Reachability. No BetterRX vendor network needed: each hospice imports its own vendors |
| 1 | Replies to a text — or presses 1 on an automated check-in call — from their customer | Structured status; participation from message one. Channel-agnostic: text parses via AI, a keypress is deterministic (no model). Voice matters structurally — rolodex landlines can't receive SMS |
| 2 | Driver taps a link, snaps photo + signature | Verified proof at the two moments that matter (delivery, pickup) — protects the vendor in billing disputes too |
| 3 | Asks for "one place to see my orders" → magic-link dispatch board | Voluntary adoption; deeper data |
| 4 | Full portal / API / ops-software integration | The clean feed — for the minority who can, once already in the loop |

Silence is also a reporting source: a vendor not replying near a deadline becomes an at-risk flag and an escalation — non-response was ambiguous in the phone world, here it's signal.

## Reporting sources, ranked by vendor cost

1. Vendor replies (≈ free) → parsed to structured events, confidence-gated, human-reviewed below threshold
2. System-initiated nagging (free) → the software polls so the case manager never does
3. Driver links (seconds) → POD photo/signature/timestamp
4. Silence (free) → risk flag + escalation
5. Nurse-in-the-home tap (seconds) → the reverse direction: death/discharge triggers the pickup the moment it's real, with the EMR webhook as the redundant fallback (sponsor-preferred ordering, FAQ §8) — either way, no phone call

## Positioning and Q&A

- **"Isn't this just an ordering portal?"** Ordering is the doorway. The product is what happens after the button: live shared lifecycle, failure predicted before the deadline, and the pickup loop closed automatically. No portal does those.
- **"Why not integrate with vendor systems?"** We do — rung 4. The other rungs exist for the vendors who will never get there. We refuse to make integration the entry requirement, because the no-network cold start makes that architecture worth zero on day one.
- **"Vendors could lie by text."** They lie into voicemail today, unauditable. Here every claim lands in a timestamped ledger, checked against verified outcomes (POD, deadlines met/missed) — the system gets more truthful the longer a vendor participates.
- **"A dispatcher presses 1 just to get you off the phone — you've replaced known ambiguity with confident falsehood."** We don't trust the 1. Every status is badged by evidence source — **vendor-reported** (text, keypress) vs **verified** (POD photo/signature) — and the board always shows which is which. A claim can lower a risk score; near a deadline, only verified evidence or a case-manager action clears it. The phone call she makes today produces the same lie with no ledger and no badge.
- **"Half a vendor rolodex is office landlines — landlines can't receive SMS."** Correct, and it's why the voice channel exists: an automated check-in call with press-1 confirm reaches every phone number ever issued. Carrier lookup routes each number to text or voice automatically; both land in the same pipeline. Rung 1 is channel-agnostic, not SMS-with-hope.
- **"The FAQ says 'no vendor UI, infer status from delivery/EMR events' is a legitimate path — why not that?"** Because inference can't see *intent before the deadline*. There is no event to infer "accepted" or "on schedule for tomorrow" from until the truck arrives or doesn't — inference-only systems learn about failures at the moment the phone/fax world does: too late. Our channel captures the vendor's forward-looking commitments (accept, ETA) at near-zero vendor cost, which is what deadlines, risk flags, and escalations need to fire *early*. We use event inference too — it's the verification layer, not the visibility layer.
- **"You're sending PHI over unencrypted SMS."** No — payloads are minimum-necessary by design: order number, equipment, deadline, area. Names and street addresses never ride the open channel; they live behind the authenticated driver/dispatch link. The telephony provider (Twilio) is HIPAA-eligible and signs BAAs. Designed-in constraint, not a retrofit.
- **The one-line frame:** *Every solution to this problem dies on the same question — what does the vendor have to do? Our answer: reply to a text.*
- Lead demo scenarios with outcomes (the saved discharge, the dignified pickup); reporting is the mechanism, not the headline.
