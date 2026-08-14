# Build-Day Tasks (unassigned — claim by putting your name in the box)

S = under an hour · M = a few hours · (S1/S2/S3) = which demo scenario it serves

## Product

- [ ] **S–M · Live-test the AI parse** (S3) — key into `.env`, run the six spec test messages through the vendor simulator: intents right, relative times resolve to correct ISO dates, order-matching from context works, "who is this?" → review queue, "truck's down" → escalation. Tune the system prompt in `server/messaging.ts` where wrong.
- [ ] **S · Capture measured token costs** — the `[llm]` log lines from the parse test replace the estimates in deliverable B.
- [ ] **S–M · Verified vs vendor-reported badges** (S1, S3) — badge every status by evidence source: **verified** (driver POD photo/signature) vs **vendor-reported** (text/keypress). A vendor *texting* "delivered" currently applies the same as a driver POD; message-sourced deliveries get a visible "unverified" marker + escalation. Stretch: a vendor claim never fully clears an at-risk flag inside the final hours before deadline — only POD or a case-manager action does. This is the Q&A answer to "a dispatcher presses 1 to get you off the phone" (see PROBLEM-THESIS Q&A).
- [ ] **M · Simulated IVR call channel** (S3) — build per `docs/IVR-SIM-SPEC.md`. Irreducible core (~90m): place call → laptop speaks script → press 1 → hospice board moves at confidence 1.0 with no model call. Spec has the cut order if time collapses. Keep scripts PHI-clean (order #, equipment, area — never names/addresses).
- [ ] **M · Expand the world** — more HCPCS codes in `client/src/lib/domain.ts` CATALOG + matching stats in `scripts/seed.ts`; more patients/vendors with believable data and per-vendor personality (fast-but-flaky vs slow-but-reliable).
- [ ] **M · CMS-grounded pricing** — unit price per HCPCS code (CMS DME public-use file) + a per-patient med-spend table. *Blocks the cost widget.*
- [ ] **M · Risk engine credibility pass** (S1) — tune weights/threshold in `server/risk.ts`; keep the tests green; consider one added signal.
- [ ] **M · Backtest stat** — generate synthetic order history with known outcomes, run `computeRisk` over it, output "flagged N% of late deliveries ≥X hours early, false-positive rate Y%." One slide, big payoff.
- [ ] **S · Demo-seed polish** — names, timings, and data that read well projected.
- [ ] **M · Cost-of-care widget** — DME spend next to med spend per patient on the hospice view. *Needs the pricing item.*
- [ ] **M · Visual polish pass** — spacing, hierarchy, at-risk treatment, empty states, product name in header, title/favicon.
- [ ] **S · Show the PODs** (S1, S2) — photos/signatures are stored but never displayed; thumbnails on the expanded order card.
- [ ] **S · Phone access for driver view** — `host: true` in `client/vite.config.ts`; test `/driver` + camera from a real phone on the venue LAN.

## Pitch & process

- [ ] **S · Fold briefing answers into scope** — esp. simulated-SMS acceptability and recruitment-vs-risk depth.
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
