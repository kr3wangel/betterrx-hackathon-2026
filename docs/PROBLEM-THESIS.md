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

## The problem, precisely

Hospices are accountable for two moments they can't observe or control, because a separate DME vendor executes both: **equipment in place before a discharge home**, and **equipment picked up promptly after a death**. Coordination runs on phone, fax, and per-vendor portals, so neither side sees the other's status. The hospice absorbs the blame (family experience, CAHPS scores) for failures it literally cannot watch happen.

Reframed once, the whole problem is: **the hospice has no reporting from the vendor side.** BetterRX's own discovery reached the same conclusion — "delivery visibility, not DME ownership, is the higher-leverage problem." Everything we built is a machine for extracting truthful status from the vendor side at the lowest possible cost to the vendor.

## What we know vs. what we assume

**From the brief (their discovery — treat as fact):**
- Ordering today: phone, fax, or vendor-specific portals. **Texting is not on their list** — never claim SMS is the status quo; it's our chosen *upgrade* from phone/fax.
- Bigger vendors' ops software often has GPS tracking and POD internally, but it is "rarely surfaced back to the hospice in a usable way." The gap is *surfacing*, not data creation — for them.
- Reporting fails in both directions: hospices don't hear about deliveries; vendors don't hear about deaths ("someone would die and StateServ wouldn't know about it").
- BetterRX has **zero vendor network today**. Value must exist before any vendor relationship does.

**Open questions (ask BetterRX):**
- Channel mix by vendor type — phone vs fax vs portal, nationals vs regionals?
- Do regional vendors have any ops software at all, or is nothing captured?

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
5. EMR webhook → the reverse direction: patient status reports itself to the vendor (pickup auto-triggered, no phone call)

## Positioning and Q&A

- **"Isn't this just an ordering portal?"** Ordering is the doorway. The product is what happens after the button: live shared lifecycle, failure predicted before the deadline, and the pickup loop closed automatically. No portal does those.
- **"Why not integrate with vendor systems?"** We do — rung 4. The other rungs exist for the vendors who will never get there. We refuse to make integration the entry requirement, because the no-network cold start makes that architecture worth zero on day one.
- **"Vendors could lie by text."** They lie into voicemail today, unauditable. Here every claim lands in a timestamped ledger, checked against verified outcomes (POD, deadlines met/missed) — the system gets more truthful the longer a vendor participates.
- **"A dispatcher presses 1 just to get you off the phone — you've replaced known ambiguity with confident falsehood."** We don't trust the 1. Every status is badged by evidence source — **vendor-reported** (text, keypress) vs **verified** (POD photo/signature) — and the board always shows which is which. A claim can lower a risk score; near a deadline, only verified evidence or a case-manager action clears it. The phone call she makes today produces the same lie with no ledger and no badge.
- **"Half a vendor rolodex is office landlines — landlines can't receive SMS."** Correct, and it's why the voice channel exists: an automated check-in call with press-1 confirm reaches every phone number ever issued. Carrier lookup routes each number to text or voice automatically; both land in the same pipeline. Rung 1 is channel-agnostic, not SMS-with-hope.
- **"You're sending PHI over unencrypted SMS."** No — payloads are minimum-necessary by design: order number, equipment, deadline, area. Names and street addresses never ride the open channel; they live behind the authenticated driver/dispatch link. The telephony provider (Twilio) is HIPAA-eligible and signs BAAs. Designed-in constraint, not a retrofit.
- **The one-line frame:** *Every solution to this problem dies on the same question — what does the vendor have to do? Our answer: reply to a text.*
- Lead demo scenarios with outcomes (the saved discharge, the dignified pickup); reporting is the mechanism, not the headline.
