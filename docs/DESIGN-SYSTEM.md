# Design System — BetterRX DME

> **This is the visual source of truth.** Every frontend surface should look like it belongs in the
> BetterRX product family (see [betterrx.com/technology](https://www.betterrx.com/technology)). Build with
> **shadcn/ui** components themed with the tokens below. When in doubt, open the reference:
>
> **▶ Rendered reference:** [`docs/design/hospice-board-reference.html`](./design/hospice-board-reference.html) — open in a browser.
> **Live artifact (board):** https://claude.ai/code/artifact/50c86f0a-c003-4ce9-a6cb-3c5b81c9e4bd
>
> **▶ Screen gallery:** [`docs/design/screens-gallery.html`](./design/screens-gallery.html) — order form, vendor status page, driver POD, vendor portal, DON reports.
> **Live artifact (gallery):** https://claude.ai/code/artifact/29646341-54a2-47f5-bcbf-585f57ab1a38
>
> *The committed `.html` files are the source of truth (self-contained, work offline). The claude.ai
> artifact URLs are the rendered versions — a future agent can `WebFetch` them, or re-render by editing
> the HTML and re-publishing. To view all your artifacts, see the artifacts gallery on claude.ai.*

## The feel (in one line)

Light, warm, and roomy — **coral + navy on white**, big **rounded-bold** headings, generous whitespace,
nothing crowded. Friendly and human (it's hospice), but a working clinical tool: urgency reads instantly.

## Palette

| Token | Hex | Role | shadcn var |
|---|---|---|---|
| **Coral** (primary) | `#E27B5E` | CTAs, logo, eyebrows, brand accents | `--primary` |
| Coral deep (hover) | `#D2694C` | primary hover | `--primary` hover |
| Coral tint | `#FBEFEA` | the "needs attention" panel, warn wash | — |
| **Navy** (secondary) | `#2C3A49` | dark buttons, "in motion" status, avatars | `--secondary` |
| Navy deep | `#22303D` | navy hover | — |
| **At-risk red** | `#CB3E3A` | will-miss-deadline, overdue (distinct from coral) | `--destructive` |
| **Success green** | `#3E9C6B` | delivered / picked up / verified | — (custom) |
| Background | `#F7F5F3` | page (warm off-white) | `--background` |
| Card / surface | `#FFFFFF` | cards | `--card` |
| Ink / foreground | `#263240` | headings, primary text | `--foreground` |
| Muted foreground | `#5C6B75` | secondary text | `--muted-foreground` |
| Faint | `#93A0AA` | order IDs, timestamps | — |
| Border | `#EBE7E3` | hairlines, card borders | `--border` |

**Semantic status color** (used on the card status "spine" and legend): red `#CB3E3A` = will miss a
deadline / overdue · navy `#2C3A49` = in motion (accepted, on the truck) · green `#3E9C6B` = done, with
proof · neutral `#E7EBEE` = ordered.

## Typography

- **Display** (headings, big counts, patient names): `ui-rounded, "SF Pro Rounded", system-ui, sans-serif`,
  heavy weights (**750–800**), tight tracking (`-0.02em`). This is the friendly rounded-bold personality
  from BetterRX's headlines.
- **Body / UI**: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- **Eyebrows**: coral, **UPPERCASE**, `font-weight: 800`, `letter-spacing: 0.14em`.
- **Numbers** (order IDs, ETAs, counts): `font-variant-numeric: tabular-nums`.
- No serif. Min 14px body on mobile.

## Shape, spacing, motion

- **Radius**: cards `16–18px`, panels `24px`, buttons `11px`, chips/pills full. shadcn `--radius: 14px`.
- **Whitespace is a feature**: page padding ~44px, ~56–68px between major sections, 22–24px card padding,
  18–20px gaps. Never crowd.
- **Touch targets ≥ 44×44px** (`py-2.5 px-4.5`), mobile-first.
- **Shadow**: soft — `0 1px 2px rgba(38,50,64,.04), 0 14px 34px -20px rgba(38,50,64,.20)`.
- **Motion**: restrained. One *persistent* live signal (the at-risk pulse dot) and one *transient*
  one: a 1.6s row acknowledgment when something changes under you. Nothing else animates. Respect
  `prefers-reduced-motion`.

## Signature components (the anatomy to reuse)

- **Status spine** — every order card has a 6px colored left rail encoding status at a glance (chart-tab
  motif). Red / navy / green / neutral per the semantic colors above.
- **"Needs attention" panel** — the board's hero. A **coral-tinted rounded panel with white cards on it**
  (BetterRX's signature "white UI card on a coral block" move). A big rounded-bold red count + one-line
  lede, then the short list of orders that need a decision. Triage leads; the full board sits below.
- **Evidence badge** — every status is tagged **Verified** (green — driver photo + signature) vs
  **Reported** (navy-grey — the vendor said so by text). A vendor's text must never render like proof.
- **Buttons** — coral primary, navy secondary, white/ghost tertiary; all rounded.
- **Coral pill logo** — `betterRX` wordmark in a coral rounded pill; product nav (Pharmacy · **DME** · Reports)
  with the active tab underlined in coral. This app is the **DME module inside BetterRX**, not a separate product.

## Plain-English status vocabulary (never show raw state names)

`ordered`→"Ordered" · `dispatched`→**"Accepted"** · `in_transit`→**"On the truck"** · `delivered`→
"Delivered" · `pickup_pending`→**"Pickup pending"** · `pickup_overdue`→**"Pickup overdue"** ·
`picked_up`→"Picked up" · `cancelled`→"Cancelled". Risk reasons are human sentences
("Beehive is 62% on-time for beds on Fridays"), never `key=value`. Family-adjacent copy stays respectful.

## How to apply it (for agents)

1. Use **shadcn/ui** primitives (Button, Card, Badge, Dialog, Table, Tabs, Select, Input, Checkbox, Sonner).
   Theme them with the tokens above (mapped to shadcn CSS variables in `client/src/index.css` `@theme`).
2. Build the custom atoms as thin wrappers/variants: `StatusPill`, `EvidenceBadge`, `RiskBadge`,
   `ConditionChecklist`, `PersonaHeader` (see `docs/FRONTEND-TASKS.md` Lane 0).
3. Match the reference's **spacing and type weight**, not just its colors — the roominess and the
   rounded-bold headings are what make it read as BetterRX.
4. Open `docs/design/hospice-board-reference.html` and compare your surface against it before committing.
   More screen references: `docs/design/screens-gallery.html` (order form, vendor status page, driver POD,
   vendor portal, DON reports).

## ⚠️ shadcn/ui conventions & Foundation handoff — READ BEFORE BUILDING UI

The Foundation lane is done and on `main`. If you're building any frontend, follow these or you'll fight it:

- **DO NOT re-run `npx shadcn init` / `add`.** On Tailwind v4 the CLI clobbers `client/src/index.css`,
  scaffolds a second project, and expects a `package.json` in the client dir (ours is root-level). The
  new-york Radix primitives were **hand-authored** into `client/src/components/ui/` (button, card, badge,
  dialog, input, select, checkbox, table, tabs, sonner, skeleton, separator, avatar, tooltip). **Add new
  primitives by hand** following the existing files, or ask the Foundation author.
- **Legacy `client/src/components/ui.tsx`** (old Badge/Button/Card) is still imported by
  `OrderCard`/`Hospice`/`Vendor`/`Driver`. **Migrate your lane's pages to the shadcn primitives** as part
  of your work; don't add *new* usages of the legacy file.
- **Atoms** (import from `@/components/...`): `StatusPill state={OrderState}`, `EvidenceBadge verified`,
  `RiskBadge score` (exports `RISK_THRESHOLD=70`), `ConditionChecklist value onChange`
  (value = `{clean,functional,patient_ready}` = the upstream `PodCondition` → pass straight to `POST /pod`),
  `PersonaHeader persona title`, `EmptyState`.
- **Hook:** `usePortal(token)` from `@/hooks/usePortal` → `{vendor, orders, confirm, setEta, decline, reload}`,
  SSE-refetching. Shared by the vendor status page and the portal.
- **Mocks** (`@/lib/mocks`, each swaps to a real fetch later): `mockVendorInventory`, `mockUnitLocations`,
  `mockHcpcsPricing`, `mockPatientCostOfCare`, `mockApprovals` + `COST_APPROVAL_THRESHOLD_USD`,
  `mockEvidenceSource`. **Use the REAL `ReportSummary`/`VendorScorecard` server endpoints for scorecards** —
  mocks are only for the cost-of-care + approvals gaps.
- **Token utility classes** available: `bg-success`/`text-success`, `bg-coral-tint`, `text-faint`,
  `bg-status-{ordered,motion,done,risk}` (card status spine).
- **Two distinct condition concepts — don't conflate:** the **driver POD** captures a 3-checkbox
  `PodCondition` (clean/functional/patient-ready) via `ConditionChecklist` → `POST /pod`; the **caregiver**
  channel is a separate **1–5 rating** (`ConditionReport`) that feeds the vendor scorecard.
