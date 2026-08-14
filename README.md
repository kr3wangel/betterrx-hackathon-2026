# betterrx-hackathon-2026

BetterRX DME bounty — Builder Day 2026. Hospice ↔ DME vendor coordination: shared order visibility from admission to pickup, with a vendor channel that works over plain SMS (LLM-parsed) so vendors need zero software.

## Start here (team)

1. **Read `docs/PROBLEM-THESIS.md` first** — the why behind every design choice, both north stars, and the judge Q&A. Don't change scope or pitch content without it.
2. **`docs/BOUNTY-FAQ.md`** is the sponsor's written doctrine (every team received it) — judging weight, pickup-trigger preference, SLA assumptions, real eRx payloads.
3. **Claim work in `docs/BUILD-DAY-TASKS.md`** — put your name in the box. Sizes and demo-scenario tags are on each task.
4. Specs: `docs/BACKEND-SPEC.md` (architecture) · `docs/IVR-SIM-SPEC.md` (simulated call channel) · `docs/deliverables/` (submission drafts — keep in sync with reality).

### Working agreements

- Commit straight to `main`; `git pull --rebase` before pushing; `npm test` before every push (never push red — main must always seed and boot). Only changes that would break main for >1h get a short-lived, self-merged branch. Full detail in `CLAUDE.md`.
- Core logic (state machine, risk, parse/gate) is vitest-covered — keep `npm test` green and extend tests when you touch it. UI and routes stay test-free.
- UI language is plain-English per the north star ("Accepted", "On the truck" — never `dispatched`/`in_transit` on screen), and everything family-adjacent gets a respectful-tone pass.

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

Other commands: `npm test` (vitest — state machine, risk, messaging) · `npm run typecheck` · `npm run parse:test` (live Claude parse against the six spec messages; needs `ANTHROPIC_API_KEY`).

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

Three working surfaces in one React app, all live over SSE:

- `/hospice` — case-manager board: orders, risk flags, escalations, AI-parse review queue, EMR simulator
- `/vendor` — dispatcher board + vendor phone simulator (type a free-text reply, watch it parse)
- `/driver` — phone-sized: today's deliveries + pickups, POD capture (photo + signature)

Shared pieces: `useLive()` (SSE-driven refetch), `api` client, UI atoms, `SignaturePad` + `PhotoInput`.
