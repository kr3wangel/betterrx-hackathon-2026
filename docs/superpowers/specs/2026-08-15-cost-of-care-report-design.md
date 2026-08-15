# In-depth Cost of Care report — design

## Problem

The Reports page (`/reports`) has a `Cost of care` card that shows **one** patient at a
time via a dropdown: a Medication spend bar (synthetic), a DME spend bar (real CMS
pricing), and a total. A Director of Nursing cannot see the whole panel at once, cannot
search for a patient, and cannot compare patients. We want a dedicated in-depth view.

## Goal

A dedicated, searchable, multi-patient cost-of-care page reachable from the existing
card. No backend or schema change — the data is already derivable client-side.

## Non-goals

- No new API endpoint, DB column, or event type.
- No persistence of any sort (matches the card, which is already a design preview).
- No new nav-bar item; the page is reached from the card (and by URL).
- No changes to the cost math itself (`mockPatientCostOfCare`).

## Route & entry point

- New page component `client/src/pages/CostOfCareReport.tsx`.
- New route `/reports/cost-of-care`, rendered inside the Shell (global nav), added to
  the `<Routes>` block in `App.tsx`. Route stays unguarded, matching the project
  convention that every screen is URL-reachable mid-demo.
- The existing `CostOfCare` card gains a `View all patients →` button that
  `navigate('/reports/cost-of-care')`. No `surfaces.ts` change.

## Data

The page fetches `/api/orders` + `/api/patients` via `useLive` (auto-refreshes on every
SSE event like the rest of the app). It keeps only patients that have at least one order
(an empty cost row helps no one) and maps `mockPatientCostOfCare(patient.id, orders)`
over them — the same derivation the card already trusts.

Over-threshold flag: a patient is flagged when any of their orders' monthly DME cost
clears `COST_APPROVAL_THRESHOLD_USD` ($150/mo), reusing the existing `mockHcpcsPricing`
semantics behind `mockApprovals`.

## Layout

1. `PersonaHeader` — persona "Director of Nursing", title "Cost of care", with a
   `Back to reports` button (`navigate('/reports')`).
2. **Portfolio totals** strip — total cost of care, DME total (CMS badge), med total
   (synthetic badge), patient count, and count over the $150/mo threshold. Provenance
   badges are preserved so a real figure and an invented one never look alike.
3. **Search** input — case-insensitive filter on patient name.
4. **Sortable table** — columns: Patient · DME · Med · Total · flag (⚠ when
   over-threshold). Default sort: total descending. Clicking a column header re-sorts.
5. **Drill-down** — clicking a row toggles an inline expansion showing that patient's
   med/DME `SpendBar` breakdown (the same bars the card shows).
6. Empty states: "No patient DME spend yet" (no data) and a "no match" state when a
   search returns nothing.

## Reuse / small cleanup

`SpendBar` is currently a private function inside `Reports.tsx`. Extract it (with its
`SpendBarSource` provenance-badge logic) to `client/src/components/CostSpendBar.tsx` and
import it in both `Reports.tsx` and the new page, so the drill-down renders the exact
same provenance-aware bar rather than a copy. This avoids the copy-paste drift the
codebase explicitly warns about (e.g. the duplicated `RISK_THRESHOLD` gotcha). The
`usd`/`pct` formatting helpers are trivial; the new page keeps its own local copies
consistent with the rest of `Reports.tsx` rather than introducing a shared util for
two-line functions.

## Docs to update (same change)

- `docs/UX-FLOWS.md` — new `/reports/cost-of-care` route and the card→page `navigate()`
  arrow, then re-render the mermaid to confirm it parses.
- `docs/FEATURES.md` — new surface entry; re-run its verify block and update the count.

## Testing

UI and routes are test-free per project convention. Verification is
`npm run typecheck && npm test` (both green) before rebase-merging to `main`, so main
stays seedable and bootable.
