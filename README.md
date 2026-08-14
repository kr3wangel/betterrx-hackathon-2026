# betterrx-hackathon-2026

BetterRX DME bounty — Builder Day 2026. Hospice ↔ DME vendor coordination: shared order visibility from admission to pickup, with a vendor channel that works over plain SMS (LLM-parsed) so vendors need zero software.

## Stack

- **Client**: Vite + React 19 + TypeScript + Tailwind v4 + React Router
- **Server**: Express 5 + better-sqlite3 (WAL) + Server-Sent Events
- **AI**: Claude (`@anthropic-ai/sdk`) — parses free-text vendor replies into structured order events; needs `ANTHROPIC_API_KEY`

## Quickstart

```bash
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY (app runs without it; message parsing falls back to the review queue)
npm run seed           # synthetic world: patients, vendors, vendor stats, orders
npm run dev            # server :3001, client :5173
```

`npm run seed scenario1|scenario2|scenario3` puts the DB in a specific demo starting state. `npm run db:reset` wipes everything.

## Domain model

Order lifecycle (risk is a computed flag, not a state):

```
ordered → dispatched → in_transit → delivered → pickup_pending → picked_up
                                                     ↓
                                              pickup_overdue → picked_up
```

- `server/statemachine.ts` — `applyEvent()` owns every transition; each one appends to `order_events` and broadcasts over SSE
- `server/risk.ts` — rules-based risk scoring with human-readable reasons (deliberately not ML: explainable, tunable)
- `server/messaging.ts` — outbound SMS templates + inbound parse via Claude with a confidence gate: ≥0.8 auto-applies, below that lands in a human review queue
- `server/watchdog.ts` — 30s tick: recomputes risk, escalates threshold crossings, flags overdue pickups

## API

| Route | What |
|---|---|
| `POST /api/orders` · `GET /api/orders[?state=]` · `GET /api/orders/:id` | Orders (detail includes events, messages, escalations, PODs) |
| `POST /api/orders/:id/swap-vendor` · `/cancel` · `/events` | Actions |
| `POST /api/orders/:id/pod` | Proof of delivery/pickup (photo + signature data URLs) |
| `POST /api/emr/patient-status` | Simulated EMR webhook — death/discharge auto-triggers pickups |
| `POST /api/messages/inbound` | Simulated vendor SMS webhook (the vendor-phone page posts here) |
| `GET /api/messages?review_status=needs_review` · `POST /api/messages/:id/confirm` · `/reject` | AI parse review queue |
| `GET /api/driver/jobs?vendor_id=` | Driver's deliveries + pickups |
| `GET /api/escalations` · `POST /api/escalations/:id/ack` | Escalations |
| `GET /api/events` | SSE stream (order events, escalations, messages, heartbeat) |

## Client

Three surfaces (placeholder pages to build out): hospice dashboard, vendor dispatch, driver mobile view. Shared pieces already in place: `useEventStream()`, `api` client, UI atoms, `SignaturePad` + `PhotoInput` (demo on `/three`).
