# Overnight Ship-Polish Implementation Plan (2026-08-14 → 15)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. One
> fresh worktree agent per task, orchestrated from the main session; steps use checkbox syntax.
> Authorities on disk: `docs/UX-AUDIT.md` (all finding details, file:line, fix sketches),
> `docs/GLOBAL-LOOP-CLOSING-SPEC.md` (wave 2), `docs/DESIGN-SYSTEM.md`, `docs/E2E-WALKTHROUGH.md`.

**Goal:** By morning, every UX-audit finding is fixed or explicitly parked, the loop-closing
build (narration, handoffs, front door) is live, and all three demo scenarios re-verify end to
end on a green, pushed `main`.

**Architecture:** Four sequential waves. Waves parallelize internally only across disjoint file
sets (tonight's collision lessons). Every wave ends: merge → full gates → pull/merge origin →
push. Main must never sit red.

**Tech stack:** Existing only — React 19 + Vite + Tailwind v4 + hand-authored shadcn primitives,
Express 5 + better-sqlite3, vitest. No new dependencies anywhere in this plan.

## Global constraints (every task inherits these)

- Gates for every task: `npm test` green · `npm run typecheck` clean · `npm run build` succeeds.
- NO `shadcn init/add`. No new npm deps. No legacy `client/src/components/ui.tsx` imports in new code.
- Plain-English on screen; PHI rules (no patient names on open channels); design tokens only.
- UI stays test-free EXCEPT the wave-2 narration decision function (pure lib, tested — per spec).
- Agents work in worktrees; worktrees branch from origin — every authority doc must be PUSHED
  before the wave that consumes it (wave 0 handles this).
- Convention docs: update `docs/FEATURES.md` / `docs/UX-FLOWS.md` when features/pages/flows change.
- `docs/UX-AUDIT.md` finding numbers below refer to that file's P0/P1 sections verbatim.
- Verify-first: teammates may push overnight; every task re-checks its finding still reproduces
  before fixing, and skips (with a note) if a teammate already fixed it.
- Commit style: existing imperative convention, no AI attribution.

## Orchestration policy (main session, overnight)

- **Push policy (amended by Angel):** NO pushes overnight. All merges stay on local `main`;
  Angel manually reviews in the morning before anything ships. Consequence: agent worktrees
  branch from origin, so every brief points at authority docs via the main checkout's absolute
  path (`/Users/angelherrera/code/personal/betterrx-hackathon-2026/docs/...`).
- **Failure policy:** if a merged wave goes red, one fix attempt; still red → `git revert` the
  merge, park the branch, log it, continue with independent work. Never leave main red.
- **Teammate collisions:** pull/merge before each push; their surfaces win on their files, this
  plan's tasks win on the files they were assigned; ambiguity → park + morning report.
- **Morning report:** waves completed, punch list of parked items, fresh gate results, and an
  updated `docs/UX-AUDIT.md` with fixed findings struck through.

---

## Wave 0 — Preflight (main session, inline, ~10 min)

- [ ] **0.1** Pull latest origin; run full gates; confirm green baseline.
- [ ] **0.2** Merge the `loop-spec` agent branch when it lands (`docs/GLOBAL-LOOP-CLOSING-SPEC.md`);
      if it has not landed by wave-1 completion, wave 2 blocks until it does.
- [ ] **0.3** Commit this plan; push plan + audit + spec so agent worktrees can see them.
- [ ] **0.4** Reseed full world; confirm dev server up (demo tabs stay usable overnight).

---

## Wave 1 — UX-audit fixes (three parallel agents, disjoint files)

### Task 1A: Board & detail fixes — agent `fix-board`
**Files:** `client/src/pages/Hospice.tsx`, `client/src/components/board/*` (RowDetail,
SwapVendorDialog, BoardRow), `client/src/lib/board.ts`, `client/src/lib/useLive.ts` (board-scoped
error surface only).
**Findings (UX-AUDIT):** P0 #1 (no false "all clear" before load — skeletons gated on loaded
data), P0 #2 board-slice (fetch failure renders a visible "can't reach the server" state on the
board — smallest honest mechanism, e.g. `useLive` exposing an `error` flag consumed here), P0 #3
(render `detail.escalations[].reason` in RowDetail — the scenario-3 climax sentence), P0 #8
(SwapVendorDialog: await + pending-disable + failure toast + close on success only — copy
`VendorPortal`'s `act()` pattern, cited in the audit as the exemplar), P1 B (board rows
keyboard-accessible: real buttons or role+tabIndex+Enter/Space, plus an `aria-live="polite"`
region announcing section-count changes), P1 C (`ROW_GRID` gets `minmax(0,…)` + truncate so long
names can't blow out rows at 640–768px), top-10 #10 ("1 are still waiting on a photo" plural +
zero-completions branch on the Done line).
**Verification:** gates; boot + seed scenario1: no all-clear flash (assert skeleton markup in
first render), kill server → board shows the error state; escalation sentence visible in an
at-risk row's detail; swap failure (curl a 400 path) leaves dialog open with toast.

### Task 1B: Driver & order-form fixes — agent `fix-driver-order`
**Files:** `client/src/pages/Driver.tsx`, `client/src/components/SignaturePad.tsx`,
`client/src/pages/Order.tsx` (Field helper only).
**Findings:** P0 #6 (Start delivery: await + pending/disabled + error toast — kills the
double-fire 409-into-the-void), P0 #7 (signature flow: either auto-capture on draw-end or a
visible "tap Capture signature" hint while Confirm is disabled — pick whichever the SignaturePad
API makes honest, audit notes `dirty` vs `signature` at SignaturePad.tsx:61), P0 #5 (Order.tsx
`Field` label trap: caption must not be a `<label>` wrapping non-labelable children — reuse the
`htmlFor` split already present for combobox fields; the URGENCY caption must become click-inert).
**Verification:** gates; live: double-POST start-delivery → one transition + visible error on the
second; clicking the URGENCY caption changes nothing; POD flow completable with the hint visible.

### Task 1C: Reports, nav & identity fixes — agent `fix-reports-nav`
**Files:** `client/src/pages/Reports.tsx`, `client/src/App.tsx`, `client/index.html`,
`docs/UX-FLOWS.md` + `docs/FEATURES.md` rows for anything retired.
**Findings:** P0 #4 (breakdown prints all four counters incl. `household_confirmations` — must
visibly sum to the hero), P1 F **decision: label, don't hide** (cost-approvals card gets the same
`synthetic` provenance badge as the cost cards + "design preview — decisions aren't saved yet"
line), P0 #9 + P1 A **decision: retire** (remove the tokenless `/vendor-portal` nav link AND the
`/vendor` dispatcher-board nav entry; keep both routes reachable by URL; dispatcher role's nav
points at the phones/portal story per UX-FLOWS — update both docs), P1 D (favicon: an inline SVG
data-URI in `client/index.html` — coral pill motif, no binary assets; verify `<title>` present).
**Verification:** gates; `/reports` breakdown sums exactly to the hero against a live
`/api/reports/summary`; nav for each role contains no dead ends; favicon renders in the built
`dist/index.html`.

- [ ] **1.1** Fire 1A/1B/1C in parallel (worktrees, opus, verify-first briefs quoting the finding
      details from `docs/UX-AUDIT.md`).
- [ ] **1.2** Merge each on landing; combined gates after each merge.
- [ ] **1.3** Strike fixed findings in `docs/UX-AUDIT.md` (main session, inline).
- [ ] **1.4** Pull/merge origin → push wave 1.

---

## Wave 2 — Global loop closing (sequential after wave 1; files overlap wave 1's)

**Authority: `docs/GLOBAL-LOOP-CLOSING-SPEC.md` verbatim — its lane sequence (1a → 1c → 2 → 1b
→ 3 → 4), its cut order, and its §0 deviations.** The spec proved the lanes are sequential
(shared files), so wave 2 runs as TWO SEQUENTIAL agents, second fired only after the first merges:

### Task 2A: Narration + acknowledgment — agent `loops-narration` (spec lanes 1a, 1c, 1b)
`client/src/lib/narration.ts` pure module with `tests/narration.test.ts` (React-free, DOM-free,
relative imports — the vitest config binds this, spec §0.2); the two-phase decision
(`isNarratableType()` gate before any fetch; 250ms debounced snapshot enrichment — client-side
lookup ONLY, the spec's PHI argument forbids widening the SSE payload); the
`expectedEvents.ts` suppression registry (register BEFORE the POST — the broadcast wins the
response race, spec §0); rate-cap/collapse; ack pulse with `prefers-reduced-motion` + the
DESIGN-SYSTEM.md persistent-vs-transient amendment; `?quiet=1` via sessionStorage; silent on
phone sims + PortalShell. Includes the spec's 13 bolded no-`.catch` mutation fixes that fall in
its lane files.

### Task 2B: Handoffs + front door + docs — agent `loops-handoffs` (spec lanes 2, 3, 4)
The spec's ~20-call-site action→landing table (location `state` one-shot highlight with the 10s
staleness guard, consume-once, scroll-into-view, opens the `later` collapse when needed);
`client/src/lib/brand.ts` (`APP_NAME` placeholder `"BetterRX DME"`, `APP_PROMISE` from the thesis
register); `client/src/lib/surfaces.ts` extraction (`homeFor(roleId)`, shared by landing + account
menu); `Landing` at top-level `<Routes>` OUTSIDE Shell; doc updates (UX-FLOWS, FEATURES, SLIDES
show-off line, DESIGN-SYSTEM) and remaining no-`.catch` fixes in its lane files.

- [ ] **2.1** Confirm spec on disk and pushed; fire 2A (and 2B per the disjointness rule).
- [ ] **2.2** Merge, gates, strike the loop-closing items from the audit/punch lists.
- [ ] **2.3** Pull/merge origin → push wave 2.

---

## Wave 3 — P1/P2 sweep (one agent, verify-first)

### Task 3: Remaining audit findings — agent `sweep-p1p2`
Everything in `docs/UX-AUDIT.md` P1/P2 not already fixed by waves 1–2 or by teammates, in the
audit's own order, EXCEPT: anything requiring new dependencies, server schema changes, or a
design decision not recorded in this plan (park those with a note). Explicitly included: the
phone-sim 14px composer auto-zoom fix (`font-size` ≥16px on mobile inputs), `break-words` on
message bubbles, scorecard sample-size guard, remaining a11y labels. Explicitly excluded: making
cost-approvals persist (labeled in 1C; wiring it is post-hackathon).
**Verification:** gates + a written already-fixed/skipped/fixed table per finding.

- [ ] **3.1** Fire, merge, gates, strike findings, push.

---

## Wave 4 — Re-verification & morning report

- [ ] **4.1** Agent `e2e-reverify`: rerun the full three-scenario walkthrough (same method as
      `docs/E2E-WALKTHROUGH.md`, isolated DB/port, no source edits) against the changed UI —
      demo-script beats must still be true click-for-click, incl. the new landing page, narration
      toasts (and that `?quiet=1` silences them), and the retired nav entries. Output: updated
      `docs/E2E-WALKTHROUGH.md` verdict + punch list.
- [ ] **4.2** If 4.1 finds regressions: one targeted fix agent per regression (max 2 rounds),
      re-verify, else revert the offending merge.
- [ ] **4.3** Main session: final gates, reseed full, confirm dev server healthy for the morning.
- [ ] **4.4** Final pull/merge → push everything; write the morning report (waves, strikes,
      parks, gate results, anything teammates pushed overnight that needs Angel's eyes).

## Parked by design (morning decisions, not overnight work)

- Product name (APP_NAME placeholder ships; renaming is one constant + slide 1).
- Cost-approvals persistence (labeled honest overnight; real wiring is post-hackathon).
- Any teammate-conflict ambiguity encountered overnight.
