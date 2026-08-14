# Build-Day Tasks (unassigned — claim by putting your name in the box)

S = under an hour · M = a few hours · (S1/S2/S3) = which demo scenario it serves

> **FAQ recalibration (see `docs/BOUNTY-FAQ.md` + thesis):** judging weight sits primarily on the
> **hospice-side experience** — the board, review queue, and escalation flow are scoring-critical,
> not polish. SMS-reply vendors are now every team's baseline; our edge is up the stack (IVR,
> silence ladder, verified-vs-reported, condition capture, nurse-primary pickup).

## Product

- [ ] **S–M · Live-test the AI parse** (S3) — key into `.env`, run the six spec test messages through the vendor simulator: intents right, relative times resolve to correct ISO dates, order-matching from context works, "who is this?" → review queue, "truck's down" → escalation. Tune the system prompt in `server/messaging.ts` where wrong.
- [ ] **S · Capture measured token costs** — the `[llm]` log lines from the parse test replace the estimates in deliverable B.
- [ ] **S–M · Verified vs vendor-reported badges** (S1, S3) — badge every status by evidence source: **verified** (driver POD photo/signature) vs **vendor-reported** (text/keypress). A vendor *texting* "delivered" currently applies the same as a driver POD; message-sourced deliveries get a visible "unverified" marker + escalation. Stretch: a vendor claim never fully clears an at-risk flag inside the final hours before deadline — only POD or a case-manager action does. This is the Q&A answer to "a dispatcher presses 1 to get you off the phone" (see PROBLEM-THESIS Q&A).
- [ ] **M · Magic-link vendor confirm + DME Portal** (S3) — the vendor channel, per the team decision + FAQ §3 baseline (see thesis decision note). Backend: per-vendor token, `GET /api/portal/:token` (vendor + their open orders, no login), one-tap actions posting deterministic events (Confirm → `vendor_accepted`, Can't fill → decline escalation, ETA picker → `eta_set`) — actor `vendor`, confidence 1.0, no model. Outbound templates (order request, ack nag, pickup request) append the magic link. FE: the no-login confirm page + the dispatch board behind the same link. Scenario 3 becomes: brand-new vendor taps the link → confirms → hospice board moves live; the silence ladder (auto-nag → escalation) is the it-didn't-get-tapped beat.
- ~~**M · Simulated IVR call channel**~~ — **shelved for the demo** (team decision: no phone simulation). `docs/IVR-SIM-SPEC.md` stays as the production story for free-text and landline-only vendors — Q&A ammunition, don't build.
- [ ] **M · Expand the world** — more HCPCS codes in `client/src/lib/domain.ts` CATALOG + matching stats in `scripts/seed.ts`; more patients/vendors with believable data and per-vendor personality (fast-but-flaky vs slow-but-reliable).
- [ ] **M · CMS-grounded pricing** — unit price per HCPCS code (CMS DME public-use file) + a per-patient med-spend table. *Blocks the cost widget.*
- [ ] **M · Risk engine credibility pass** (S1) — tune weights/threshold in `server/risk.ts`; keep the tests green; consider one added signal.
- [ ] **M · Backtest stat** — generate synthetic order history with known outcomes, run `computeRisk` over it, output "flagged N% of late deliveries ≥X hours early, false-positive rate Y%." One slide, big payoff. **Label it SYNTHETIC in large type** — FAQ §6 says risk scoring is judged on "approach and honesty about the baseline" and manufactured precision is explicitly penalized; the honesty *is* the points.
- [ ] **M · Nurse-initiated pickup trigger** (S2) — FAQ §8: nurse-in-the-home is the sponsor-preferred PRIMARY trigger, EMR the redundant fallback. This is the **ordering nurse** persona: a phone-friendly "patient died / discharged — trigger pickup" action (she's in the home, so mobile-web like `/driver`); it fires the same `pickup_triggered` path as the EMR webhook. Rework scenario 2 to lead with the nurse tap and narrate EMR as belt-and-suspenders ("their own discovery found the EMR-only path fail").
- [ ] **S · Condition checklist on POD** (S1, S2) — FAQ §9 names equipment condition a strong differentiator (broken wheelchairs, a contaminated chair in their interviews). Extend the existing `/driver` POD capture with a 3-item attestation (clean / functional / patient-ready) stored alongside photo+signature and shown on the order card. Nearly free on top of what's built.
- [ ] **S · Codify SLA defaults + assumptions register** — FAQ §7: same-day for urgent/STAT, 24h routine, as stated configurable defaults (order form + seed `target_at`). Add a short stated-assumptions section to the deliverables (vendor ops reality, SLAs, synthetic data) — FAQ §1 asks for exactly this.
- [ ] **S · Demo-seed polish** — names, timings, and data that read well projected.
- [ ] **M · Cost-of-care widget** — DME spend next to med spend per patient on the hospice view. *Needs the pricing item.* Lives on the directing-nurse reports view (below).
- [ ] **M · Directing-nurse reports view** — the third hospice persona (briefing: ordering nurse / case worker / directing nurse) has no surface yet. A `/reports` view: vendor scorecards straight from `vendor_stats` (on-time by equipment × weekday — the risk engine's raw material, zero new data), open escalations, pickup latency, cost-of-care, and a **"phone calls that never happened" counter** (auto-applied vendor updates + auto-triggered pickups) — the north-star metric on an actual screen. Label each hospice surface with its persona.
- [ ] **M · Visual polish pass** — spacing, hierarchy, at-risk treatment, empty states, product name in header, title/favicon.
- [ ] **S · Show the PODs** (S1, S2) — photos/signatures are stored but never displayed; thumbnails on the expanded order card.
- [ ] **S · Phone access for driver view** — `host: true` in `client/vite.config.ts`; test `/driver` + camera from a real phone on the venue LAN.

## Pitch & process

- [ ] **S · Fold briefing answers into scope** — the written FAQ is ingested (`docs/BOUNTY-FAQ.md`, thesis updated); remaining: anything said live at the briefing that the FAQ doesn't cover.
- [ ] **S · Integration sketch mirrors real eRx payloads** — FAQ §4 provides actual `newOrUpdatePatient` / `newMedications` JSON; model the DME order/status events as sibling event types in deliverable D (a `newDmeOrder` shaped like `newMedications` with HCPCS in place of NDC). Also show the ordering flow forward-compatible with a live inventory check + graceful price/service fallback (FAQ §9 — "exactly the kind of thinking we value most").
- [ ] **Slides** — 4–5, demo-first: problem in hospices' words → cold-start insight → demo → AI-ROI/safety close; integration diagram is one slide. Include the landline beat: rolodex landlines can't receive SMS, so the voice channel is structurally necessary — it's the argument that makes rung 1 channel-agnostic instead of SMS-with-hope.
- [ ] **M · End-to-end scenario walkthroughs** (all three) — click-by-click on the demo machine; fix snags; then record the insurance video.
- [ ] **Finalize deliverables B–E** — measured costs in, backtest stat in, mermaid rendered, demo script matches reality.
- [ ] **Rubric audit ×2** (mid-day + pre-freeze) — evidence named for all five judging rows.
- [ ] **Submission mechanics** — formats, deadline, confirmations.
- [ ] **Freeze, then two timed rehearsals.**

## Dependencies & cut order

- Chains: parse test → measured costs → deliverable B · pricing → cost widget. Everything else is parallel.
- If time collapses, cut in this order: phone-LAN test → cost widget → backtest stat → POD thumbnails.
- Untouchable: the parse test and the scenario walkthroughs — scenario 3 and the demo itself live on them.
