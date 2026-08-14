# Backend Lane — Design Spec

Design only — no code until the event. On build day this converts to `shared/types.ts` + `server/` in roughly the order of the checklist at the bottom.

---

## 1 · Data model

**patients** — `id`, `name`, `status` (`active` | `discharged` | `deceased`), `address`, `market`

**vendors** — `id`, `name`, `phone`, `channel` (`sms` | `email` | `portal`), `service_area`, `contact_name`

**vendor_stats** *(data lane owns content; backend owns shape)* — `vendor_id`, `hcpcs_code`, `day_of_week`, `on_time_rate`, `avg_delivery_hours`, `sample_size`

**orders** — `id`, `patient_id`, `vendor_id`, `hcpcs_code`, `equipment_name`, `quantity`, `urgency` (`routine` | `urgent` | `stat`), `target_at` (delivery deadline / discharge time), `state`, `eta_at` (nullable), `risk_score` (0–100, nullable), `risk_reasons` (JSON array of strings), `created_at`

**order_events** — `id`, `order_id`, `type`, `payload` (JSON), `actor` (`hospice` | `vendor` | `driver` | `system` | `ai`), `created_at`. Append-only; every state change writes one; SSE broadcasts each insert.

**messages** — `id`, `order_id` (nullable — AI may have to infer which order), `vendor_id`, `direction` (`in` | `out`), `body`, `parsed` (JSON, nullable), `confidence` (0–1, nullable), `review_status` (`auto_applied` | `needs_review` | `confirmed` | `rejected`, nullable for outbound), `created_at`

**escalations** — `id`, `order_id`, `reason`, `status` (`open` | `acked` | `resolved`), `created_at`

**pods** — `order_id`, `kind` (`delivery` | `pickup`), `photo_path`, `signature_path`, `captured_at`

## 2 · Order state machine

States (linear, mirrors the brief's lifecycle):

```
ordered → dispatched → in_transit → delivered → pickup_pending → picked_up
                                                      ↓
                                               pickup_overdue → picked_up
(cancelled reachable from any pre-delivered state)
```

**Design decision: `at_risk` is a flag, not a state.** The brief draws "In Transit / At Risk" as one stage. Risk is computed (score + threshold) and can appear or clear at any active state without disturbing the lifecycle — a state machine with risk-states doubles the transition table for no gain. The board renders the flag as the red treatment on whatever column the order is in.

Transition table (event type → allowed from → to):

| Event | From | To | Actor |
|---|---|---|---|
| `order_placed` | — | `ordered` | hospice |
| `vendor_accepted` | ordered | `dispatched` | vendor/ai |
| `eta_set` | dispatched, in_transit | (no change; sets `eta_at`) | vendor/ai |
| `out_for_delivery` | dispatched | `in_transit` | vendor/ai/driver |
| `delivered` | in_transit, dispatched | `delivered` | driver (with POD) |
| `pickup_triggered` | delivered | `pickup_pending` | system (EMR webhook) or hospice |
| `pickup_overdue` | pickup_pending | `pickup_overdue` | system (watchdog) |
| `picked_up` | pickup_pending, pickup_overdue | `picked_up` | driver (with POD) |
| `vendor_swapped` | ordered, dispatched, in_transit | `ordered` (new vendor, history kept) | hospice |
| `cancelled` | any pre-delivered | `cancelled` | hospice |
| `risk_updated` | any active | (no change; sets `risk_score`/`risk_reasons`) | system |

Invalid transitions → 409 with a message naming the current state. One `transition(orderId, event)` function owns all of this; routes never mutate state directly.

## 3 · API surface

Hospice:
- `POST /api/orders` — `{patient_id, vendor_id, hcpcs_code, quantity, urgency, target_at}`
- `GET /api/orders` (+ `?state=`), `GET /api/orders/:id` (order + events + messages + escalations)
- `POST /api/orders/:id/swap-vendor` — `{vendor_id}` (scenario 1 climax)
- `POST /api/orders/:id/cancel`
- `GET /api/patients`, `GET /api/vendors` (with stats summary for the picker)

Simulated EMR:
- `POST /api/emr/patient-status` — `{patient_id, status}`; `deceased`/`discharged` auto-creates pickup jobs for all delivered equipment (scenario 2 trigger)

Messaging:
- `POST /api/messages/inbound` — `{vendor_id, body}` (the fake-SMS webhook; the vendor-phone simulator page posts here)
- `GET /api/messages?review_status=needs_review` — human-confirm queue
- `POST /api/messages/:id/confirm` (optionally with edited parse) / `POST /api/messages/:id/reject`
- Outbound sends are side effects of transitions (order placed → order-request message; pickup triggered → pickup-request message), written to `messages` with `direction: 'out'` and shown in the simulator thread.

Driver:
- `GET /api/driver/jobs?vendor_id=` — today's deliveries + pickups
- `POST /api/orders/:id/pod` — `{kind, photo_data_url, signature_data_url}` → files to disk, fires `delivered`/`picked_up`

Escalations:
- `GET /api/escalations?status=open`, `POST /api/escalations/:id/ack`

Existing from skeleton: `GET /api/health`, `GET /api/events` (SSE). Every `order_events` insert and every escalation broadcasts over SSE.

## 4 · Message pipeline (the AI story)

**Outbound templates** (plain functions, no AI):
- Order request: "JobNimbus Hospice: New order #{{ref}} — {{equipment}} for delivery by {{deadline}} to {{area}}. Reply YES to accept, or with your ETA."
- Pickup request: "Pickup needed for order #{{ref}} ({{equipment}}). Family present — please schedule promptly and reply with your window."

**Inbound parse** — `extractJson` with this schema:

```
{
  order_ref: string | null,        // e.g. "1042" if the message names one
  intent: 'accept' | 'eta_update' | 'delay' | 'out_for_delivery'
        | 'delivered' | 'pickup_scheduled' | 'picked_up'
        | 'decline' | 'unknown',
  eta_iso: string | null,          // resolved to ISO from "tomorrow morning" etc.
  notes: string | null,
  confidence: number               // 0–1, model's own calibration
}
```

System prompt gets: current datetime (for resolving "Thursday AM"), the vendor's open orders (ref + equipment + state) so the model can match an unreferenced message, and instructions to set `intent: 'unknown'` + low confidence rather than guess.

**Confidence gate:** ≥ 0.8 AND `order_ref` resolved → auto-apply the mapped event (actor `ai`), message marked `auto_applied`. Otherwise → `needs_review`; the hospice dashboard queue shows the raw text + proposed parse; confirm applies it (actor `hospice`), reject just archives. **This queue IS the AI-safety answer in deliverable B — make it visible in the demo.**

Intent → event mapping: `accept`→`vendor_accepted`, `eta_update`→`eta_set`, `out_for_delivery`→`out_for_delivery`, `delivered`→`delivered` (no POD — flag it), `pickup_scheduled`→`eta_set` on the pickup, `picked_up`→`picked_up`, `delay`→`eta_set` + immediate risk recompute, `decline`→escalation.

**Parse test set** (write as actual test cases at the event):
| Inbound text | Expected |
|---|---|
| "yes we got it, bed will be there thurs by 10am" | accept + eta, high conf |
| "running behind, probably late afternoon now" | delay, eta fuzzy, needs order match from context |
| "dropped off the O2 and bed at the house, daughter signed" | delivered, high conf |
| "we can grab the equipment friday" | pickup_scheduled, conf depends on open pickups |
| "who is this?" | unknown, low conf → review queue |
| "cant do it this week, truck's down" | decline → escalation |

## 5 · Risk + watchdog (interface with data lane)

- Data lane delivers `computeRisk(order, vendorStats, now) → {score, reasons[]}` as a pure function. Backend calls it on every order event and on a 30s interval tick for active orders; writes `risk_updated` events only when score crosses into/out of threshold or changes materially.
- Threshold (e.g. ≥ 70) → create escalation (`reason` = joined risk reasons) if none open.
- Pickup watchdog: same interval tick; `pickup_pending` older than window (config, e.g. 24h — demo seeds compress this) → `pickup_overdue` + escalation.

## 6 · Seeder contract (data lane)

- `npm run seed -- scenario1|scenario2|scenario3|full` → resets DB (reuse `db:reset`) and loads the exact starting state per demo scenario.
- Scenario clocks: seed timestamps relative to `Date.now()` so "discharge tomorrow 9am" is always tomorrow 9am at demo time.

## 7 · Build-day order (backend lane)

1. `shared/types.ts` — states, event types, payloads, parse schema (written with the team at hour 0)
2. Schema DDL hand-off with data lane (they own the file; agree names above)
3. `transition()` + `POST/GET /api/orders` + SSE broadcast on event insert
4. EMR webhook + pickup auto-creation
5. Outbound templates + inbound parse endpoint + confidence gate + review endpoints
6. Risk hook + interval tick + escalations + watchdog
7. POD endpoint (files to disk)
8. Vendor-phone simulator page support is just `POST /api/messages/inbound` — FE renders the thread from `messages`

Cut order if behind: 7 simplifies to signature-only; 6's watchdog collapses into the risk tick; 5's confidence gate is the last thing to cut — it's the differentiator.
