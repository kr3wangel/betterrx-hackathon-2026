# Deliverable D — Integration Approach

*Draft. A diagram is enough per the brief — render the mermaid below for the submission.*

## Where the system sits

```mermaid
flowchart LR
  subgraph Hospice side
    EMR[HCHB EMR<br/>patient status, admissions]
    ERX[BetterRX eRx<br/>medication orders + spend]
  end

  subgraph DME Bridge (this system)
    API[Order API +<br/>state machine]
    RISK[Risk engine]
    MSG[Vendor messaging<br/>SMS in/out + AI parse]
    DB[(Orders, events,<br/>vendor history)]
  end

  subgraph Vendor side
    SMS[Vendor phone<br/>plain SMS]
    DRV[Driver web view<br/>POD capture]
  end

  EMR -- "patient status webhook<br/>(admission, discharge, death)" --> API
  ERX <-- "patient identity +<br/>DME spend alongside med spend" --> API
  API --> RISK
  API <--> MSG
  MSG <--> SMS
  DRV --> API
  API --> DB
```

## HCHB (Homecare Homebase) — the EMR integration

HCHB has a dedicated integration layer built specifically to automate DME ordering and share real-time patient status with outside vendors — existing DME integrations already connect this way, so we design against that precedent rather than assuming an open API.

**Direction 1, EMR → us (the one that matters most):** patient status changes. Our system already models this as `POST /api/emr/patient-status` — in production, that endpoint is the subscriber to HCHB's patient-status feed. The payload we need is minimal:

```json
{ "patient_ref": "hchb:P-448121", "status": "deceased", "effective_at": "2026-08-14T03:22:00Z" }
```

Admission events would additionally carry name, service address, and market so the patient record self-creates. Death/discharge auto-triggers equipment pickup — replacing the manual phone call the brief's hospices called out.

**Direction 2, us → EMR:** order status writebacks (ordered/delivered/picked up + POD reference) attached to the patient chart, via the same partner layer. Nice-to-have, not load-bearing.

## BetterRX eRx — data-sharing integration

DME has no pharmacy-style e-prescribing standard, so this is a data-sharing integration between two systems, not a shared transaction protocol. Two touchpoints:

1. **Patient identity** — eRx and DME Bridge share a patient reference so both systems talk about the same person (in production: eRx patient ID as the join key, as modeled by `patient_ref`).
2. **Total cost of care** — DME spend (our order ledger prices via HCPCS) surfaces alongside medication spend in one view, addressing the "DME in a separate silo" pain point. Read-only exchange in both directions; a nightly sync or simple REST pull is sufficient.

## The order record as it crosses systems

```json
{
  "order_ref": "dme:1042",
  "patient_ref": "hchb:P-448121",
  "hcpcs": "E0260",
  "description": "Hospital bed, semi-electric",
  "urgency": "urgent",
  "needed_by": "2026-08-15T09:00:00Z",
  "state": "in_transit",
  "eta": "2026-08-15T07:30:00Z",
  "risk": { "score": 81, "reasons": ["vendor is 72% on-time for this equipment on this weekday"] },
  "proof": { "delivered_at": null, "signature": null, "photo": null }
}
```

HCPCS Level II E-codes are the shared equipment vocabulary (the CMS coding set built for DME); on the billing side, delivery-completion events give the vendor's existing X12 837 claims process a documented trigger with POD attached — aimed at the 15–25% DME claim denial rate that's largely documentation gaps. We don't process claims; we hand the vendor's biller better evidence.

## Why this is credible without a live connection

Everything above already exists in the prototype behind simulated endpoints: the EMR webhook is `POST /api/emr/patient-status`, the vendor channel is `POST /api/messages/inbound`, and the order record above is the actual shape in `shared/types.ts`. Swapping the simulators for HCHB's partner layer and an SMS provider (Twilio) changes transport, not architecture.
