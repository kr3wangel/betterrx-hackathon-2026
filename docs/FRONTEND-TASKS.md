# Frontend Tasks — DME Coordination App

> **User-friendly summary:** Granular, claimable frontend tickets to take the app from "3 working
> surfaces" to a full demo across all five personas. Claim one by putting your name in the box
> `[ ]`→`[you]`. **Scope: frontend + design only — the frontend is NOT gated by the backend.** Where an
> endpoint doesn't exist, build against `client/src/lib/mocks.ts` (a typed adapter) so it swaps to a real
> fetch in one line. Full reasoning: `docs/FRONTEND-BUILD-PLAN.md`.
>
> **Rules of the road** (repo git agreement): work on `main`, `git pull --rebase` before pushing,
> `npm test` before every push — **never push red; main must always seed and boot**. Small, frequent,
> conventional commits (`feat(hospice): …`). UI stays test-free. Plain-English on screen — never raw
> state names. **Build the UI with [shadcn/ui](https://ui.shadcn.com/) (new-york style) primitives** —
> Card, Button, Badge, Dialog, Table, Tabs, Select, Input, Checkbox, Sonner, Skeleton — themed to the
> BetterRX tokens; our atoms are thin wrappers/variants over these. Sizes: **XS** ≈ 15–30m · **S** ≈ 30–60m ·
> **M** ≈ 1–3h · `(S1/S2/S3)` = demo scenario served.

**Backend already available to build against:** `GET /api/orders[?state=]`, `/api/orders/:id`,
`/api/patients`, `/api/vendors`, `/api/messages…`, `/api/escalations…`, `/api/driver/jobs`,
`POST /api/orders/:id/pod`, `POST /api/patients/:id/status` (nurse pickup), `POST /api/emr/patient-status`
(EMR fallback), and the **vendor portal**: `GET /api/portal/:token` + `POST …/orders/:id/confirm|eta|decline`.

---

## ⭐ FIRST PASS — do this before anything else

- [ ] **FE-00 · S · Running local baseline with dummy data** — the known-good starting point everyone
  builds on. **Do:** `npm install` → `npm run seed full` (loads synthetic patients/vendors/orders) →
  `npm run dev`; open `/hospice`, `/vendor`, `/driver` and confirm each renders with seeded data and SSE
  connects (green dot). Fix anything that blocks boot; add a one-line "how to run" note to `README` if
  missing. **Done when:** a fresh clone boots to three populated surfaces and `npm test` is green — this
  is the demo-able baseline main must never fall below.

---

## Lane 0 — Design + frontend foundation *(BLOCKING — lands before A–E)*

Owner: `[ ]`  ·  Owns the shared client files so no feature lane edits them. **Stack:** Tailwind v4 +
React 19 + Vite. **Adopt [shadcn/ui](https://ui.shadcn.com/)** as the component library — every atom
below is a thin wrapper/variant over a shadcn primitive, not a hand-rolled element.

- [ ] **FE-0.1 · S · Init shadcn/ui** — run `npx shadcn@latest init` (use a shadcn version that supports
  **Tailwind v4** — the theme is CSS-variables in `client/src/index.css`, **not** a `tailwind.config.ts`).
  Style: **"new-york"**. Configure `components.json` and the Vite path aliases (`@/components`, `@/lib`,
  `@/hooks`) so `@/components/ui/*` resolves in the client. **Done when:** `components.json` exists, aliases
  resolve, and the app still builds.
- [ ] **FE-0.2 · S · Add base shadcn components** — `npx shadcn@latest add button card badge dialog input
  select checkbox table tabs sonner skeleton separator avatar tooltip`. **Done when:** each lands under
  `client/src/components/ui/` and imports cleanly.
- [ ] **FE-0.3 · S · Map BetterRX tokens onto shadcn CSS variables** — in `client/src/index.css`, set
  shadcn's `--primary` (coral `#E27B5E`), `--secondary` (navy-slate `#2C3A49`), `--destructive`
  (`#CB3E3A`), `--background` (`#F7F5F3`), `--card` (`#FFFFFF`), `--muted`/`--muted-foreground`,
  `--border` (`#EBE7E3`), `--radius` (`14px`), plus the display-font stack (see Design system below).
  **Done when:** shadcn primitives render in BetterRX colors and the app builds.
- [ ] **FE-0.4 · S · Atoms as shadcn wrappers/variants** — `StatusPill` + `EvidenceBadge` = `Badge`
  variants (plain-English via `STATE_LABEL`/`STATE_TONE`; verified vs vendor-reported); `RiskBadge` =
  `Badge` (green/amber/red by score); `PersonaHeader` (surface title + persona label);
  `ConditionChecklist` = shadcn `Checkbox` rows (clean/functional/patient-ready); `EmptyState`. **Done
  when:** each renders in isolation over its shadcn primitive with the token colors.
- [ ] **FE-0.5 · XS · Fix plain-English leaks** — `client/src/lib/domain.ts` + review-queue: stop rendering
  raw enums (`needs_review`, `auto_applied`); confirm `STATE_LABEL` ("Accepted"/"On the truck"). **Done
  when:** no snake_case state/status appears on any screen.
- [ ] **FE-0.6 · M · Mock/adapter layer** — `client/src/lib/mocks.ts`: typed stand-ins for data the backend
  doesn't serve yet (serialized vendor inventory + per-unit location, CMS HCPCS pricing, cost-threshold
  approvals, message `evidence_source`), each a function that today returns mock data and later swaps to a
  fetch. **Done when:** typed, imported by a smoke usage, documented at top of file.
- [ ] **FE-0.7 · S · `usePortal(token)` hook** — wrap `GET /api/portal/:token` (+ confirm/eta/decline
  POSTs) as a shared hook for lanes C & E. **Done when:** returns `{vendor, orders, confirm, setEta,
  decline}` and refetches on SSE.
- [ ] **FE-0.8 · S · Routes + stub pages** — `client/src/App.tsx`: add routes/nav for `/order`, `/reports`,
  `/vendor-portal`, `/portal/:token`, and `/nurse`, each pointing at an empty stub page. **Done when:**
  every route resolves to a placeholder without errors.
- [ ] **FE-0.9 · XS · Persona labels on existing surfaces** — add `PersonaHeader` to `/hospice`
  ("Case Manager"), `/vendor` ("Dispatcher"), `/driver` ("Driver"). **Done when:** each surface names its persona.

---

## Lane A — Case manager / hospice board *(highest value; ~70% of scoring)*

Owner: `[ ]`  ·  Owns `client/src/pages/Hospice.tsx`, `client/src/components/OrderCard.tsx`.
**Build with shadcn/ui components** (Card, Button, Badge, Dialog, Table, Tabs, Select, Input, Checkbox, Sonner).

- [ ] **FE-A.1 · S · At-risk selector** — a `useMemo`/helper that derives orders that are at-risk (score
  ≥70) or about to miss a delivery/pickup deadline. **Done when:** returns a sorted list; unit-free.
- [ ] **FE-A.2 · S · "Needs attention" band** (S1) — render that list in a zone above the columns, most
  urgent first. **Done when:** the seeded at-risk order (DME-10305/1042) shows at top.
- [ ] **FE-A.3 · XS · At-risk card treatment** (S1) — `border-red-400 ring-1 ring-red-200` when score ≥70.
- [ ] **FE-A.4 · S · Risk reason on card** (S1) — show the human-sentence reason(s) inline in `text-red-700`.
  **Done when:** "Vendor is 72% on-time… deadline in 16h" reads on the card.
- [ ] **FE-A.5 · S · Escalation banner** (S1) — banner at the top when an open escalation exists, with its
  reason. **Done when:** appears for the seeded escalation.
- [ ] **FE-A.6 · S · Vendor-swap polish** (S1) — swap control resets order to Ordered and surfaces the new
  outbound SMS. **Done when:** swap flips the card live via SSE.
- [ ] **FE-A.7 · M · Evidence badges on timeline** (S1, S3) — tag each message/event **[VERIFIED]** (POD) vs
  **[VENDOR-REPORTED]** (text/portal tap) with `EvidenceBadge`; a vendor claim doesn't clear an at-risk
  flag inside the deadline window — only POD or a case-manager action does. **Done when:** both badge
  types show and the "text doesn't clear risk" rule is visible.
- [ ] **FE-A.8 · S · POD thumbnails on card** (S1, S2) — show photo/signature (`/api/pods/…`) + timestamp +
  condition on the expanded card. **Done when:** a delivered order shows its proof.
- [ ] **FE-A.9 · XS · Review-queue pane polish** (S3) — plain-English approve/reject, no raw enums.

---

## Lane B — Admissions / ordering nurse

Owner: `[ ]`  ·  Owns new `client/src/pages/Order.tsx`, `client/src/pages/Nurse.tsx`.
**Build with shadcn/ui components** (Card, Button, Badge, Dialog, Table, Tabs, Select, Input, Checkbox, Sonner).

- [ ] **FE-B.1 · S · Order form scaffold** — `/order` layout + fields shell (patient, equipment, qty,
  urgency, target date, vendor), phone + desktop, big touch targets. **Done when:** renders, no submit yet.
- [ ] **FE-B.2 · S · Order form data + submit** — patient lookup from `/api/patients`, HCPCS from `CATALOG`,
  vendor from `/api/vendors` → `POST /api/orders`. **Done when:** a new order appears on `/hospice` live,
  sub-60s to fill.
- [ ] **FE-B.3 · S · Nurse pickup surface** (S2) — `/nurse` phone view: pick a patient → one-tap "discharged
  / passed away" → `POST /api/patients/:id/status` (primary trigger). Respectful copy. **Done when:** the
  tap auto-creates pickups on `/hospice`/`/driver`.

---

## Lane C — Driver + no-login vendor status page

Owner: `[ ]`  ·  Owns `client/src/pages/Driver.tsx`, POD components, new `client/src/pages/VendorStatus.tsx`.
**Build with shadcn/ui components** (Card, Button, Badge, Dialog, Table, Tabs, Select, Input, Checkbox, Sonner).

- [ ] **FE-C.1 · S · Condition checklist on POD** (S1, S2) — add `ConditionChecklist` to POD capture; submit
  with photo+signature on `POST /api/orders/:id/pod`. **Done when:** the 3 attestations persist and show.
- [ ] **FE-C.2 · XS · Phone-LAN access** — `host: true` in `client/vite.config.ts`. **Done when:** `/driver`
  + camera load from a phone on the same wifi.
- [ ] **FE-C.3 · XS · Respectful pickup copy** — grieving-family note on pickup jobs. **Done when:** copy reads on a pickup job.
- [ ] **FE-C.4 · S · Vendor status page scaffold** (S3) — `/portal/:token` via `usePortal`: list the vendor's
  orders, no login. **Done when:** a valid token shows the vendor's live orders.
- [ ] **FE-C.5 · S · One-tap status actions** (S3) — big **Accept / On the way / Delivered** buttons + ETA
  entry wired to `confirm|eta|decline`. **Done when:** a tap moves the order on `/hospice` live.

---

## Lane D — Director of Nursing reports

Owner: `[ ]`  ·  Owns new `client/src/pages/Reports.tsx`.
**Build with shadcn/ui components** (Card, Button, Badge, Dialog, Table, Tabs, Select, Input, Checkbox, Sonner).

- [ ] **FE-D.1 · S · Reports scaffold + persona header** — `/reports` layout with section slots. **Done when:** renders empty sections.
- [ ] **FE-D.2 · M · Vendor scorecards** — on-time by equipment × weekday (`vendor_stats` via `/api/vendors`),
  open-escalation age, pickup latency. **Done when:** the seeded vendor spread (v2 79%, v1 62% Fri beds) shows.
- [ ] **FE-D.3 · M · Cost-of-care widget** — DME spend beside med spend per patient using mock CMS HCPCS
  pricing (`lib/mocks.ts`). **Done when:** a patient shows both spends and a total.
- [ ] **FE-D.4 · S · "Phone calls that never happened" counter** — count auto-applied vendor updates +
  auto-triggered pickups. **Done when:** the number renders and updates live.
- [ ] **FE-D.5 · M · Cost-threshold approval surface** — approval-pending state (shared atom + mock);
  DON approve/deny. **← gap not in prior docs.** **Done when:** an above-threshold order shows pending → approved.

---

## Lane E — DME vendor portal *(user-requested)*

Owner: `[Angel]`  ·  Owns new `client/src/pages/VendorPortal.tsx`. Shares `usePortal(token)` with Lane C.
**Build with shadcn/ui components** (Card, Button, Badge, Dialog, Table, Tabs, Select, Input, Checkbox, Sonner).

- [x] **FE-E.1 · S · Portal home** — `GET /api/portal/:token`: the vendor's live orders + delivery/pickup
  queue in one no-login place. **Done when:** orders + queue render for a token.
- [x] **FE-E.2 · M · Equipment & location view** — "all my equipment and where each piece is": serialized
  inventory (in stock / out for delivery / at patient / overdue for pickup) + per-unit location tied to
  orders, enriching real order data with mocked serialized inventory (`lib/mocks.ts`). **Done when:** each
  unit shows a status + location.
- [x] **FE-E.3 · S · SLA vs actual** — same-day STAT/urgent, 24h routine (FAQ default) vs actuals. **Done when:** each order shows on-time/late against its SLA.

---

## De-scoped for the demo
- **IVR / press-1 voice channel** — shelved by team decision (commit `b1497a1`); `docs/IVR-SIM-SPEC.md`
  remains a production-path reference only.

## Definition of done (every ticket)
`npm test` green · `npm run typecheck` clean · surface renders in `npm run dev` · plain-English on screen ·
its demo-scenario beat walks end-to-end · committed to `main`, small and rebased.
