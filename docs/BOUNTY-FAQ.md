# Bounty Team FAQ — Pre-Build Responses (BetterRX · DME Builders Day Bounty)

Sponsor's consolidated answers to all pre-build survey questions, received 2026-08-14. Content
preserved verbatim from the distributed docx; formatting only. **Treat as doctrine — this document
went to every team.** Our read of the implications lives in `PROBLEM-THESIS.md`.

## 1. DME Vendor Access & Prior Research

*"Is there a specific DME vendor who could speak to their side of this workflow?" / "Were any DME vendors interviewed?" / "Is there a DME dispatcher we could talk to during the build?"*

No DME vendor or dispatcher is available to speak with teams, either before or during the hackathon. Our original discovery study interviewed seven hospice executives — no vendor-side interviews were conducted. That said, we aren't starting from zero insight: BetterRX has had exploratory conversations with DME-adjacent platforms (competitors and potential partners), which gives us real visibility into vendor economics, incentive structures, and how they position against players like StateServ and Dragonfly. What we don't have is first-hand insight into a single vendor's day-to-day operations such as dispatch, driver logistics, or condition/QA at time of delivery. Teams should treat the vendor operational reality as an assumption to state clearly, not something we can validate for you this week.

## 2. DME Vendor Network Status

*"Whether BetterRX actually has zero DME vendor relationships or just hasn't said who they're talking to."*

BetterRX has no owned DME vendor relationships today. We've had exploratory conversations with adjacent platforms for competitive and partnership intelligence, but no direct vendor partnership exists yet.

## 3. Vendor Cold-Start Design Philosophy & Judging Weight

*"Do you want us to treat vendor recruitment as a first-class product, or is a believable hospice-side board enough if vendor participation is simulated?" / "Should we design for vendors who adopt a portal, or vendors who never log in at all?" / "How much judging weight sits on vendor recruitment/onboarding vs. the hospice-side experience?"*

The hard part on the vendor side is building the network itself (recruiting and activating vendors) not designing a good interface for them. Network-building is out of scope for a weekend hackathon; treat vendor participation as an assumed, given condition rather than something to solve.

Design for a vendor who may never log into anything and only ever responds via a confirmation email or text (SMS/magic-link style) as the baseline. Portal adoption is a reasonable stretch goal, not a requirement.

Judging weight sits primarily on the hospice-side experience, since that's where we have real discovery data to evaluate against. The vendor side earns bonus credit for either: (a) a lightweight, no-login-required vendor UX, or (b) a well-reasoned case for why no vendor UI is needed at all (e.g., status inferred from delivery/EMR events rather than requiring vendor input). Both are legitimate paths, we aren't scoring down for choosing "no UI."

## 4. eRx Integration & Data Availability

*"Does BetterRX's eRx integration already receive patient status events from the EMR (admission, discharge, death)?"*

Yes. BetterRX's eRx integration already receives these patient status events today. Teams can treat this as existing infrastructure. A DME workflow can reliably key off the same admission/discharge/death signals that already drive medication workflows.

*"Does BetterRX hold any real delivery timestamp history in production, including from medication delivery?"*

No. BetterRX does not currently receive or store delivery status data for DME. We do in limited cases for medications where the pharmacy side integration is available. Any solution should assume DME delivery status is a new capability to be built, not something available in production now. We see this as a well-scoped opportunity: the medication side already proves out the pattern for structured event capture, so extending it to delivery events is a natural next step rather than a new paradigm.

*"Is there a sample schema of a BetterRX eRx patient/medication record?"*

Yes, representative JSON payloads reflecting BetterRX's actual eRx data model are below: one for patient/demographic events, one for medication events. Use these as the basis for how a DME-alongside-medication integration would read and write patient context.

### Patient / Demographics Event (`newOrUpdatePatient`)

```json
{
  "meta": {
    "eventType": "newOrUpdatePatient"
  },
  "account": {
    "identifiers": [
      { "id": "testAccountId" }
    ]
  },
  "patient": {
    "identifiers": [
      { "id": "testPatientId", "idType": "testPatientIdType" }
    ],
    "demographics": {
      "firstName": "Donald",
      "lastName": "Tester",
      "dob": "1960-01-14",
      "gender": "M",
      "ssn": "123-35-3752",
      "medRecNo": "1234567890",
      "phone": "123-456-7890",
      "address": {
        "street1": "testStreet1",
        "street2": "testStreet2",
        "city": "testCity",
        "state": "testState",
        "zip": "testZip",
        "country": "USA"
      },
      "diagnoses": [
        { "codeType": "icd10Code", "code": "C90.00", "isPrimary": true }
      ],
      "allergies": [
        { "description": "Latex" }
      ]
    }
  }
}
```

### Medication Event (`newMedications`)

```json
{
  "meta": {
    "eventType": "newMedications"
  },
  "account": {
    "identifiers": [
      { "id": "testAccountId" }
    ]
  },
  "patient": {
    "identifiers": [
      { "id": "testPatientId", "idType": "testPatientIdType" }
    ],
    "medications": [
      {
        "externalId": "0b307548-2c46-4b40-8b16-bb5501f5d6c5",
        "product": {
          "codeType": "NDC",
          "code": "00054051741",
          "name": "MORPHINE CONCENTRATE 100 MG/5 ML (20 MG/ML) ORAL SOLUTION"
        },
        "sig": "TAKE 0.25ML BY MOUTH FOR MODERATE PAIN RATING OF 4-7/10. IF NOT RELIEVED, MAY REPEAT 0.25 ML EVERY 60 MINUTES, CALL HOSPICE IF INEFFECTIVE.",
        "physician": {
          "identifier": { "id": "1497771109", "idType": "npi" }
        }
      },
      {
        "externalId": "1e37f8c1-522e-460a-b795-7de9207438cb",
        "product": {
          "codeType": "NDC",
          "code": "00054051741",
          "name": "MORPHINE CONCENTRATE 100 MG/5 ML (20 MG/ML) ORAL SOLUTION"
        },
        "sig": "TAKE 1 ML BY MOUTH EVERY HOUR AS NEEDED FOR MODERATE PAIN NOT RELIEVED BY 0.5 ML OR FOR SEVERE PAIN RATING OF 8-10/10.",
        "physician": {
          "identifier": { "id": "1497771109", "idType": "npi" }
        }
      }
    ]
  }
}
```

## 5. Vendor Economics — Who Pays

*"Who pays for this — the hospice, the vendor, or BetterRX on a spread?" / "We'd bet you've already debated who pays on the vendor side — where did you land?"*

The hospice pays a per-patient-day (PPD) fee, which can be bundled with the existing pharmacy tech PPD BetterRX already charges today.

## 6. Risk Scoring & Available Data

*"Will any anonymized vendor-performance or delivery-timing data be available Friday, or is it synthetic-only?"*

No proprietary or anonymized delivery-timing data will be available, this doesn't exist in a shareable form today (see Section 5). We looked into what public data could help: CMS's DMEPOS Public Use Files (data.cms.gov) provide Medicare claims-based utilization and payment data by referring provider, supplier, and equipment category (wheelchairs, oxygen, hospital beds, etc.), dating back to 2013. This is a legitimate public baseline for typical utilization and cost patterns. It does not include delivery timing or fulfillment data. CMS claims reflect billing, not logistics, so timeliness/reliability scoring will need to rest on synthetic data or clearly stated assumptions.

*"For the AI ROI criterion, will risk scoring be judged on approach and honesty about the baseline, or on measured accuracy against a dataset?"*

Approach and honesty about the baseline. There's no held-out dataset to measure accuracy against, so it would be misleading to judge on precision. We'd rather see a well-reasoned model built on CMS utilization data and clearly labeled assumptions than manufactured precision.

## 7. Delivery Windows & Service-Level Definitions

*"Is there a defined delivery window per order type, or is it whatever 'as soon as practicable' means that day?"*

There is no formally defined delivery-window standard today. BetterRX doesn't hold DME vendor contracts, so this hasn't been codified. That said, industry practice is a reasonable starting assumption: DME is typically expected same-day for urgent/STAT items (e.g., hospital bed or oxygen at admission) and within 24 hours for routine items. Teams are encouraged to design against a same-day-of-admission standard for urgent equipment, with a defined (even if configurable) SLA for routine orders, and to state that assumption explicitly rather than treat it as a solved input.

## 8. Pickup Trigger

*"Is an EMR status change actually fast enough, or does the trigger belong in the nurse's hand while she's still in the home?"*

A direct trigger from the nurse in the field at the time of death or discharge is the preferred design, rather than relying solely on EMR status propagation. We've seen the EMR-only path fail in practice: our own discovery interviews surfaced a case where a patient's death didn't reach the DME vendor's system in time for pickup. Both paths should be supported: nurse-initiated as the primary, faster signal, with EMR-based status as a redundant fallback.

## 9. Equipment Condition & Vendor Verification

*"Is there a vendor interaction component requested to verify the quality, preparedness, and condition of DME delivered? It was stated as a core problem but seemed to be backgrounded from there."*

You're reading the discovery data correctly, equipment condition and cleanliness is a real, recurring pain point (hospice execs cited broken wheelchairs, and in one case a chair with visible contamination as service failures). It is not currently scoped as a required feature in the brief, so teams are not obligated to solve it. That said, a thoughtful design for a quality/condition verification step such as whether pre-delivery attestation, post-delivery confirmation, or a lightweight photo/checklist flow would be viewed as a strong differentiator given how strongly this pain shows up in the underlying interviews.

*"Is there anticipated to be a live inventory API for the vendor system to verify inventory prior to the hospice operator selecting that org for the order?"*

Unlikely to be available in practice, given BetterRX has no live DME vendor network today. That said, we'd encourage teams to design for the option. Architecting the ordering flow so a real-time inventory check could be added later with a graceful fallback to a price/service-based experience when live inventory isn't available. This kind of forward-compatible design is exactly the kind of thinking we value most in judging.

## 10. Post-Hackathon Path

*"What happens to the winning idea after Saturday?"*

BetterRX will review winning submissions for production quality and intends to use the work (in part or in whole) as a foundation for a future DME product. This is a genuine opportunity for hackathon work to directly influence our roadmap, not just an exercise.
