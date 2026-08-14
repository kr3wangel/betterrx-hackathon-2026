# Deliverable C — Differentiation Snapshot

*Draft.*

## How DME coordination works today

Phone calls, faxes, and vendor-specific portals. The hospice logs into the vendor's system (one login per vendor), or more often calls and hopes. Status lives inside the vendor's four walls; the hospice finds out an order slipped when the family calls. Pickup after a death is triggered by a phone call and tracked by nobody. National platforms offer portals — built for the vendor's operations, not the hospice's discharge.

## What we do differently, and why it matters

**1. One shared view, both sides of the handoff.** Hospice, vendor dispatch, and driver look at the same order lifecycle, updated live. The hospice case manager sees "in transit, ETA 10am" without calling anyone; the vendor sees the discharge deadline they're being measured against. Today neither side can see the other's half.

**2. Vendors need zero software — the cold-start answer.** Every existing platform assumes the vendor adopts a portal. Ours meets vendors on SMS: the system texts the order, the vendor texts back in plain English, and AI turns the reply into structured status. A vendor is "onboarded" the moment they reply to a text. This matters because BetterRX has no vendor network today — our design creates value on day one with zero signed vendors, and every parsed reply builds the performance history that makes the network sticky. Portal adoption becomes the upgrade path, not the entry fee.

**3. Service failure prevention, not reporting.** Risk scoring flags an order *before* it's late — vendor's on-time history for that equipment on that weekday vs. the discharge clock — and escalates to a human with a legible reason and a one-click vendor swap. Today the failure is discovered at the front door. (Predictive analytics is established in hospice for clinical risk; applying it to DME logistics is an open lane.)

**4. Pickup is a first-class, automated flow.** A patient status change (EMR-triggered, not a phone call) creates the pickup job, texts the vendor, puts it on a driver's route, and starts a watchdog clock. If the equipment sits past the window, the hospice knows before the family has to look at it another day. Today this — the moment the brief's hospices called most damaging — is handled by memory and goodwill.

**5. Accountability with receipts.** Every order carries an append-only event trail, proof of delivery/pickup (photo, signature, timestamp), and vendor performance is measured from actual events — the data that today's hospice-vendor relationship arguments lack.

## Why a hospice or vendor cares

- **Hospice:** discharges stop being hostage to vendor opacity; CAHPS-damaging pickup delays get a clock and an owner; vendor choice becomes evidence-based.
- **Vendor:** orders arrive structured instead of as voicemails; they're judged on measured performance rather than the last bad anecdote; no new software to learn — it's a text message.
