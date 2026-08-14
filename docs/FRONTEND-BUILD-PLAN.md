# Frontend Build Plan — BetterRX DME Coordination App (agent-team execution)

> **Scope (confirmed):** Build repo = **`betterrx-hackathon-2026`**. Work is **frontend + design
> foundation only — the frontend is NOT gated by the backend.** Build the full UI as if the backend can
> provide anything; where data isn't served yet (vendor equipment location, cost pricing, approvals,
> evidence source), build against a **typed client mock/adapter** so it's swappable later. These agents
> make **no backend/schema changes**. **Component library: [shadcn/ui](https://ui.shadcn.com/)** (new-york
> style, themed to the BetterRX tokens below) — the Foundation agent installs it and our atoms become thin
> wrappers over its primitives. Vendor side gets the **full treatment: SMS/IVR + driver POD +
> magic-link status page + a DME vendor portal** (all their equipment and where each piece is).

## Context

Team 1 was selected for the **BetterRX ($10K) hackathon bounty** — a hospice↔DME-vendor coordination
app. The working build lives in `betterrx-hackathon-2026/` (`kr3wangel/betterrx-hackathon-2026`, branch
`main`): Vite + React 19 + TypeScript + Tailwind v4 client, Express 5 + SQLite + SSE server. It already
ships three surfaces (`/hospice`, `/vendor`, `/driver`), a rules-based risk engine, and an SMS+Claude
vendor parse with a confidence gate.

This plan (built from three research passes: raw-brief requirements, current-frontend inventory, and a
BetterRX design-system study) covers the **frontend** work to satisfy the full requirement set, executed
by a **team of agents making small, frequently-committed changes straight to `main`**. Judging weight
sits primarily on the **hospice-side experience** (per the sponsor FAQ), so hospice personas lead — a
**Foundation agent** lands the design system + shared atoms first, then five surface lanes run in parallel.

Rubric (structure everything to earn these): Differentiation 30% · Core problems 25% · Architecture 15%
· AI-ROI 15% · UX 15%.

## Personas (frontend organizing principle — overlap expected)

- **Admissions / Ordering nurse** — places orders at intake (bed, O2); one-tap nurse-initiated pickup.
- **Case manager** — the `/hospice` board: lifecycle, risk flags, escalations, vendor swap, review queue; reorders on diagnosis change.
- **Director of Nursing (reporting)** — a `/reports` view: vendor scorecards, cost-of-care, "phone calls that never happened" metric, cost-threshold approvals.
- **DME vendor** — no-login channels (SMS/IVR reply + magic-link status page) for the demo-critical
  cold-start story, **plus a full vendor portal** (all equipment + where each piece is) as a richer surface.
- **Driver** — `/driver` POD capture (photo + signature) + condition checklist.

## Design system (dedicated agent — lands first, everyone builds on it)

BetterRX brand read (from betterrx.com/technology): **warm, human, confident** — a coral pill "betterRX"
logo, big rounded-bold headings, roomy whitespace over a warm off-white. Clinical-but-humane, with
warmth for end-of-life dignity. **Component library is [shadcn/ui](https://ui.shadcn.com/) (new-york
style)** — the Foundation agent runs `npx shadcn@latest init` and adds base components, then themes them
to the tokens below. Don't hand-roll primitives; wrap shadcn's.

**Finalized BetterRX palette (mapped onto shadcn's CSS variables in `client/src/index.css`):**
| Role | shadcn var | Hex | Use |
|---|---|---|---|
| Primary (coral) | `--primary` | `#E27B5E` (hover `#D2694C`, fg white) | CTAs, logo, eyebrows, brand accents |
| Secondary / dark (navy-slate) | `--secondary` | `#2C3A49` (fg white) | dark sections, secondary buttons, "in motion" status |
| Background (warm off-white) | `--background` | `#F7F5F3` | app canvas |
| Card / surface | `--card` | `#FFFFFF` | cards, surfaces, panels |
| Foreground / ink | `--foreground` | `#263240` | body + heading text |
| Muted foreground | `--muted-foreground` | `#5C6B75` | secondary text, timestamps |
| Border | `--border` | `#EBE7E3` | dividers, card borders |
| Destructive / at-risk | `--destructive` | `#CB3E3A` (distinct from coral) | risk ≥70, escalation, overdue |
| Success | *(token)* | `#3E9C6B` | delivered / picked up |
| Radius | `--radius` | `14px` | rounded, friendly |

**Typography:** display font `ui-rounded, "SF Pro Rounded", system-ui, sans-serif` (**heavy weights**) for
headings, counts, and patient names; body `system-ui`. **Coral uppercase letter-spaced eyebrows** above
section headers. Min 14px body on mobile. **Touch targets ≥44×44px**. Mobile-first → tablet 2–3 col →
desktop full board. (Reference: matches betterrx.com/technology.)

**Component tokens (via shadcn variants):** at-risk card = destructive border + subtle ring, reasons in
destructive text. Escalation banner = destructive border on a tinted destructive surface. Review queue =
muted/secondary-tinted surface. Route everything through shadcn's `Card`/`Button`/`Badge` so the tokens
stay the single source of truth.

**Plain-English status vocabulary (the on-screen rule — never show state-machine terms):**
`ordered`→"Ordered" · `dispatched`→**"Accepted"** · `in_transit`→**"On the truck"** · `delivered`→
"Delivered" · `pickup_pending`→**"Pickup pending"** · `pickup_overdue`→**"Pickup overdue"** ·
`picked_up`→"Picked up" · `cancelled`→"Cancelled". Source of truth stays `STATE_LABEL`/`STATE_TONE`
in `lib/domain.ts`. Fix the review-queue leak that renders raw `needs_review`/`auto_applied`.

**Copy register:** family-adjacent = respectful ("The family is grieving. Call ahead, be brief and
kind."); risk reasons = human sentences ("Vendor 2 is 62% on-time for beds on Fridays"), never `k=v`.

**Tailwind v4 + shadcn encoding (IMPORTANT — no JS config exists):** the stack is **Tailwind v4 + React 19
+ Vite**, so shadcn's CSS-variables theme goes in a `@theme`/`:root` block in `client/src/index.css` — do
**not** create `tailwind.config.ts`. Use a shadcn version that supports Tailwind v4. Configure
`components.json` and path aliases (`@/components`, `@/lib`, `@/hooks`) for the Vite client. Route all
buttons/cards/badges/status through shadcn primitives (themed to the tokens) so agents never hardcode.

## Requirements → frontend task map

Rubric reality: **~70% of scoring is hospice-side** (Differentiation 30 + Core problems 25 + UX 15).
Build the `/hospice` board + escalation flow first, then `/driver` POD, then `/reports`. Vendor side is
table stakes (SMS parse + driver link), **not** the differentiator (FAQ correction). The 3 demo
scenarios are the north star — they define which surfaces must exist.

### Table stakes (required to score)
- `/hospice` **board**: live order cards — patient, equipment, order#, stage, vendor, ETA, urgency badge; **risk flag (red/amber/green) with a human-readable reason** ("Vendor is 72% on-time for beds on this weekday; deadline in 16h").
- **Escalation banner** at risk ≥70 + **one-click vendor swap** (resets to `ordered`, new SMS).
- **Review queue** pane on `/hospice` for <0.8-confidence parses (approve/reject).
- **Per-order timeline**: append-only events + inbound/outbound SMS log, each message tagged **[VERIFIED]** (POD) vs **[VENDOR-REPORTED]** (text/keypress).
- **POD display**: photo/signature thumbnails + timestamp on the expanded card.
- `/order` **admissions form**: patient lookup, HCPCS equipment select (E0260/E0250/E1130/E0601/E1390), qty, urgency (STAT/Urgent/Routine), target date, vendor pick — **sub-60s, phone + desktop**.
- `/driver` **POD capture**: photo + signature + timestamp (magic-link, no login).
- **EMR simulator** control (button to mark patient deceased/discharged → auto pickup).
- **Nurse-initiated pickup** one-tap (PRIMARY trigger per FAQ §8; EMR is fallback).
- **Persona labeling** on each surface.

### Strong differentiators (bonus credit)
- `/reports` **DON view**: vendor scorecards (on-time by equipment×weekday), open-escalation age, pickup latency, **cost-of-care (DME beside med spend)**, and the **"phone calls that never happened" counter** (north-star metric on screen).
- **Condition attestation** on `/driver` POD: 3 checkboxes (clean / functional / patient-ready) — FAQ §9 differentiator.
- **Verified-vs-reported badges** everywhere a status shows; a vendor text never clears an at-risk flag in the final hours — only POD or a case-manager action does.
- **Cost-threshold approval** routed to DON (approval-pending state on card; optional `/approvals` queue). **← gap: not in current docs.**
- **Magic-link vendor portal + status page** — backend landed (`/api/portal/:token`); build the UI.
- ~~IVR/press-1 vendor channel~~ — **shelved for the demo** (team decision).

### Demo-scenario surface needs
- **S1 Discharge readiness**: `/hospice` red card risk=81 + reason → swap vendor → `/vendor` reply → board flips live (SSE).
- **S2 Post-death pickup**: `/hospice` + EMR-sim "Mark Deceased" → auto pickup → `/driver` job w/ respectful note → photo+signature+condition → `picked_up` + family-notified event.
- **S3 Cold-start vendor**: `/vendor` free-text → parse → auto-apply (high conf) vs **review queue** (low conf) vs **escalation** (decline) live on `/hospice`.

### Gaps the requirements agent flagged (not yet in build docs)
1. **Cost-threshold approval workflow** (DON) — no UI exists.
2. **EMR-simulator button** — needed for S2, confirm it's wired on `/hospice`.
3. **Condition attestation checkboxes** — task exists, UI not built.
4. **`/reports` DON view** — known missing surface.
5. **Cost widget + CMS HCPCS pricing** — pricing data blocks it.

## Current frontend state & gaps

**Stack:** Vite + React 19 + Router 7 + Tailwind **v4** (via `@tailwindcss/vite`; **no config file**, utilities
only, `index.css` is just `@import "tailwindcss"`). Data flow: `useEventStream` (SSE `/api/events`) →
`useLive(loadFn)` refetches on every broadcast. `api.ts` fetch client. `shared/types.ts` is the contract.

**Built & complete:** `/hospice` (6-col board, new-order form, AI review queue, EMR simulator),
`/vendor` (dispatcher + phone/SMS simulator), `/driver` (jobs + POD photo+signature).
**Atoms:** `components/ui.tsx` = `Button` (primary/secondary/danger), `Card`, `Badge` (gray/green/
yellow/red/blue). **Key components:** `OrderCard.tsx`, `PhotoInput.tsx` (camera), `SignaturePad.tsx`.
**Domain map:** `lib/domain.ts` = `CATALOG` (4 HCPCS), `STATE_LABEL`, `STATE_TONE`, `BOARD_COLUMNS`.

**Recipe to add a surface** (no test burden — "UI stays test-free"): new `pages/X.tsx` using
`useLive`+`api`+shadcn primitives/atoms → add `<Route>`+`NavLink` in `App.tsx` → ensure the backend route
broadcasts SSE so `useLive` refetches. Build with shadcn/ui components (themed to the BetterRX tokens);
Tailwind utilities for layout. Commit straight to `main`, `git pull --rebase` first.

**Confirmed gaps (frontend):**
1. `/reports` DON view — **not built** (data exists: `vendor_stats`, escalations, order history).
2. **Verified-vs-vendor-reported badges** — not built (a text applies same as a POD today).
3. **Nurse-initiated pickup** phone UI — only EMR-sim path exists; need the nurse-in-home tap (S2 lead).
4. **Condition checklist on POD** — POD captures photo+signature only; no attestation.
5. **Cost-of-care widget** — not built; blocked on CMS HCPCS pricing table.
6. **POD photo/signature display** — captured & saved to `data/pods/`, served at `/api/pods/…`, but never shown on the card.
7. **IVR/press-1 channel** — SMS-only today; spec in `docs/IVR-SIM-SPEC.md`, not wired.
8. **Persona labels** on each surface — not present.
9. Small copy leaks: review-queue badges show raw enums (`auto_applied`, `needs_review`); expand CATALOG/world.

**Gotchas:** `RISK_THRESHOLD = 70` is duplicated in `OrderCard.tsx` and `server/risk.ts` (keep in sync).
All order mutations go through `server/statemachine.ts:applyEvent()` (never `UPDATE` directly). Confidence
gate ≥0.8 is the AI-safety story — don't bypass. `shared/types.ts` first when the contract changes.

## The vendor status-update question (the crux)

*"How do DME vendors update the status of a DME order?"* — this is the piece the hospice can't see
today, and capturing it structurally **is** the product. The answer is a **zero-install, no-login
ladder** (from PROBLEM-THESIS), so the vendor never adopts software:

1. **Reply to a text** (SMS) → Claude parses "on the truck, there by 10" → status + ETA (confidence
   gate: ≥0.8 auto-applies, else review queue). *(built)*
2. ~~Press 1 on an automated call (IVR)~~ — **shelved for the demo** (team decision, commit `b1497a1`).
   De-scoped from this plan; `docs/IVR-SIM-SPEC.md` stays as a "production path" reference.
3. **Tap a magic link** → mobile driver page: photo + signature + timestamp at the door (**verified**
   proof). *(built as `/driver`)*. The **nurse-primary pickup trigger backend landed**
   (`POST /api/patients/:id/status`), so the death/discharge signal no longer waits on the EMR.
4. **Magic-link vendor portal / status page** — ✅ **backend already landed** (`server/portal.ts`):
   `GET /api/portal/:token` → vendor + their orders; `POST …/orders/:id/confirm|eta|decline` for
   one-tap updates; portal links ride the outbound SMS templates. **Lanes C & E are frontend-only
   against these real endpoints** — not mocks.

**Decision (confirmed):** build the vendor experience in full — SMS reply (built), driver POD magic
link (built), the **magic-link status page** (Accept / On the way / Delivered + ETA, wiring to the real
portal confirm/eta/decline routes), condition checklist, and verified-vs-reported badges — **plus the
full DME vendor portal** (`GET /api/portal/:token`) showing all the vendor's orders and, enriched, where
each piece of equipment is. IVR is shelved. Only the *serialized-inventory / per-unit-location*
enrichment beyond what `/api/portal/:token` returns is mocked behind a typed adapter.

## Agent-team orchestration & commit strategy

**Model:** one **Foundation agent lands first (serialized gate)**, then **5 persona/surface lanes run in
parallel** with explicit file ownership to avoid `main` collisions. **Frontend + design only — no
backend/schema changes**, so there's no `db:reset`/schema-branch risk; agents wire to existing endpoints
and mock the rest behind a typed adapter. Every agent: one logical change per commit, conventional-commit
messages, straight to `main`. **Commit rules (repo git agreement, CLAUDE.md):** `git pull --rebase`
before pushing; **`npm test` before every push — never push red; main must always seed and boot** (the
demo runs off whatever main is at freeze). UI stays test-free; don't touch core-logic tests.

### Agent 0 — Design + frontend foundation (BLOCKING; lands before the rest)
Owns the hot/shared **client** files so feature lanes don't collide on them. **No `shared/types.ts` DB
schema changes** — view-model types live client-side:
- **Install shadcn/ui**: `npx shadcn@latest init` (new-york style; Tailwind-v4-compatible version — theme
  is CSS vars in `client/src/index.css`, not `tailwind.config.ts`); configure `components.json` + Vite
  aliases (`@/components`, `@/lib`, `@/hooks`); add base components: `button card badge dialog input select
  checkbox table tabs sonner skeleton separator avatar tooltip` under `client/src/components/ui/`.
- `client/src/index.css`: map the BetterRX tokens onto shadcn's CSS variables (`--primary` coral,
  `--secondary` navy-slate, `--destructive`, `--background`, `--card`, `--muted`, `--border`, `--radius`
  14px, display font). `components/ui.tsx`: shared atoms as **thin wrappers/variants over shadcn** —
  `StatusPill` + `EvidenceBadge` (`Badge` variants, plain-English / verified-vs-reported), `RiskBadge`
  (`Badge`), `PersonaHeader`, `ConditionChecklist` (shadcn `Checkbox` rows), empty-states. `lib/domain.ts`:
  fix raw-enum leaks, confirm labels.
- **`lib/mocks.ts` + client view-model types**: the typed adapter/mocks for data the backend doesn't
  serve yet (vendor serialized inventory + per-unit location, CMS HCPCS pricing, cost-threshold
  approvals, message `evidence_source`). One import surface so every lane builds a complete UI without
  waiting on backend — and swapping a mock for a real fetch later is a one-line change.
- `App.tsx`: add routes + nav for `/order`, `/reports`, `/vendor-portal`, and the nurse pickup surface,
  committing **stub pages** so lanes just fill them. Add **persona labels** to the 3 existing surfaces.

### Lane A — Case manager / hospice board *(highest value; ~70% weight)* — owns `Hospice.tsx`, `OrderCard.tsx`
*(Build with shadcn/ui components — Card, Button, Badge, Dialog, Table, Tabs, Select, Input, Checkbox, Sonner.)*
- **"Needs attention" band** at the top: at-risk orders / ones about to miss a deadline, surfaced above
  the columns *(user idea)*. Below it, the live order/patient list *(user idea)*.
- Verified-vs-reported `EvidenceBadge` on the message/timeline; a vendor text never clears an at-risk
  flag in the final hours — only POD or a case-manager action does.
- POD photo/signature thumbnails on the expanded card. Escalation banner + vendor-swap polish; legible
  risk reasons.

### Lane B — Admissions/ordering nurse — owns new `pages/Order.tsx`, nurse-pickup surface
*(Build with shadcn/ui components — Card, Button, Badge, Dialog, Table, Tabs, Select, Input, Checkbox, Sonner.)*
- **`/order`** phone-friendly placement form *(user idea)*: patient lookup, HCPCS select, urgency, target
  date, vendor — sub-60s.
- **Nurse-initiated pickup** one-tap mobile surface. ✅ **Backend already exists** (team just landed
  `server/pickups.ts` + `POST /api/patients/:id/status`, actor `hospice`, primary trigger; events carry
  `payload.source:'nurse'`). **This lane is now frontend-only** — a phone surface that POSTs there.

### Lane C — Driver + no-login vendor status — owns `Driver.tsx`, POD components, new `pages/VendorStatus.tsx`
*(Build with shadcn/ui components — Card, Button, Badge, Dialog, Table, Tabs, Select, Input, Checkbox, Sonner.)*
- **Condition attestation** 3-checkbox on POD (clean/functional/patient-ready) — via foundation's
  `ConditionChecklist`; show it back on the order card.
- POD polish; phone-LAN access (`host:true` in `client/vite.config.ts`); respectful pickup copy.
- The **magic-link no-login vendor status page** at `/portal/:token`: big **Accept / On the way /
  Delivered** buttons + ETA entry, wired to the **real** `GET /api/portal/:token` +
  `POST …/orders/:id/confirm|eta|decline` routes.

### Lane D — Director of Nursing `/reports` — owns new `pages/Reports.tsx`
*(Build with shadcn/ui components — Card, Button, Badge, Dialog, Table, Tabs, Select, Input, Checkbox, Sonner.)*
- Vendor scorecards from `vendor_stats`, open-escalation age, pickup latency, **cost-of-care** (DME +
  med spend via mock CMS HCPCS pricing), and the **"phone calls that never happened" counter**.
- Cost-threshold approval surface (approval-pending via shared atom + `lib/mocks.ts`, no `OrderCard` edit).

### Lane E — DME vendor portal — owns new `pages/VendorPortal.tsx` *(user-requested)*
*(Build with shadcn/ui components — Card, Button, Badge, Dialog, Table, Tabs, Select, Input, Checkbox, Sonner.)*
- The "one place to see my orders" surface, fed by the **real** `GET /api/portal/:token`. Enrich into
  **all the vendor's equipment and where each piece is** — serialized inventory (in stock / out for
  delivery / at patient / overdue for pickup), per-unit location/status tied to orders, delivery+pickup
  queue, SLA-vs-actual. Order data is real; **mock only the serialized-inventory + location enrichment**
  via `lib/mocks.ts`. (Lane C's status page and Lane E's portal share the `/portal/:token` data source —
  coordinate on a shared `usePortal(token)` hook from the Foundation layer.)

**Dependency ordering:** Agent 0 → then A/B/C/D/E in parallel. No backend touchpoints — lanes wire to
existing endpoints or `lib/mocks.ts`. The shared atom/mock/type from Agent 0 is the seam when two lanes
reference the same concept.

## Verification
- `npm run dev` (server :3001 + client :5173); `npm run seed scenario1|2|3` to load demo states.
- **Walk the 3 demo scenarios end-to-end** (the real acceptance test): S1 discharge-readiness swap, S2
  post-death pickup with condition capture, S3 cold-start vendor parse → review queue → escalation.
- `npm test` green (state machine, risk, messaging). `npm run typecheck`. `npm run build`.
- Phone on venue LAN hits `/driver` + camera. Spot-check plain-English labels (no raw states on screen)
  and verified-vs-reported badges. Each lane self-verifies its scenario beat before the next commit.
