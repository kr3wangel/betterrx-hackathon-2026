# Deliverable E — Demo Script (3 scenarios) + 5-minute pitch skeleton

*Draft — rehearse against the clock twice; code freeze first.*

*Assumptions this document relies on: see [ASSUMPTIONS.md](ASSUMPTIONS.md).*

Setup before walking to the front: two browser windows side by side (left: `/hospice`; right: `/vendor` or `/driver` as the scenario needs), phone with `/driver` open, terminal ready with the seed commands. Roles: Angel narrates, FE drives screens, DATA runs seeds.

## Pitch skeleton (5:00)

- **0:00–0:45 — The problem, in their words.** Two moments hospices don't control but always get blamed for: equipment late for a discharge, and pickup after a death. Quote the brief's own discovery: hospices padding a day of buffer because they don't trust vendor timelines; "it's very distressing to see the equipment of a loved one still lingering in your home."
- **0:45–1:15 — The insight.** Every existing fix assumes vendors adopt software. They won't — most ordering is phone and fax. So we built the coordination layer that meets vendors where they are: a text message. And BetterRX has no vendor network today — our cold start is *reply to one SMS*.
- **1:15–4:15 — Live demo, three scenarios (below).**
- **4:15–5:00 — Close.** Rules where rules win (explainable risk, deterministic lifecycle), AI only where rules can't go (reading human text), a person in the loop at every high-stakes step. Integration-ready: EMR webhook and eRx data shapes already modeled. This makes the case manager's day measurably easier — which is what you said winning looks like.

## Scenario 1 — Discharge readiness (~60s)

`npm run seed scenario1`

1. **Hospice board**: order #1042 — hospital bed for Eleanor Vance, discharge tomorrow morning. Card is red: risk 81. Read the reasons out loud — *"vendor is 72% on-time for hospital beds on this weekday… hasn't accepted and the deadline is in 16 hours."* Nobody had to call anyone to learn this.
2. Escalation banner is already up. Click **Swap vendor →** pick Wasatch (93% on-time). Order resets to `ordered` with the new vendor; outbound SMS to the new vendor appears.
3. **Vendor window**: Wasatch's phone shows the order request. Reply "yes, we'll have it there by 7am" → parse auto-applies → hospice board flips to `dispatched`, ETA set, risk clears. **Point at both windows moving together.**

## Scenario 2 — Post-death pickup (~60s)

`npm run seed scenario2`

1. **Hospice**: Harold Whitfield has a delivered bed and oxygen concentrator. In the EMR simulator, click **Deceased** — narrate: *in production this is the HCHB status feed, not a button.*
2. Both orders flip to `pickup_pending`; pickup-request SMS goes to the vendor automatically. No phone call happened.
3. **Phone, `/driver`**: two pickup jobs appeared, with the "family is grieving — call ahead, be kind" note. Complete one: photo + signature → `picked_up`, family-notified event on the timeline.
4. Mention the watchdog: if pickup sits past the window, it escalates on its own — the hospice knows before the family has to look at that bed another day.

## Scenario 3 — Cold-start vendor (the closer, ~75s)

`npm run seed scenario3`

1. Setup line: *"This vendor has never installed anything. This is their entire onboarding."* **Vendor window** = their actual phone.
2. Type: **"bed's on the truck, should be there by 10"** → watch it parse (intent, confidence, auto-applied) → hospice board moves to `in_transit` with ETA. Plain English became structured, shared state.
3. Now the safety story. Type: **"who is this??"** → low confidence → lands in the **review queue**, not applied. *The AI knows what it doesn't know; a person decides.*
4. Type: **"cant do it this week, truck's down"** → decline → instant escalation on the hospice side with the reason. The failure that used to surface at the front door now surfaces the moment the vendor types it.

## Failure drills (rehearse these)

- Venue wifi dies → everything but the parse is local; have one pre-parsed message thread in the `full` seed to narrate from if Claude is unreachable.
- Parse comes back weird live → that's not a failure, it's the review queue demo: "and this is why there's a human in the loop."
- Reset between scenarios is one seed command; SSE reconnects on its own.
