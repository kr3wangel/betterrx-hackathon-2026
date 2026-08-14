# betterrx-hackathon-2026

Hackathon entry (BetterRX DME bounty, Builder Day 2026): a coordination layer between hospices and DME vendors — shared order visibility from admission to equipment pickup, with a vendor channel that works over plain SMS parsed by Claude so vendors need zero software. Hackathon code: favor the smallest working change and demo-readiness — but the core logic (state machine, risk engine, message parse/gate) is vitest-covered; keep those tests passing (`npm test`) and extend them when you touch that logic. UI and routes stay test-free.

## Git workflow (3 people, one repo)

Work directly on `main`: `git pull --rebase` before pushing, run `npm test` before every push
(never push red — **main must always seed and boot**; the demo runs off whatever main is at code
freeze). Exception: a change that would leave main broken for more than ~an hour (e.g. a schema
change) rides a short-lived branch the author rebase-merges themselves the same session — no PR
ceremony, delete the branch after. Schema changes additionally get a "run
`npm run db:reset && npm run seed`" ping to the team (see Gotchas).

## Commands

```bash
npm run dev          # server :3001 (tsx watch) + client :5173 (vite), via concurrently
npm run seed         # reset-safe synthetic world; also: npm run seed scenario1|scenario2|scenario3
npm run db:reset     # delete the SQLite files (server recreates schema on boot)
npm run typecheck    # server+shared tsconfig, then client tsconfig
npm run build        # typecheck + vite build
```

`.env` (see `.env.example`): `ANTHROPIC_API_KEY` is **optional** — without it, inbound message parsing degrades gracefully to the human review queue. `PORT` (default 3001), `PICKUP_WINDOW_HOURS` (default 24).

## Architecture

- **`shared/types.ts` is the contract** between server and client. Change it first, then both sides.
- **All order mutations go through `applyEvent()` in `server/statemachine.ts`** — it validates the transition, updates the row, appends to `order_events` (append-only), and broadcasts over SSE. Never `UPDATE orders` directly from a route.
- Order lifecycle: `ordered → dispatched → in_transit → delivered → pickup_pending → picked_up`, with `pickup_overdue` off `pickup_pending` and `cancelled` from any pre-delivered state. **Risk is a flag (`risk_score`/`risk_reasons`), not a state.**
- `server/risk.ts` — deliberately rules-based (not ML): explainable scoring with human-readable reasons. Threshold 70 = `RISK_THRESHOLD`. ⚠️ duplicated as a local const in `client/src/components/OrderCard.tsx` — keep in sync.
- `server/messaging.ts` — outbound SMS templates fire as side effects of transitions; inbound goes through `extractJson()` (`server/llm.ts`, Claude with `output_config.format` JSON schema) with vendor's open orders as context. **Confidence gate: ≥ 0.8 with a resolved order auto-applies; otherwise → review queue** (`review_status = 'needs_review'`). This gate is the project's AI-safety story — don't bypass it.
- `server/watchdog.ts` — 30s tick: recompute risk, escalate threshold crossings, flag overdue pickups.
- `server/pickups.ts` — `setPatientStatus()` owns death/discharge → pickup triggering, shared by the nurse route (`POST /api/patients/:id/status`, actor `hospice`, the sponsor-preferred primary trigger) and the EMR webhook (`POST /api/emr/patient-status`, actor `system`, the redundant fallback). Events carry `payload.source: 'nurse' | 'emr'`.
- Client: three surfaces (`/hospice`, `/vendor`, `/driver`) in one React app. Pages fetch with `useLive()` (`client/src/lib/useLive.ts`), which refetches on every SSE event — no manual cache invalidation; after a POST the SSE broadcast triggers the refresh.
- SQLite via better-sqlite3 (synchronous API — no `await` on db calls). Timestamps are ISO-8601 UTC strings. JSON columns (`risk_reasons`, `payload`, `parsed`) are TEXT; use the `rowTo*` mappers in `server/store.ts`.

## Gotchas

- `broadcast()` takes the `ServerEvent` union minus `at` via a **distributive** omit (see `server/sse.ts`) — plain `Omit` over the union won't compile.
- Express 5 catches async route errors natively; the JSON error middleware in `server/index.ts` reads `err.status` (used by `TransitionError` 409s and not-found 404s).
- Seed timestamps are relative to `Date.now()` so demo deadlines are always in the near future — re-run `npm run seed scenarioN` right before each demo scenario.
- Vendor stats carry the deliberately planted risk signal (vendor 2 is 79% on-time; vendor 1 drops to 62% for Friday beds) — the risk engine only looks interesting because the data makes it so.
- POD photos/signatures are data URLs → files under `data/pods/` (gitignored), served at `/api/pods`.

## Team docs

`docs/PROBLEM-THESIS.md` is the why behind the design (the reporting-cost framing, the vendor adoption ladder, the integration asymmetry) — read it before changing scope or pitch content. `docs/BUILD-DAY-TASKS.md` is the shared task list (claim items by name). `docs/BACKEND-SPEC.md` is the architecture spec. `docs/deliverables/` holds the four submission drafts (AI approach, differentiation, integration sketch, demo script) — keep them in sync with reality as the build evolves.

## Demo scenarios (build everything toward these)

1. **Discharge readiness**: seed scenario1 → order at risk → escalation banner → swap vendor → delivered with POD.
2. **Post-death pickup**: seed scenario2 → EMR simulator marks patient deceased → pickup auto-appears on driver view → picked up with POD → family notified.
3. **Cold-start vendor**: seed scenario3 → type a plain-English reply in the vendor phone simulator → parsed to a structured event → order state changes live on the hospice board (or lands in the review queue when confidence is low).
