# Stated Assumptions Register

*Draft. The companion to every other deliverable — read it alongside them, not after.*

The sponsor asked for this directly. FAQ §1: no vendor or dispatcher was interviewed, so "teams
should treat the vendor operational reality as an **assumption to state clearly**, not something we
can validate for you this week." FAQ §6: risk scoring is judged on "**approach and honesty about the
baseline**," and "we'd rather see a well-reasoned model built on CMS utilization data and clearly
labeled assumptions than manufactured precision."

So here is every load-bearing assumption in the design, what breaks if it's wrong, and how
production would settle it. Nothing below is measured. Anything we *do* know is marked as such.

## Vendor operations

Never validated — no vendor interview exists, ours or BetterRX's (§1). This is the softest ground
in the whole design, which is why it's first.

| Assumption | If it's wrong | How production validates |
|---|---|---|
| **Dispatch.** A dispatcher sees an inbound order request within minutes to a couple of hours in business hours, and acts on it the same day. | The nag ladder and escalation thresholds fire into an empty room (alert fatigue) or far too late to save the discharge. | Log time-from-send to first vendor touch per vendor per hour-of-day; tune each rung of the ladder off the measured distribution instead of our guess. |
| **Driver logistics.** Routes firm up the evening before or the morning of, so an accept + ETA given the day before is a real commitment and a same-day insert is disruptive but possible. | "Accepted" stops predicting anything, and risk has to lean on time-to-deadline rather than vendor intent. | Compare stated ETA against POD timestamps by lead time; if the correlation is weak, reweight `server/risk.ts` accordingly. |
| **Condition / QA at delivery.** The driver is at the bedside, can capture a photo and a short checklist there, and equipment condition is meaningfully inspectable at handoff. | The condition step becomes theatre — the failure (a contaminated chair, §9) was baked in at the warehouse and needs a pre-dispatch attestation instead. | Track condition complaints filed *after* a passing checklist; a high rate moves verification upstream to dispatch. |
| **Adoption-ladder effort.** Each rung costs the vendor less than their status quo ("reply to a text ≈ free," "driver link ≈ seconds"). These are **design targets we set, not measurements.** | Participation stalls at rung 0–1 and the reporting machine starves — the whole thesis is a channel vendors actually use. | Per-rung response rate and median seconds-to-complete, per vendor cohort; a rung that doesn't beat the phone call gets redesigned or dropped. |

## Service levels

Industry practice offered by the sponsor as "a reasonable starting assumption" (§7) — explicitly not
a standard, because BetterRX holds no DME vendor contracts.

| Assumption | If it's wrong | How production validates |
|---|---|---|
| **Same-day for urgent/STAT** (bed, oxygen at admission), **24h for routine.** Our declared default, configurable, not contractual anywhere. | Deadlines — and therefore every risk score and escalation keyed off them — are calibrated to the wrong clock. | These become per-hospice and per-vendor contract fields, seeded from our default and corrected by the observed delivery distribution. |
| **Pickup window: 24h** after death or discharge (`PICKUP_WINDOW_HOURS`, `server/watchdog.ts`). | Overdue flags are either eager enough to nag a vendor who was never late, or slow enough that the family looks at the bed another day. | Config per hospice; validate against family-experience feedback rather than vendor convenience — the window exists for the living room, not the warehouse. |

## Data

| Assumption | If it's wrong | How production validates |
|---|---|---|
| **All delivery-timing and vendor-performance data in this build is SYNTHETIC** — seeded by `scripts/seed.ts`, planted to make the risk engine legible. No on-time percentage shown anywhere in the demo describes a real vendor. | Not a risk of being wrong — a risk of being *read* as real. Treating these numbers as evidence is the "manufactured precision" §6 penalizes. | The risk engine reads `vendor_stats` from the live `order_events` ledger from day one; real numbers replace seeded ones with no code change. |
| **CMS DMEPOS PUF grounds utilization and pricing only** — equipment mix and typical cost. Per §6, CMS claims are **billing, not logistics**; the files contain no delivery timing. | Any inference from CMS data to timeliness would be invalid. We make none, deliberately. | Keep the two sources structurally separate: timeliness comes only from our own POD-and-deadline ledger, never from claims. |
| **Cold-start scoring.** A vendor with no history is scored from equipment, urgency, and time-to-deadline alone, and the reason string says so. | Early scores over- or under-flag until history accrues. | Hold new vendors at a stated prior until `sample_size` crosses a threshold; every reason already carries its `n`, so a thin score is visibly thin. |

## Channel

Stated in `PROBLEM-THESIS.md`, unvalidated. Every one of these is measurable on week one of a pilot.

| Assumption | If it's wrong | How production validates |
|---|---|---|
| **Deliverability.** SMS and email reach vendor numbers reliably enough that an untapped link means "no attention," not "never arrived." | Silence-as-signal manufactures false escalations — we'd be paging a case manager about a message the carrier dropped. | Carrier delivery receipts gate the ladder: undelivered and unread are different states, and only *unread* is allowed to escalate. |
| **Magic-link tap rate.** A dispatcher will tap a link from a customer they recognize, with no login. | The deterministic tap path collapses back to free-text parse or a voice keypress — which is exactly why both still exist in the design. | Measure tap rate vs. reply rate vs. call-answer rate per vendor and route each vendor by measured preference. |
| **Landline mix.** A material share of a hospice's vendor rolodex is office landlines that cannot receive SMS. | The voice/IVR channel is over-built. Harmless — it degrades to unused, not broken. | Carrier line-type lookup at rolodex import gives the true mix per hospice before any voice build-out is committed. |

## Economics — a GIVEN, not an assumption

Worth the distinction: **the hospice pays a per-patient-day fee, bundled with the pharmacy tech PPD
BetterRX already charges** (§5, sponsor-confirmed, verbatim). Everything above is ours to defend;
this one is theirs to state, and we quote it rather than model it.

What remains assumption here is only the price point and the attach rate — and no part of the design
depends on either.
