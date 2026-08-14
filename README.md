# betterrx-hackathon-2026

BetterRX DME bounty — Builder Day 2026. Currently just the generic bones (no domain code yet); everything domain-specific gets built during the event.

## Stack

- **Client**: Vite + React 19 + TypeScript + Tailwind v4 + React Router
- **Server**: Express 5 + better-sqlite3 (WAL) + Server-Sent Events
- **AI**: `@anthropic-ai/sdk` client helper (needs `ANTHROPIC_API_KEY`)

## Quickstart

```bash
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm run dev            # server on :3001, client on :5173
```

Open http://localhost:5173 — the header dot turns green when the SSE heartbeat from the server is flowing.

## Layout

```
client/   Vite app (proxies /api → :3001)
server/   Express API, SQLite (data/app.db, gitignored), SSE broadcast
shared/   types shared by client + server
```

## What's wired

- `GET /api/health` — server + db check
- `GET /api/events` — SSE stream; `broadcast(event)` in `server/sse.ts` pushes to all connected clients (heartbeat every 5s out of the box)
- `useEventStream()` — client hook consuming the stream
- `extractJson()` in `server/llm.ts` — structured JSON extraction via Claude (`output_config.format`), logs token usage per call
- `api.get/post/patch/del` in `client/src/lib/api.ts` — fetch wrapper with error handling
- UI atoms (`Button`, `Card`, `Badge`) in `client/src/components/ui.tsx`
- `SignaturePad` + `PhotoInput` capture components — demoed on `/three`
- `npm run db:reset` — wipe the SQLite file
- JSON error middleware on the server (Express 5 catches async throws natively)
- Three placeholder routes to rename (`/one`, `/two`, `/three`)
